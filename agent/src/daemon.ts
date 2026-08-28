import { loadConfig } from './config';
import { startHttpServer } from './http';
import { logError, logInfo } from './redact';
import { getRuntime } from './runtime';

export async function runDaemon(): Promise<void> {
  const config = loadConfig();
  await getRuntime();
  const server = startHttpServer(config.httpHost, config.httpPort);
  logInfo(`BRC-100 JSON API listening on http://${server.hostname}:${server.port}`);
}

if (import.meta.main) {
  runDaemon().catch((err) => {
    logError('daemon failed', err);
    process.exit(1);
  });
}
