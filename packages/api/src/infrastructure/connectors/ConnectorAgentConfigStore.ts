/**
 * ConnectorAgentConfigStore — per-connector multi-agent configuration.
 *
 * Stores which agents are available for each connector channel,
 * and which agent is the primary (default) agent.
 *
 * Data model:
 *   JSON  connector-agent:{connectorId}:{userId}  → ConnectorAgentConfig
 */

import type { ConnectorAgentConfig } from '@cat-cafe/shared';

export interface IConnectorAgentConfigStore {
  get(connectorId: string, userId: string): ConnectorAgentConfig | null | Promise<ConnectorAgentConfig | null>;
  set(config: ConnectorAgentConfig): void | Promise<void>;
  remove(connectorId: string, userId: string): boolean | Promise<boolean>;
  listByUser(userId: string): ConnectorAgentConfig[] | Promise<ConnectorAgentConfig[]>;
}

const KEY_PREFIX = 'connector-agent:';

function buildKey(connectorId: string, userId: string): string {
  return `${KEY_PREFIX}${connectorId}:${userId}`;
}

// ── Memory implementation ──

export class MemoryConnectorAgentConfigStore implements IConnectorAgentConfigStore {
  private readonly configs = new Map<string, ConnectorAgentConfig>();

  get(connectorId: string, userId: string): ConnectorAgentConfig | null {
    return this.configs.get(buildKey(connectorId, userId)) ?? null;
  }

  set(config: ConnectorAgentConfig): void {
    this.configs.set(buildKey(config.connectorId, config.userId), config);
  }

  remove(connectorId: string, userId: string): boolean {
    return this.configs.delete(buildKey(connectorId, userId));
  }

  listByUser(userId: string): ConnectorAgentConfig[] {
    return [...this.configs.values()].filter((c) => c.userId === userId);
  }
}

// ── Redis implementation ──

import type { RedisClient } from '@cat-cafe/shared/utils';

export class RedisConnectorAgentConfigStore implements IConnectorAgentConfigStore {
  constructor(private readonly redis: RedisClient) {}

  async get(connectorId: string, userId: string): Promise<ConnectorAgentConfig | null> {
    const raw = await this.redis.get(buildKey(connectorId, userId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ConnectorAgentConfig;
    } catch {
      return null;
    }
  }

  async set(config: ConnectorAgentConfig): Promise<void> {
    await this.redis.set(buildKey(config.connectorId, config.userId), JSON.stringify(config));
  }

  async remove(connectorId: string, userId: string): Promise<boolean> {
    const result = await this.redis.del(buildKey(connectorId, userId));
    return result > 0;
  }

  async listByUser(userId: string): Promise<ConnectorAgentConfig[]> {
    const pattern = `${KEY_PREFIX}*:${userId}`;
    const keys = await this.redis.keys(pattern);
    if (keys.length === 0) return [];

    const pipeline = this.redis.multi();
    for (const key of keys) {
      pipeline.get(key);
    }
    const results = await pipeline.exec();
    if (!results) return [];

    const configs: ConnectorAgentConfig[] = [];
    for (const entry of results) {
      if (!entry) continue;
      const [err, data] = entry;
      if (err || !data || typeof data !== 'string') continue;
      try {
        configs.push(JSON.parse(data) as ConnectorAgentConfig);
      } catch {
        // skip malformed entries
      }
    }
    return configs;
  }
}
