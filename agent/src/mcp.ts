import { writeSync } from 'node:fs';
import { MCP_ORIGINATOR } from './constants';
import { isAgentError } from './errors';
import { loadConfig } from './config';
import { startHttpServer } from './http';
import { logError, logInfo, redact } from './redact';
import { getRuntime } from './runtime';

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

const tools: Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}> = [
  {
    name: 'wallet_info',
    description: 'Show chain, deposit address, identity key, balance (sats), and UTXO count.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => (await getRuntime()).walletInfo(),
  },
  {
    name: 'balance',
    description: 'Return spendable BSV balance in satoshis from the default basket.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const info = await (await getRuntime()).walletInfo();
      return { satoshis: info.balance, utxos: info.utxos };
    },
  },
  {
    name: 'address',
    description: 'Return the primary BRC-29 deposit address (prefix 1sat).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const info = await (await getRuntime()).walletInfo();
      return { address: info.address, identityKey: info.identityKey };
    },
  },
  {
    name: 'send_bsv',
    description: 'Send satoshis to a Bitcoin address. Subject to spend caps in ~/.yours-agent/policy.json.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Destination Bitcoin address' },
        satoshis: { type: 'integer', description: 'Amount in satoshis', minimum: 1 },
      },
      required: ['to', 'satoshis'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const to = String(args.to ?? '');
      const satoshis = Number(args.satoshis);
      if (!to) throw new Error('to is required');
      if (!Number.isFinite(satoshis) || satoshis < 1) throw new Error('satoshis must be a positive integer');
      return (await getRuntime()).sendBsv(to, satoshis);
    },
  },
  {
    name: 'list_outputs',
    description: 'List wallet outputs in a BRC-100 basket (default: default).',
    inputSchema: {
      type: 'object',
      properties: {
        basket: { type: 'string', default: 'default' },
        limit: { type: 'integer', default: 20 },
        tags: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
    handler: async (args) =>
      (await getRuntime()).call(
        'listOutputs',
        {
          basket: String(args.basket ?? 'default'),
          limit: Number(args.limit ?? 20),
          tags: args.tags,
          include: 'locking scripts',
        },
        MCP_ORIGINATOR,
      ),
  },
  {
    name: 'list_actions',
    description: 'List recent BRC-100 wallet actions (transaction history).',
    inputSchema: {
      type: 'object',
      properties: {
        labels: { type: 'array', items: { type: 'string' } },
        limit: { type: 'integer', default: 20 },
      },
      additionalProperties: false,
    },
    handler: async (args) =>
      (await getRuntime()).call(
        'listActions',
        { labels: Array.isArray(args.labels) ? args.labels : [], limit: Number(args.limit ?? 20) },
        MCP_ORIGINATOR,
      ),
  },
  {
    name: 'get_budget',
    description: 'Show remaining spend budget (per-action, hourly, daily). Read-only; policy is not writable via MCP.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => (await getRuntime()).getBudget(),
  },
  {
    name: 'create_action',
    description: 'BRC-100 createAction. Pass the JSON args object (description, outputs, options, ...).',
    inputSchema: {
      type: 'object',
      properties: {
        args: { type: 'object', description: 'CreateActionArgs' },
      },
      required: ['args'],
      additionalProperties: true,
    },
    handler: async (args) => {
      const createArgs = (args.args as object) ?? args;
      return (await getRuntime()).call('createAction', createArgs, MCP_ORIGINATOR);
    },
  },
  {
    name: 'sign_action',
    description: 'BRC-100 signAction for a previously created unsigned action.',
    inputSchema: {
      type: 'object',
      properties: { args: { type: 'object', description: 'SignActionArgs' } },
      required: ['args'],
      additionalProperties: true,
    },
    handler: async (args) => {
      const signArgs = (args.args as object) ?? args;
      return (await getRuntime()).call('signAction', signArgs, MCP_ORIGINATOR);
    },
  },
  {
    name: 'get_public_key',
    description: 'BRC-100 getPublicKey. Pass identityKey: true for the wallet identity key.',
    inputSchema: {
      type: 'object',
      properties: {
        identityKey: { type: 'boolean' },
        protocolID: { description: 'BRC-43 protocol ID' },
        keyID: { type: 'string' },
      },
      additionalProperties: true,
    },
    handler: async (args) => (await getRuntime()).call('getPublicKey', args, MCP_ORIGINATOR),
  },
  {
    name: 'encrypt',
    description: 'BRC-100 encrypt plaintext for a protocol/keyID/counterparty.',
    inputSchema: {
      type: 'object',
      properties: {
        plaintext: { description: 'Byte array or number[]' },
        protocolID: {},
        keyID: { type: 'string' },
        counterparty: { type: 'string' },
      },
      additionalProperties: true,
    },
    handler: async (args) => (await getRuntime()).call('encrypt', args, MCP_ORIGINATOR),
  },
  {
    name: 'decrypt',
    description: 'BRC-100 decrypt ciphertext for a protocol/keyID/counterparty.',
    inputSchema: {
      type: 'object',
      properties: {
        ciphertext: {},
        protocolID: {},
        keyID: { type: 'string' },
        counterparty: { type: 'string' },
      },
      additionalProperties: true,
    },
    handler: async (args) => (await getRuntime()).call('decrypt', args, MCP_ORIGINATOR),
  },
];

function result(id: JsonRpcRequest['id'], extra: Record<string, unknown>) {
  return { jsonrpc: '2.0', id: id ?? null, ...extra };
}

/** Cursor/MCP SDK uses LSP-style Content-Length; tests and curl use NDJSON. */
export type McpWireFormat = 'ndjson' | 'lsp';

export function encodeMcpFrame(payload: unknown, format: McpWireFormat): string {
  const json = JSON.stringify(payload);
  if (format === 'lsp') {
    const bytes = Buffer.from(json, 'utf8');
    return `Content-Length: ${bytes.length}\r\n\r\n${json}`;
  }
  return json + '\n';
}

export function extractMcpFrames(buffer: string): { frames: string[]; rest: string; format?: McpWireFormat } {
  const frames: string[] = [];
  let rest = buffer;
  let format: McpWireFormat | undefined;

  while (rest.length > 0) {
    const trimmedStart = rest.replace(/^[\r\n]+/, '');
    if (trimmedStart.length !== rest.length) {
      rest = trimmedStart;
      continue;
    }

    if (/^content-length:/i.test(rest)) {
      let headerEnd = rest.indexOf('\r\n\r\n');
      let sep = 4;
      if (headerEnd === -1) {
        headerEnd = rest.indexOf('\n\n');
        sep = 2;
      }
      if (headerEnd === -1) break;
      const header = rest.slice(0, headerEnd);
      const match = header.match(/content-length:\s*(\d+)/i);
      if (!match) {
        rest = rest.slice(headerEnd + sep);
        continue;
      }
      const len = Number(match[1]);
      const start = headerEnd + sep;
      if (rest.length < start + len) break;
      frames.push(rest.slice(start, start + len));
      rest = rest.slice(start + len);
      format = 'lsp';
      continue;
    }

    const nl = rest.indexOf('\n');
    if (nl === -1) break;
    const line = rest.slice(0, nl).trim();
    rest = rest.slice(nl + 1);
    if (line) {
      frames.push(line);
      format ??= 'ndjson';
    }
  }

  return { frames, rest, format };
}

export async function dispatchMcp(msg: JsonRpcRequest): Promise<unknown> {
  const { method, params, id } = msg;
  logInfo(`MCP ${method ?? 'unknown'}${id !== undefined ? ` id=${id}` : ''}`);
  if (method === 'initialize') {
    return result(id, {
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'yours-agent', version: '0.1.0' },
      },
    });
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return null;
  }
  if (method === 'ping') {
    return result(id, { result: {} });
  }
  if (method === 'tools/list') {
    return result(id, {
      result: {
        tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      },
    });
  }
  if (method === 'tools/call') {
    const call = (params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    const tool = tools.find((t) => t.name === call.name);
    if (!tool) {
      return result(id, { error: { code: -32601, message: `Unknown tool: ${call.name}` } });
    }
    try {
      const output = await tool.handler(call.arguments ?? {});
      return result(id, {
        result: {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        },
      });
    } catch (err) {
      const payload = isAgentError(err) ? err.toJSON() : { status: 'error', description: redact(err) };
      return result(id, {
        result: {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          isError: true,
        },
      });
    }
  }
  return result(id, { error: { code: -32601, message: `Unknown method: ${method}` } });
}

export async function runMcp(): Promise<void> {
  const config = loadConfig();
  // Do not open the wallet before initialize/tools/list — Cursor discovery must stay fast
  // and must not block on bun-sqlite if another sidecar already holds ~/.yours-agent/data.
  if (process.env.YOURS_AGENT_HTTP !== '0') {
    try {
      const server = startHttpServer(config.httpHost, config.httpPort);
      logInfo(`BRC-100 JSON API listening on http://${server.hostname}:${server.port}`);
    } catch (err) {
      logError('HTTP listen skipped (port may be in use)', err);
    }
  }
  logInfo('MCP stdio ready');

  const decoder = new TextDecoder();
  let buffer = '';
  let wireFormat: McpWireFormat = 'ndjson';

  const writeReply = (payload: unknown) => {
    writeSync(1, encodeMcpFrame(payload, wireFormat));
  };

  const handleFrame = async (frame: string) => {
    let parsed: JsonRpcRequest;
    try {
      parsed = JSON.parse(frame) as JsonRpcRequest;
    } catch {
      logError('Invalid MCP JSON frame');
      return;
    }
    try {
      const reply = await dispatchMcp(parsed);
      if (reply && parsed.id !== undefined) {
        writeReply(reply);
      }
    } catch (err) {
      logError('MCP dispatch failed', err);
      if (parsed.id !== undefined) {
        writeReply(result(parsed.id, { error: { code: -32603, message: 'Internal error' } }));
      }
    }
  };

  for await (const value of Bun.stdin.stream()) {
    buffer += decoder.decode(value, { stream: true });
    const extracted = extractMcpFrames(buffer);
    buffer = extracted.rest;
    if (extracted.format) wireFormat = extracted.format;
    for (const frame of extracted.frames) {
      await handleFrame(frame);
    }
  }
}

if (import.meta.main) {
  runMcp().catch((err) => {
    logError('MCP failed', err);
    process.exit(1);
  });
}

