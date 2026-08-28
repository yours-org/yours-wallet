import { describe, expect, test } from 'bun:test';
import { dispatchMcp, encodeMcpFrame, extractMcpFrames } from './mcp';

describe('MCP stdio protocol', () => {
  test('initialize and tools/list', async () => {
    const init = (await dispatchMcp({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    })) as { result: { serverInfo: { name: string } } };
    expect(init.result.serverInfo.name).toBe('yours-agent');

    const listed = (await dispatchMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' })) as {
      result: { tools: Array<{ name: string }> };
    };
    const names = listed.result.tools.map((t) => t.name);
    expect(names).toContain('wallet_info');
    expect(names).toContain('get_budget');
    expect(names).toContain('create_action');
  });

  test('extracts LSP Content-Length frames and NDJSON', () => {
    const init = { jsonrpc: '2.0', id: 1, method: 'initialize' };
    const lsp = encodeMcpFrame(init, 'lsp');
    const extracted = extractMcpFrames(lsp);
    expect(extracted.format).toBe('lsp');
    expect(extracted.frames).toEqual([JSON.stringify(init)]);
    expect(extracted.rest).toBe('');

    const nd = extractMcpFrames('{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    expect(nd.format).toBe('ndjson');
    expect(nd.frames).toHaveLength(1);
  });

  test('extracts two concatenated LSP frames', () => {
    const a = encodeMcpFrame({ jsonrpc: '2.0', id: 1, method: 'initialize' }, 'lsp');
    const b = encodeMcpFrame({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, 'lsp');
    const extracted = extractMcpFrames(a + b);
    expect(extracted.frames).toHaveLength(2);
    expect(JSON.parse(extracted.frames[1]).method).toBe('tools/list');
  });
});
