import { PrivateKey } from '@bsv/sdk';
import { loadConfig, saveConfig } from './config';
import { runDaemon } from './daemon';
import { envPassword, envWif, generateWif, savePrivateKey } from './keys';
import { runMcp } from './mcp';
import { installDefaultPolicyIfMissing } from './policy';
import { logInfo } from './redact';

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

async function init(args: string[]): Promise<void> {
  installDefaultPolicyIfMissing();
  const config = loadConfig();
  saveConfig(config);

  const generate = has(args, '--generate');
  const importWif = flag(args, '--wif') || envWif();
  const password = flag(args, '--password') || envPassword();

  if (!password) {
    throw new Error('Provide --password or set YOURS_AGENT_PASSWORD to encrypt the key file.');
  }

  let wif: string;
  if (importWif) {
    PrivateKey.fromWif(importWif);
    wif = importWif;
    logInfo('Imported WIF into encrypted keystore (value not logged).');
  } else if (generate || has(args, '--yes')) {
    wif = generateWif();
    logInfo('Generated a new identity key.');
  } else {
    throw new Error('Pass --generate to create a new key, or --wif <WIF> / PRIVATE_KEY_WIF to import.');
  }

  await savePrivateKey(wif, password);
  logInfo(`Wrote encrypted keystore and policy under YOURS_AGENT_HOME (default ~/.yours-agent). Chain: ${config.chain}`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'init':
      await init(rest);
      break;
    case 'daemon':
      await runDaemon();
      break;
    case 'mcp':
      await runMcp();
      break;
    default:
      console.error('Usage: bun src/cli.ts <init|daemon|mcp>');
      console.error('  init --generate|--wif <WIF>  [--password <pw>]');
      console.error('  daemon                       BRC-100 JSON API on 127.0.0.1:3321');
      console.error('  mcp                          MCP stdio (+ HTTP unless YOURS_AGENT_HTTP=0)');
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
