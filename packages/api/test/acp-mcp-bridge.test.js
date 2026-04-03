import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const { buildAcpMcpServers } = await import('../dist/domains/cats/services/agents/providers/acp-mcp-bridge.js');

test('buildAcpMcpServers includes project Claude MCP servers for stdio ACP agents', () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), 'acp-mcp-bridge-'));

  try {
    writeFileSync(
      join(workingDirectory, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
            cwd: '/tmp/workspace',
            env: { TOKEN: 123 },
          },
          'remote-http': {
            type: 'http',
            url: 'https://example.com/mcp',
          },
          'cat-cafe': {
            command: 'node',
            args: ['local-cat-cafe.js'],
          },
        },
      }),
    );

    const servers = buildAcpMcpServers({ agentCapabilities: { mcpCapabilities: { stdio: true } } }, {
      workingDirectory,
      callbackEnv: {
        CAT_CAFE_API_URL: 'http://127.0.0.1:3004',
        CAT_CAFE_INVOCATION_ID: 'inv-test-1',
        CAT_CAFE_CALLBACK_TOKEN: 'tok-test-1',
        CAT_CAFE_USER_ID: 'user-test-1',
        CAT_CAFE_SIGNAL_USER: 'acp',
      },
    });

    assert.equal(servers.length, 2);
    assert.equal(servers[0].name, 'cat-cafe');
    assert.equal(servers[0].transport, 'stdio');
    assert.equal(servers[1].name, 'filesystem');
    assert.equal(servers[1].transport, 'stdio');
    assert.equal(servers[1].command, 'npx');
    assert.deepEqual(servers[1].args, ['-y', '@modelcontextprotocol/server-filesystem']);
    assert.equal(servers[1].cwd, '/tmp/workspace');
    assert.deepEqual(servers[1].env, { TOKEN: '123' });
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

test('buildAcpMcpServers ignores project MCP config for ACP-native transport', () => {
  const servers = buildAcpMcpServers({ agentCapabilities: { mcpCapabilities: { acp: true } } }, {});

  assert.deepEqual(servers, [
    {
      id: 'cat-cafe',
      name: 'cat-cafe',
      transport: 'acp',
      acpId: 'cat-cafe',
    },
  ]);
});
