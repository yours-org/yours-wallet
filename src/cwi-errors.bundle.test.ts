import { expect, test } from 'bun:test';
import { build } from 'vite';
import { resolve, join } from 'node:path';
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

// Exercise the same bundler/minifier as the shipped extension. SDK Error.name
// derives from constructor.name and therefore differs after bundling.
test('minified production codec preserves stable SDK names and public recovery payloads', async () => {
  const entry = resolve('__cwi-errors-bundle-regression__.ts');
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'cwi-errors-regression',
        resolveId: (id) => (id === entry ? entry : undefined),
        load: (id) =>
          id === entry
            ? `
        import { serializeCwiError, reviveCwiError } from ${JSON.stringify(resolve('src/cwi-errors.ts'))};
        import { WERR_REVIEW_ACTIONS, WERR_INVALID_PARAMETER, WERR_INSUFFICIENT_FUNDS } from ${JSON.stringify(resolve('node_modules/@bsv/sdk/dist/esm/mod.js'))};
        export function run() {
          const errors = [new WERR_REVIEW_ACTIONS([{txid:'ab'.repeat(32),status:'failed'}], [], 'ab'.repeat(32), [1,2,255], ['ab'.repeat(32)+'.0']), new WERR_INVALID_PARAMETER('basket', 'a valid string'), new WERR_INSUFFICIENT_FUNDS(100, 5)];
          Object.assign(errors[0], { cleanupFailure: { operation: 'abortAction', status: 'unconfirmed', reference: 'AQID', message: 'Action is already terminal and cannot be aborted.', stack: 'private stack' } });
          return errors.map(error => ({ constructorName: error.constructor.name, wire: serializeCwiError(error), revived: reviveCwiError(JSON.parse(JSON.stringify(serializeCwiError(error)))) }));
        }
      `
            : undefined,
      },
    ],
    build: { write: false, minify: 'esbuild', lib: { entry, formats: ['es'] } },
  });
  const result = Array.isArray(output) ? output[0] : output;
  if (!('output' in result)) throw new Error('Expected a completed Vite bundle');
  const chunk = result.output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing bundled regression entry');
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'yours-cwi-codec-'));
  let values: any[];
  try {
    const file = join(directory, 'codec.mjs');
    writeFileSync(file, chunk.code);
    const compiled = await import(pathToFileURL(file).href);
    values = compiled.run();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  const names = ['WERR_REVIEW_ACTIONS', 'WERR_INVALID_PARAMETER', 'WERR_INSUFFICIENT_FUNDS'];
  expect(values.some((value: any, index: number) => value.constructorName !== names[index])).toBe(true);
  for (const [index, value] of values.entries()) {
    expect(value.wire.name).toBe(names[index]);
    expect(value.wire.code).toBe(names[index]);
    expect(value.revived.name).toBe(names[index]);
    expect(value.revived.code).toBe(names[index]);
  }
  for (const key of ['reviewActionResults', 'sendWithResults', 'txid', 'tx', 'noSendChange'])
    expect(values[0].revived[key]).toEqual(values[0].wire[key]);
  expect(values[0].revived.tx).toEqual([1, 2, 255]);
  expect(values[0].revived.cleanupFailure).toEqual({
    operation: 'abortAction',
    status: 'unconfirmed',
    reference: 'AQID',
    message: 'Action is already terminal and cannot be aborted.',
  });
  expect(values[1].revived.parameter).toBe('basket');
  expect(values[2].revived.totalSatoshisNeeded).toBe(100);
  expect(values[2].revived.moreSatoshisNeeded).toBe(5);
}, 30_000);
