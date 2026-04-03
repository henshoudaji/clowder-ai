import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { catRegistry } from '@cat-cafe/shared';
import { MemoryConnectorAgentConfigStore } from '../dist/infrastructure/connectors/ConnectorAgentConfigStore.js';
import { ConnectorRouter } from '../dist/infrastructure/connectors/ConnectorRouter.js';
import { MemoryConnectorThreadBindingStore } from '../dist/infrastructure/connectors/ConnectorThreadBindingStore.js';
import { InboundMessageDedup } from '../dist/infrastructure/connectors/InboundMessageDedup.js';

function noopLog() {
  const noop = () => {};
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    child: () => noopLog(),
  };
}

function mockMessageStore() {
  const messages = [];
  return {
    messages,
    async append(input) {
      const msg = { id: `msg-${messages.length + 1}`, ...input };
      messages.push(msg);
      return msg;
    },
  };
}

function mockThreadStore() {
  let counter = 0;
  const threads = new Map();
  return {
    threads,
    create(userId, title) {
      counter++;
      const thread = {
        id: `thread-${counter}`,
        createdBy: userId,
        title,
        participants: [],
        lastActiveAt: Date.now(),
        createdAt: Date.now(),
        projectPath: 'default',
      };
      threads.set(thread.id, thread);
      return thread;
    },
    async get(threadId) {
      return threads.get(threadId) ?? null;
    },
    updateConnectorHubState(threadId, state) {
      const thread = threads.get(threadId);
      if (!thread) return;
      if (state === null) {
        delete thread.connectorHubState;
      } else {
        thread.connectorHubState = state;
      }
    },
  };
}

function mockTrigger() {
  const calls = [];
  return {
    calls,
    trigger(threadId, catId, userId, message, messageId) {
      calls.push({ threadId, catId, userId, message, messageId });
    },
  };
}

function mockSocketManager() {
  const broadcasts = [];
  return {
    broadcasts,
    broadcastToRoom(room, event, data) {
      broadcasts.push({ room, event, data });
    },
  };
}

describe('ConnectorRouter - Agent Config', () => {
  let bindingStore;
  let dedup;
  let messageStore;
  let threadStore;
  let trigger;
  let socketManager;
  let agentConfigStore;
  let router;
  let originalConfigs;

  beforeEach(() => {
    // Save original catRegistry state and register test patterns
    originalConfigs = catRegistry.getAllConfigs();
    catRegistry.reset();
    for (const [id, config] of originalConfigs) {
      catRegistry.register(id, {
        ...config,
        mentionPatterns: [`@${id}`],
      });
    }

    bindingStore = new MemoryConnectorThreadBindingStore();
    dedup = new InboundMessageDedup();
    messageStore = mockMessageStore();
    threadStore = mockThreadStore();
    trigger = mockTrigger();
    socketManager = mockSocketManager();
    agentConfigStore = new MemoryConnectorAgentConfigStore();
    router = new ConnectorRouter({
      bindingStore,
      dedup,
      messageStore,
      threadStore,
      invokeTrigger: trigger,
      socketManager,
      defaultUserId: 'test-user',
      defaultCatId: 'opus',
      log: noopLog(),
      agentConfigStore,
    });
  });

  afterEach(() => {
    // Restore original catRegistry
    catRegistry.reset();
    for (const [id, config] of originalConfigs) {
      catRegistry.register(id, config);
    }
  });

  it('should use default cat when no agent config is set', async () => {
    await router.route('feishu', 'chat1', 'hello', 'msg1');
    assert.equal(trigger.calls.length, 1);
    assert.equal(trigger.calls[0].catId, 'opus');
  });

  it('should use primary agent when agent config is set with no @mention', async () => {
    agentConfigStore.set({
      connectorId: 'feishu',
      agentIds: ['codex', 'gemini'],
      primaryAgentId: 'codex',
      userId: 'test-user',
      updatedAt: Date.now(),
    });
    await router.route('feishu', 'chat1', 'hello', 'msg1');
    assert.equal(trigger.calls.length, 1);
    assert.equal(trigger.calls[0].catId, 'codex');
  });

  it('should route @mention to whitelisted agent', async () => {
    agentConfigStore.set({
      connectorId: 'feishu',
      agentIds: ['codex', 'gemini'],
      primaryAgentId: 'codex',
      userId: 'test-user',
      updatedAt: Date.now(),
    });
    await router.route('feishu', 'chat1', '@gemini hello', 'msg1');
    assert.equal(trigger.calls.length, 1);
    assert.equal(trigger.calls[0].catId, 'gemini');
  });

  it('should fallback to primary agent when @mention is not in whitelist', async () => {
    agentConfigStore.set({
      connectorId: 'feishu',
      agentIds: ['codex', 'gemini'],
      primaryAgentId: 'codex',
      userId: 'test-user',
      updatedAt: Date.now(),
    });
    // @opus is not in whitelist [codex, gemini]
    await router.route('feishu', 'chat1', '@opus hello', 'msg1');
    assert.equal(trigger.calls.length, 1);
    assert.equal(trigger.calls[0].catId, 'codex');
  });

  it('should allow any @mention when no whitelist is set', async () => {
    // No agent config - use default behavior
    await router.route('feishu', 'chat1', '@codex hello', 'msg1');
    assert.equal(trigger.calls.length, 1);
    assert.equal(trigger.calls[0].catId, 'codex');
  });

  it('should handle empty agentIds as no config', async () => {
    agentConfigStore.set({
      connectorId: 'feishu',
      agentIds: [],
      primaryAgentId: '',
      userId: 'test-user',
      updatedAt: Date.now(),
    });
    await router.route('feishu', 'chat1', 'hello', 'msg1');
    assert.equal(trigger.calls.length, 1);
    assert.equal(trigger.calls[0].catId, 'opus');
  });

  it('should apply whitelist per connector', async () => {
    agentConfigStore.set({
      connectorId: 'feishu',
      agentIds: ['codex'],
      primaryAgentId: 'codex',
      userId: 'test-user',
      updatedAt: Date.now(),
    });
    // dingtalk has no agent config
    await router.route('dingtalk', 'chat1', '@gemini hello', 'msg1');
    assert.equal(trigger.calls.length, 1);
    assert.equal(trigger.calls[0].catId, 'gemini');
  });
});
