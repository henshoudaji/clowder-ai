import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MemoryConnectorAgentConfigStore } from '../dist/infrastructure/connectors/ConnectorAgentConfigStore.js';

describe('MemoryConnectorAgentConfigStore', () => {
  it('should return null for non-existent config', async () => {
    const store = new MemoryConnectorAgentConfigStore();
    const result = store.get('feishu', 'user1');
    assert.equal(result, null);
  });

  it('should store and retrieve config', async () => {
    const store = new MemoryConnectorAgentConfigStore();
    const config = {
      connectorId: 'feishu',
      agentIds: ['opus', 'codex'],
      primaryAgentId: 'opus',
      userId: 'user1',
      updatedAt: Date.now(),
    };
    store.set(config);
    const result = store.get('feishu', 'user1');
    assert.deepEqual(result, config);
  });

  it('should remove config', async () => {
    const store = new MemoryConnectorAgentConfigStore();
    const config = {
      connectorId: 'feishu',
      agentIds: ['opus'],
      primaryAgentId: 'opus',
      userId: 'user1',
      updatedAt: Date.now(),
    };
    store.set(config);
    const removed = store.remove('feishu', 'user1');
    assert.equal(removed, true);
    assert.equal(store.get('feishu', 'user1'), null);
  });

  it('should list configs by user', async () => {
    const store = new MemoryConnectorAgentConfigStore();
    store.set({
      connectorId: 'feishu',
      agentIds: ['opus'],
      primaryAgentId: 'opus',
      userId: 'user1',
      updatedAt: Date.now(),
    });
    store.set({
      connectorId: 'dingtalk',
      agentIds: ['codex'],
      primaryAgentId: 'codex',
      userId: 'user1',
      updatedAt: Date.now(),
    });
    store.set({
      connectorId: 'feishu',
      agentIds: ['gemini'],
      primaryAgentId: 'gemini',
      userId: 'user2',
      updatedAt: Date.now(),
    });
    const user1Configs = store.listByUser('user1');
    assert.equal(user1Configs.length, 2);
    assert.ok(user1Configs.some((c) => c.connectorId === 'feishu'));
    assert.ok(user1Configs.some((c) => c.connectorId === 'dingtalk'));
  });

  it('should overwrite existing config', async () => {
    const store = new MemoryConnectorAgentConfigStore();
    store.set({
      connectorId: 'feishu',
      agentIds: ['opus'],
      primaryAgentId: 'opus',
      userId: 'user1',
      updatedAt: 1000,
    });
    store.set({
      connectorId: 'feishu',
      agentIds: ['opus', 'codex', 'gemini'],
      primaryAgentId: 'codex',
      userId: 'user1',
      updatedAt: 2000,
    });
    const result = store.get('feishu', 'user1');
    assert.deepEqual(result.agentIds, ['opus', 'codex', 'gemini']);
    assert.equal(result.primaryAgentId, 'codex');
  });
});
