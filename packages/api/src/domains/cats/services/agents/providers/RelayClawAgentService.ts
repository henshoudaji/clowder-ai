/**
 * RelayClaw Agent Service
 *
 * Thin orchestration layer:
 * - optional sidecar bootstrap
 * - persistent WS connection
 * - request/response streaming
 */

import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { CatId, RelayClawAgentConfig } from '@cat-cafe/shared';
import { createCatId } from '@cat-cafe/shared';
import type { AgentMessage, AgentService, AgentServiceOptions } from '../../types.js';
import { appendLocalImagePathHints } from './image-cli-bridge.js';
import { extractImagePaths } from './image-paths.js';
import { FrameQueue, RelayClawConnectionManager, type RelayClawConnectionFactory } from './relayclaw-connection.js';
import { buildCatCafeMcpRequestConfig } from './relayclaw-catcafe-mcp.js';
import {
  DefaultRelayClawSidecarController,
  isSidecarReady,
  type RelayClawSidecarController,
  type RelayClawSidecarControllerDeps,
} from './relayclaw-sidecar.js';
import { transformRelayClawChunk } from './relayclaw-event-transform.js';

const DEFAULT_RELAYCLAW_TIMEOUT_MS = 30 * 60 * 1000;

export interface RelayClawAgentServiceOptions {
  catId?: CatId;
  config: RelayClawAgentConfig;
}

export interface RelayClawAgentServiceDeps {
  createConnection?: RelayClawConnectionFactory;
  createSidecarController?: (
    catId: CatId,
    config: RelayClawAgentConfig,
  ) => RelayClawSidecarController;
  sidecarDeps?: RelayClawSidecarControllerDeps;
}

function agentMsg(type: AgentMessage['type'], catId: CatId, content?: string): AgentMessage {
  return { type, catId, content, timestamp: Date.now() };
}

function resolveRelayClawSessionId(channelId: string, options?: AgentServiceOptions): string {
  const existingSessionId = options?.cliSessionId?.trim() || options?.sessionId?.trim();
  if (existingSessionId) return existingSessionId;

  const auditContext = options?.auditContext;
  if (auditContext?.threadId && auditContext.userId && auditContext.catId) {
    const digest = createHash('sha256')
      .update(`${auditContext.userId}\n${auditContext.catId}\n${auditContext.threadId}`)
      .digest('hex')
      .slice(0, 24);
    return `${channelId}_${digest}`;
  }

  return `${channelId}_${Date.now().toString(16)}_${randomUUID().slice(0, 12)}`;
}

function buildRelayClawFilesPayload(
  contentBlocks: AgentServiceOptions['contentBlocks'],
  uploadDir?: string,
): Record<string, unknown> | undefined {
  const imagePaths = extractImagePaths(contentBlocks, uploadDir);
  if (imagePaths.length === 0) return undefined;
  return {
    uploaded: imagePaths.map((path, index) => ({
      type: 'image',
      name: basename(path) || `image-${index + 1}`,
      path,
    })),
  };
}

export class RelayClawAgentService implements AgentService {
  private readonly catId: CatId;
  private readonly config: RelayClawAgentConfig;
  private readonly requestQueues = new Map<string, FrameQueue>();
  private readonly connection;
  private readonly sidecar: RelayClawSidecarController;
  private resolvedUrl: string | null = null;

  constructor(options: RelayClawAgentServiceOptions, deps?: RelayClawAgentServiceDeps) {
    this.catId = options.catId ?? createCatId('relayclaw-agent');
    this.config = options.config;
    this.connection =
      deps?.createConnection?.(this.requestQueues) ?? new RelayClawConnectionManager({ requestQueues: this.requestQueues });
    this.sidecar =
      deps?.createSidecarController?.(this.catId, this.config) ??
      new DefaultRelayClawSidecarController(this.catId, this.config, deps?.sidecarDeps);
  }

  async *invoke(prompt: string, options?: AgentServiceOptions): AsyncIterable<AgentMessage> {
    const signal = buildSignal(this.config.timeoutMs ?? DEFAULT_RELAYCLAW_TIMEOUT_MS, options?.signal);
    const channelId = this.config.channelId ?? 'catcafe';
    const sessionId = resolveRelayClawSessionId(channelId, options);
    yield { type: 'session_init', catId: this.catId, sessionId, timestamp: Date.now() };

    try {
      await this.ensureConnected(signal, options);
    } catch (err) {
      yield {
        type: 'error',
        catId: this.catId,
        error: `jiuwen connection failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      };
      return;
    }

    const requestId = randomUUID();
    const queue = new FrameQueue();
    this.requestQueues.set(requestId, queue);
    const onAbort = () => queue.abort();
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      this.connection.send(buildRequest(requestId, channelId, sessionId, prompt, options));
      yield* this.consumeFrames(queue, signal, options?.signal);
    } catch (err) {
      if (options?.signal?.aborted) {
        yield agentMsg('done', this.catId);
      } else {
        yield {
          type: 'error',
          catId: this.catId,
          error: `jiuwen error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        };
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
      this.requestQueues.delete(requestId);
    }
  }

  private async ensureConnected(signal?: AbortSignal, options?: AgentServiceOptions): Promise<void> {
    if (this.config.autoStart) {
      this.resolvedUrl = await this.sidecar.ensureStarted(options, signal);
    }
    const url = this.resolvedUrl ?? this.config.url;
    if (!url) throw new Error('jiuwen WebSocket URL is not configured');
    await this.connection.ensureConnected(url, signal);
  }

  private async *consumeFrames(
    queue: FrameQueue,
    signal: AbortSignal,
    callerSignal?: AbortSignal,
  ): AsyncIterable<AgentMessage> {
    let sawError = false;
    let streamedText = '';

    while (!signal.aborted) {
      const frame = await queue.take();
      if (frame === null) break;

      const payload = frame.payload;
      const message = transformRelayClawChunk(frame, this.catId);
      if (message) {
        yield message;
        if (message.type === 'text' && message.content) streamedText += message.content;
        if (message.type === 'error') {
          sawError = true;
          break;
        }
      } else if (payload?.event_type === 'chat.final') {
        const finalText = normalizeRelayClawFinalContent(payload.content);
        const deltaToEmit = computeFinalTextDelta(streamedText, finalText);
        if (deltaToEmit) {
          streamedText += deltaToEmit;
          yield agentMsg('text', this.catId, deltaToEmit);
        }
      }

      if (frame.is_complete === true || payload?.is_complete === true) break;
    }

    if (!sawError && signal.aborted && !callerSignal?.aborted) {
      sawError = true;
      yield {
        type: 'error',
        catId: this.catId,
        error: 'jiuwen request timed out before completion',
        timestamp: Date.now(),
      };
    }

    if (!sawError) yield agentMsg('done', this.catId);
    else yield agentMsg('done', this.catId);
  }
}

function buildSignal(timeoutMs: number, callerSignal?: AbortSignal): AbortSignal {
  const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
  if (callerSignal) signals.push(callerSignal);
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}

function decodeQuotedPythonLikeString(raw: string): string {
  return raw
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function normalizeRelayClawFinalContent(rawContent: unknown): string {
  if (typeof rawContent !== 'string') return '';

  const trimmed = rawContent.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof parsed.output === 'string') {
        return parsed.output.replace(/^(?:\r?\n)+/, '');
      }
    } catch {
      // Fall through to Python-dict-style extraction.
    }
  }

  if (!trimmed.includes('result_type') || !trimmed.includes('output')) {
    return rawContent.replace(/^(?:\r?\n)+/, '');
  }

  const singleQuoted = rawContent.match(/['"]output['"]\s*:\s*'((?:\\'|[^'])*)'/s);
  if (singleQuoted?.[1] != null) {
    return decodeQuotedPythonLikeString(singleQuoted[1]).replace(/^(?:\r?\n)+/, '');
  }

  const doubleQuoted = rawContent.match(/['"]output['"]\s*:\s*"((?:\\"|[^"])*)"/s);
  if (doubleQuoted?.[1] != null) {
    return decodeQuotedPythonLikeString(doubleQuoted[1]).replace(/^(?:\r?\n)+/, '');
  }

  return rawContent.replace(/^(?:\r?\n)+/, '');
}

function computeFinalTextDelta(streamedText: string, finalText: string): string {
  if (!finalText) return '';
  if (!streamedText) return finalText;
  if (finalText === streamedText) return '';
  if (finalText.startsWith(streamedText)) return finalText.slice(streamedText.length);
  if (streamedText.startsWith(finalText)) return '';
  return `${streamedText.endsWith('\n') ? '' : '\n\n'}${finalText}`;
}

function buildRequest(
  requestId: string,
  channelId: string,
  sessionId: string,
  prompt: string,
  options?: AgentServiceOptions,
): Record<string, unknown> {
  const imagePaths = extractImagePaths(options?.contentBlocks, options?.uploadDir);
  const systemPrompt = typeof options?.systemPrompt === 'string' ? options.systemPrompt.trim() : '';
  return {
    request_id: requestId,
    channel_id: channelId,
    session_id: sessionId,
    req_method: 'chat.send',
    params: {
      query: appendLocalImagePathHints(prompt, imagePaths),
      ...(systemPrompt ? { system_prompt: systemPrompt } : {}),
      mode: 'agent',
      ...(options?.workingDirectory ? { project_dir: options.workingDirectory } : {}),
      ...(buildRelayClawFilesPayload(options?.contentBlocks, options?.uploadDir)
        ? { files: buildRelayClawFilesPayload(options?.contentBlocks, options?.uploadDir) }
        : {}),
      ...(buildCatCafeMcpRequestConfig(options) ? { cat_cafe_mcp: buildCatCafeMcpRequestConfig(options) } : {}),
    },
    is_stream: true,
    timestamp: Date.now() / 1000,
  };
}

export const __relayClawInternals = {
  isSidecarReady,
};
