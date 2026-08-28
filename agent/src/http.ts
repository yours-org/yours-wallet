import { AGENT_HTTP_METHODS, WALLET_METHODS } from './constants';
import { AgentError, isAgentError } from './errors';
import { logError, redact } from './redact';
import { getRuntime } from './runtime';

export type WalletCaller = (method: string, args: unknown, originator: string) => Promise<unknown>;

function originatorFrom(req: Request): string {
  return req.headers.get('Originator') || req.headers.get('Origin') || 'http://localhost';
}

async function readArgs(req: Request): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AgentError('ERR_JSON', 'Request body must be JSON', {}, 400);
  }
}

/** Agent-specific HTTP methods (identity BSM, deposit sync) — not BRC-100 WalletInterface. */
async function handleAgentMethod(method: string, args: unknown, originator: string): Promise<unknown> {
  const runtime = await getRuntime();
  const body = (args ?? {}) as Record<string, unknown>;
  if (method === 'signMessage' || method === 'signBsm') {
    const message = String(body.message ?? '');
    if (!message) throw new AgentError('ERR_JSON', 'message is required', {}, 400);
    return runtime.signMessage(message, originator);
  }
  if (method === 'syncAddresses') {
    return runtime.syncDeposits({
      prefix: body.prefix !== undefined ? String(body.prefix) : undefined,
      count: body.count !== undefined ? Number(body.count) : undefined,
      force: body.force === true,
    });
  }
  throw new AgentError('ERR_METHOD', `Unknown agent method: ${method}`, { method }, 404);
}

export async function handleWalletRequest(req: Request, caller?: WalletCaller): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === '/' || url.pathname === '/health') {
    return json({ status: 'ok', service: 'yours-agent' });
  }

  const method = url.pathname.replace(/^\//, '');
  const isWallet = WALLET_METHODS.includes(method as (typeof WALLET_METHODS)[number]);
  const isAgent = (AGENT_HTTP_METHODS as readonly string[]).includes(method);
  if (!isWallet && !isAgent) {
    return errorResponse(new AgentError('ERR_METHOD', `Unknown method: ${method}`, { method }, 404));
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse(new AgentError('ERR_METHOD', 'Use GET or POST', {}, 405));
  }

  try {
    const args = await readArgs(req);
    if (isAgent) {
      // Prefer injected caller for tests that stub agent methods the same way.
      if (typeof caller === 'function') {
        const result = await caller(method, args, originatorFrom(req));
        return json(result ?? {});
      }
      const result = await handleAgentMethod(method, args, originatorFrom(req));
      return json(result ?? {});
    }

    // Bun.serve's fetch is (req, server) — ignore a non-function second arg.
    const call =
      typeof caller === 'function'
        ? caller
        : async (m: string, a: unknown, originator: string) => {
            const runtime = await getRuntime();
            return runtime.call(m, a, originator);
          };
    const result = await call(method, args, originatorFrom(req));
    return json(result ?? {});
  } catch (err) {
    return errorResponse(err);
  }
}

export function startHttpServer(host: string, port: number): ReturnType<typeof Bun.serve> {
  const bindHost = host === 'localhost' || host === '127.0.0.1' ? host : '127.0.0.1';
  if (bindHost !== host) {
    logError(`Refusing to bind ${host}; using 127.0.0.1`);
  }
  return Bun.serve({
    hostname: bindHost,
    port,
    fetch: (req) => handleWalletRequest(req),
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

function errorResponse(err: unknown): Response {
  if (isAgentError(err)) {
    return json(err.toJSON(), err.httpStatus);
  }
  return json(
    {
      status: 'error',
      code: 'ERR_INTERNAL',
      description: redact(err),
    },
    500,
  );
}
