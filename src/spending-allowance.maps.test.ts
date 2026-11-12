import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SourceMapConsumer } from 'source-map';

for (const relative of [
  '@bsv/wallet-toolbox-client/out/index.client.mjs',
  '@bsv/wallet-toolbox-client/out/index.client.cjs',
  '@bsv/wallet-toolbox-client/out/index.client.d.mts',
  '@bsv/wallet-toolbox-client/out/index.client.d.cts',
  '@1sat/wallet/dist/permissions/manager.js',
  '@1sat/wallet/dist/permissions/manager.d.ts',
]) {
  test(`patched source map resolves new allowance logic and existing upstream code: ${relative}`, async () => {
    const path = resolve('node_modules', relative);
    const source = readFileSync(path, 'utf8');
    const lines = source.split('\n');
    const mapName = /sourceMappingURL=([^\r\n]+)/.exec(source)?.[1];
    expect(mapName).toBeDefined();
    const consumer = await new SourceMapConsumer(JSON.parse(readFileSync(resolve(dirname(path), mapName!), 'utf8')));
    try {
      const newLine = lines.findIndex((line) => line.includes('excludeActionReference')) + 1;
      const column = lines[newLine - 1].indexOf('excludeActionReference');
      const mapped = consumer.originalPositionFor({ line: newLine, column });
      expect(mapped.source).toContain('standing-allowance-patch/');
      expect(consumer.sourceContentFor(mapped.source!)?.split('\n')[mapped.line! - 1]).toContain(
        'excludeActionReference',
      );
      if (relative.endsWith('.mjs') || relative.endsWith('.cjs')) {
        for (const needle of [
          'basketPermissionTag(basket)',
          'vargs.fields, vargs.keyringRevealer === "certifier" ? vargs.certifier',
          'storageCert.verifier ?? storageCert.certifier',
          'const supplied = sourceTransactionForStorageInput(storageInput)',
        ]) {
          const line = lines.findIndex((value) => value.includes(needle)) + 1;
          const position = consumer.originalPositionFor({ line, column: lines[line - 1].indexOf(needle) });
          expect(position.source).toContain('standing-allowance-patch/');
          expect(consumer.sourceContentFor(position.source!)?.split('\n')[position.line! - 1]).toContain(needle);
        }
      }
      let upstream = 0;
      let changed = 0;
      let invalid: string | undefined;
      consumer.eachMapping((mapping) => {
        if (mapping.generatedLine > lines.length || mapping.generatedColumn > lines[mapping.generatedLine - 1].length) {
          invalid = `Generated location exceeds source: ${mapping.generatedLine}:${mapping.generatedColumn}`;
        }
        if (mapping.source?.includes('standing-allowance-patch/')) changed++;
        else if (mapping.source) upstream++;
      });
      expect(invalid).toBeUndefined();
      expect(upstream).toBeGreaterThan(100);
      expect(changed).toBeGreaterThan(0);
    } finally {
      consumer.destroy();
    }
  });
}
