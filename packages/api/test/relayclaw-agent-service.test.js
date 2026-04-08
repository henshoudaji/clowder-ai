import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

const { RelayClawAgentService, __relayClawInternals } = await import(
  '../dist/domains/cats/services/agents/providers/RelayClawAgentService.js'
);
const { RelayClawConnectionManager, resolveRelayClawWebSocketCtor } = await import(
  '../dist/domains/cats/services/agents/providers/relayclaw-connection.js'
);
const {
  buildRelayClawLaunchCommand,
  DefaultRelayClawSidecarController,
  isRelayClawRuntimeReady,
} = await import('../dist/domains/cats/services/agents/providers/relayclaw-sidecar.js');
const {
  jiuwenClawBundleAvailable,
  resolveJiuwenClawExecutable,
  resolveJiuwenClawPythonBin,
} = await import('../dist/utils/jiuwenclaw-paths.js');
const { WebSocket: NodeWebSocket } = await import('ws');

function createConnectionFactory(onSend) {
  return (requestQueues) => ({
    async ensureConnected() {},
    isOpen() {
      return true;
    },
    send(payload) {
      onSend(payload, requestQueues);
    },
    close() {},
  });
}

class FakeChildProcess extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.exitCode = null;
    this.killed = false;
    this.pid = Math.floor(Math.random() * 100000) + 1000;
  }

  kill(signal = 'SIGTERM') {
    this.killed = true;
    setTimeout(() => {
      this.exitCode = 0;
      this.emit('exit', 0, signal);
    }, 0);
    return true;
  }
}

describe('RelayClawAgentService', () => {
  it('falls back to the ws module when global WebSocket is unavailable', () => {
    const savedWebSocket = global.WebSocket;

    try {
      delete global.WebSocket;
      assert.equal(resolveRelayClawWebSocketCtor(), NodeWebSocket);
    } finally {
      global.WebSocket = savedWebSocket;
    }
  });

  it('connects and sends without a global WebSocket when using the fallback constructor', async () => {
    const savedWebSocket = global.WebSocket;
    const sent = [];

    class FakeFallbackWebSocket {
      static OPEN = 1;

      constructor(url) {
        this.url = url;
        this.readyState = FakeFallbackWebSocket.OPEN;
        this.listeners = new Map();
        queueMicrotask(() => {
          this.dispatch('message', {
            data: JSON.stringify({ type: 'event', event: 'connection.ack' }),
          });
        });
      }

      addEventListener(type, handler) {
        const handlers = this.listeners.get(type) ?? [];
        handlers.push(handler);
        this.listeners.set(type, handlers);
      }

      send(raw) {
        sent.push(raw);
      }

      close() {
        this.readyState = 3;
      }

      dispatch(type, event) {
        for (const handler of this.listeners.get(type) ?? []) handler(event);
      }
    }

    try {
      delete global.WebSocket;
      const manager = new RelayClawConnectionManager({
        requestQueues: new Map(),
        wsFactory: (url) => new FakeFallbackWebSocket(url),
      });

      await manager.ensureConnected('ws://fallback.test');
      assert.equal(manager.isOpen(), true);

      manager.send({ hello: 'world' });
      assert.deepEqual(sent, ['{"hello":"world"}']);
    } finally {
      global.WebSocket = savedWebSocket;
    }
  });

  it('resolves vendored jiuwenclaw venv python on Windows-style paths', () => {
    const appDir = mkdtempSync(join(tmpdir(), 'jiuwenclaw-paths-'));
    const pythonBin =
      process.platform === 'win32'
        ? join(appDir, '.venv', 'Scripts', 'python.exe')
        : join(appDir, '.venv', 'bin', 'python');
    mkdirSync(dirname(pythonBin), { recursive: true });
    writeFileSync(pythonBin, '');

    assert.equal(resolveJiuwenClawPythonBin(undefined, appDir), pythonBin);
  });

  it('marks jiuwenclaw bundle available when app dir and venv python are present', () => {
    const appDir = mkdtempSync(join(tmpdir(), 'jiuwenclaw-bundle-'));
    const appPy = join(appDir, 'jiuwenclaw', 'app.py');
    const pythonBin =
      process.platform === 'win32'
        ? join(appDir, '.venv', 'Scripts', 'python.exe')
        : join(appDir, '.venv', 'bin', 'python');
    mkdirSync(dirname(appPy), { recursive: true });
    mkdirSync(dirname(pythonBin), { recursive: true });
    writeFileSync(appPy, '');
    writeFileSync(pythonBin, '');

    const previousAppDir = process.env.CAT_CAFE_RELAYCLAW_APP_DIR;
    try {
      process.env.CAT_CAFE_RELAYCLAW_APP_DIR = appDir;
      assert.equal(jiuwenClawBundleAvailable(), true);
    } finally {
      if (previousAppDir === undefined) {
        delete process.env.CAT_CAFE_RELAYCLAW_APP_DIR;
      } else {
        process.env.CAT_CAFE_RELAYCLAW_APP_DIR = previousAppDir;
      }
    }
  });

  it('prefers vendored jiuwenclaw executable when present', () => {
    const appDir = mkdtempSync(join(tmpdir(), 'jiuwenclaw-exe-'));
    const exePath = join(appDir, 'vendor', 'jiuwenclaw.exe');
    mkdirSync(dirname(exePath), { recursive: true });
    writeFileSync(exePath, '');

    const previousExe = process.env.CAT_CAFE_RELAYCLAW_EXE;
    try {
      process.env.CAT_CAFE_RELAYCLAW_EXE = exePath;
      assert.equal(resolveJiuwenClawExecutable(), exePath);
      assert.equal(jiuwenClawBundleAvailable(), true);
    } finally {
      if (previousExe === undefined) {
        delete process.env.CAT_CAFE_RELAYCLAW_EXE;
      } else {
        process.env.CAT_CAFE_RELAYCLAW_EXE = previousExe;
      }
    }
  });

  it('builds an exe launch command when jiuwenclaw.exe is available', () => {
    const launch = buildRelayClawLaunchCommand({
      executablePath: 'C:\\vendor\\jiuwenclaw.exe',
      pythonBin: 'C:\\Python\\python.exe',
      appDir: 'C:\\vendor\\jiuwenclaw',
      useExecutable: true,
      homeDir: 'C:\\runtime-home',
      agentPort: 19000,
      webPort: 5173,
      env: {},
      signature: {},
    });

    assert.equal(launch.command, 'C:\\vendor\\jiuwenclaw.exe');
    assert.deepEqual(launch.args, ['--desktop-run-app']);
    assert.equal(launch.cwd, process.platform === 'win32' ? 'C:\\vendor' : '.');
  });

  it('treats executable mode as ready when both relayclaw ports are listening', async () => {
    const calls = [];
    const ready = await isRelayClawRuntimeReady(
      {
        executablePath: 'C:\\vendor\\jiuwenclaw.exe',
        pythonBin: 'C:\\Python\\python.exe',
        appDir: 'C:\\vendor\\jiuwenclaw',
        useExecutable: true,
        homeDir: 'C:\\runtime-home',
        agentPort: 19000,
        webPort: 19001,
        env: {},
        signature: {},
      },
      async (_host, port) => {
        calls.push(port);
        return true;
      },
      '',
      19000,
      19001,
    );

    assert.equal(ready, true);
    assert.deepEqual(calls, [19000, 19001]);
  });

  it('emits final text when the stream only returns chat.final content', async () => {
    const service = new RelayClawAgentService(
      {
        catId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.final',
              content: 'OK',
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('Reply with exactly: OK')) {
      messages.push(msg);
    }

    assert.deepEqual(messages.map((msg) => msg.type), ['session_init', 'text', 'done']);
    assert.equal(messages[1].content, 'OK');
  });

  it('treats llm_reasoning deltas as thinking and still emits the final answer', async () => {
    const service = new RelayClawAgentService(
      {
        catId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.delta',
              content: 'thinking step',
              source_chunk_type: 'llm_reasoning',
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.final',
              content: 'Final answer',
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('Reply with final answer after reasoning')) {
      messages.push(msg);
    }

    assert.deepEqual(messages.map((msg) => msg.type), ['session_init', 'system_info', 'text', 'done']);
    assert.deepEqual(JSON.parse(messages[1].content), {
      type: 'thinking',
      catId: 'relayclaw-debug',
      text: 'thinking step',
    });
    assert.equal(messages[2].content, 'Final answer');
  });

  it('emits final text even after visible deltas have already been streamed', async () => {
    const service = new RelayClawAgentService(
      {
        catId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.delta',
              content: '我来帮你总结一下。',
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.final',
              content: '这里是最终总结。',
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('Summarize after tooling')) {
      messages.push(msg);
    }

    assert.deepEqual(messages.map((msg) => msg.type), ['session_init', 'text', 'text', 'done']);
    assert.equal(messages[1].content, '我来帮你总结一下。');
    assert.equal(messages[2].content, '\n\n这里是最终总结。');
  });

  it('emits only the final suffix when chat.final extends prior streamed text', async () => {
    const service = new RelayClawAgentService(
      {
        catId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.delta',
              content: 'Hello',
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.final',
              content: 'Hello world',
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('Reply with Hello world')) {
      messages.push(msg);
    }

    assert.deepEqual(messages.map((msg) => msg.type), ['session_init', 'text', 'text', 'done']);
    assert.equal(messages[1].content, 'Hello');
    assert.equal(messages[2].content, ' world');
  });

  it('normalizes structured chat.final payloads before emitting final text', async () => {
    const service = new RelayClawAgentService(
      {
        catId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.final',
              content: JSON.stringify({ output: '\nNormalized final text', result_type: 'answer' }),
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('Reply with normalized final text')) {
      messages.push(msg);
    }

    assert.deepEqual(messages.map((msg) => msg.type), ['session_init', 'text', 'done']);
    assert.equal(messages[1].content, 'Normalized final text');
  });

  it('waits for jiuwenclaw initialization markers before treating the sidecar as ready', () => {
    assert.equal(__relayClawInternals.isSidecarReady('server listening'), false);
    assert.equal(__relayClawInternals.isSidecarReady('[JiuWenClaw] 初始化完成: agent_name=main_agent'), true);
    assert.equal(__relayClawInternals.isSidecarReady('WebChannel 已启动: ws://127.0.0.1:19001/ws'), true);
  });

  it('keeps tracking the new sidecar when the previous process exits after a restart', async () => {
    const appDir = mkdtempSync(join(tmpdir(), 'relayclaw-sidecar-'));
    const appPy = join(appDir, 'jiuwenclaw', 'app.py');
    const pythonBin =
      process.platform === 'win32'
        ? join(appDir, '.venv', 'Scripts', 'python.exe')
        : join(appDir, '.venv', 'bin', 'python');
    mkdirSync(dirname(appPy), { recursive: true });
    mkdirSync(dirname(pythonBin), { recursive: true });
    writeFileSync(appPy, '');
    writeFileSync(pythonBin, '');

    const spawned = [];
    let probeCall = 0;
    const previousAppDir = process.env.CAT_CAFE_RELAYCLAW_APP_DIR;
    const previousPython = process.env.CAT_CAFE_RELAYCLAW_PYTHON;

    try {
      process.env.CAT_CAFE_RELAYCLAW_APP_DIR = appDir;
      process.env.CAT_CAFE_RELAYCLAW_PYTHON = pythonBin;

      const controller = new DefaultRelayClawSidecarController(
        'office',
        {
          autoStart: true,
          startupTimeoutMs: 1000,
        },
        {
          spawnFn: () => {
            const child = new FakeChildProcess(`child-${spawned.length + 1}`);
            spawned.push(child);
            return child;
          },
          allocatePort: async () => 19000 + spawned.length,
          tcpProbeFn: async (_host, port) => {
            probeCall += 1;
            if (probeCall <= 2) return true;
            if (probeCall <= 4) return false;
            return port >= 19000;
          },
        },
      );

      const firstUrl = await controller.ensureStarted({
        callbackEnv: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
        },
        workingDirectory: '/tmp/project-a',
      });
      assert.match(firstUrl, /^ws:\/\/127\.0\.0\.1:\d+$/);
      assert.equal(spawned.length, 1);

      const secondUrl = await controller.ensureStarted({
        callbackEnv: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
        },
        workingDirectory: '/tmp/project-b',
      });

      assert.match(secondUrl, /^ws:\/\/127\.0\.0\.1:\d+$/);
      assert.equal(spawned.length, 2);
      assert.equal(spawned[0].killed, true);
      assert.equal(spawned[1].killed, false);
    } finally {
      if (previousAppDir === undefined) {
        delete process.env.CAT_CAFE_RELAYCLAW_APP_DIR;
      } else {
        process.env.CAT_CAFE_RELAYCLAW_APP_DIR = previousAppDir;
      }
      if (previousPython === undefined) {
        delete process.env.CAT_CAFE_RELAYCLAW_PYTHON;
      } else {
        process.env.CAT_CAFE_RELAYCLAW_PYTHON = previousPython;
      }
    }
  });

  it('passes project directory, uploaded files, and cat-cafe MCP config in the WS request', async () => {
    let capturedRequest = null;
    const service = new RelayClawAgentService(
      {
        catId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          capturedRequest = request;
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    for await (const _ of service.invoke('Inspect the uploaded image', {
      workingDirectory: '/usr/code/cat-cafe-runtime',
      uploadDir: '/tmp/cat-cafe-uploads',
      contentBlocks: [{ type: 'image', url: '/uploads/test-image.png' }],
      callbackEnv: {
        CAT_CAFE_API_URL: 'http://127.0.0.1:3004',
        CAT_CAFE_INVOCATION_ID: 'invocation-123',
        CAT_CAFE_CALLBACK_TOKEN: 'callback-token',
        CAT_CAFE_USER_ID: 'codex',
        CAT_CAFE_CAT_ID: 'relayclaw-debug',
      },
    })) {
      // exhaust stream
    }

    assert.ok(capturedRequest);
    assert.equal(capturedRequest.params.project_dir, '/usr/code/cat-cafe-runtime');
    const expectedUploadPath =
      process.platform === 'win32' ? 'D:\\tmp\\cat-cafe-uploads\\test-image.png' : '/tmp/cat-cafe-uploads/test-image.png';
    assert.deepEqual(capturedRequest.params.files, {
      uploaded: [
        {
          type: 'image',
          name: 'test-image.png',
          path: expectedUploadPath,
        },
      ],
    });
    const normalizedCommand = String(capturedRequest.params.cat_cafe_mcp.command).replaceAll('\\', '/');
    assert.match(normalizedCommand, /(^node$|\/node(?:\.exe)?$)/);
    assert.ok(Array.isArray(capturedRequest.params.cat_cafe_mcp.args));
    const normalizedMcpPath = String(capturedRequest.params.cat_cafe_mcp.args[0]).replaceAll('\\', '/');
    assert.ok(
      normalizedMcpPath.endsWith('/packages/mcp-server/dist/index.js'),
      'cat-cafe MCP should point at the local MCP server bundle',
    );
    assert.equal(capturedRequest.params.cat_cafe_mcp.env.CAT_CAFE_INVOCATION_ID, 'invocation-123');
    const normalizedQuery = String(capturedRequest.params.query).replaceAll('\\', '/');
    assert.match(normalizedQuery, /\[Local image path: D:\/tmp\/cat-cafe-uploads\/test-image\.png\]|\[Local image path: \/tmp\/cat-cafe-uploads\/test-image\.png\]/);
  });

  it('yields error before done when the provider times out', async () => {
    const service = new RelayClawAgentService(
      {
        catId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
          timeoutMs: 10,
        },
      },
      {
        createConnection: createConnectionFactory(() => {
          // Intentionally never emits frames.
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('This will time out')) {
      messages.push(msg);
    }

    assert.deepEqual(messages.map((msg) => msg.type), ['session_init', 'error', 'done']);
    assert.match(messages[1].error, /timed out/i);
  });

  it('yields error before done when the websocket closes unexpectedly', async () => {
    const service = new RelayClawAgentService(
      {
        catId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            channel_id: '',
            payload: {
              event_type: 'chat.error',
              error: 'jiuwen WebSocket connection closed unexpectedly',
              is_complete: true,
            },
            is_complete: true,
          });
          queue.abort();
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('This will close')) {
      messages.push(msg);
    }

    assert.deepEqual(messages.map((msg) => msg.type), ['session_init', 'error', 'done']);
    assert.match(messages[1].error, /connection closed unexpectedly/i);
  });

  it('reuses provided cliSessionId for relayclaw requests', async () => {
    let capturedRequest = null;
    const service = new RelayClawAgentService(
      {
        catId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
          channelId: 'catcafe',
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          capturedRequest = request;
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('resume this session', { cliSessionId: 'catcafe_existing_session' })) {
      messages.push(msg);
    }

    assert.equal(messages[0].type, 'session_init');
    assert.equal(messages[0].sessionId, 'catcafe_existing_session');
    assert.equal(capturedRequest.session_id, 'catcafe_existing_session');
  });

  it('derives a stable relayclaw sessionId from audit context when none is persisted yet', async () => {
    const sentSessionIds = [];
    const service = new RelayClawAgentService(
      {
        catId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
          channelId: 'catcafe',
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          sentSessionIds.push(request.session_id);
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const baseAuditContext = {
      threadId: 'thread-42',
      userId: 'user-7',
      catId: 'relayclaw-debug',
    };

    const firstMessages = [];
    for await (const msg of service.invoke('hello', {
      auditContext: {
        invocationId: 'inv-1',
        ...baseAuditContext,
      },
    })) {
      firstMessages.push(msg);
    }

    const secondMessages = [];
    for await (const msg of service.invoke('hello again', {
      auditContext: {
        invocationId: 'inv-2',
        ...baseAuditContext,
      },
    })) {
      secondMessages.push(msg);
    }

    assert.equal(firstMessages[0].type, 'session_init');
    assert.equal(secondMessages[0].type, 'session_init');
    assert.equal(firstMessages[0].sessionId, secondMessages[0].sessionId);
    assert.match(firstMessages[0].sessionId, /^catcafe_[0-9a-f]{24}$/);
    assert.equal(sentSessionIds[0], firstMessages[0].sessionId);
    assert.equal(sentSessionIds[1], secondMessages[0].sessionId);
  });
});
