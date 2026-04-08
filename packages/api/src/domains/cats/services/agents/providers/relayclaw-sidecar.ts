import { type ChildProcess, type SpawnOptions, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { delimiter, dirname, join } from 'node:path';
import type { CatId, RelayClawAgentConfig } from '@cat-cafe/shared';
import { createModuleLogger } from '../../../../../infrastructure/logger.js';
import { withBundledPythonPath } from '../../../../../utils/bundled-python-env.js';
import { resolveCatCafeHostRoot } from '../../../../../utils/cat-cafe-root.js';
import {
  resolveJiuwenClawAppDir,
  resolveJiuwenClawExecutable,
  resolveJiuwenClawPythonBin,
} from '../../../../../utils/jiuwenclaw-paths.js';
import {
  buildRelayClawAppSignature,
  buildRelayClawDisabledSkillsSignature,
  buildRelayClawSharedSkillsSignature,
  resolveRelayClawDisabledSkills,
  resolveRelayClawSharedSkillsDirs,
} from '../../../../../utils/relayclaw-skills.js';
import { tcpProbe } from '../../../../../utils/tcp-probe.js';
import type { AgentServiceOptions } from '../../types.js';
import { buildCatCafeMcpEnv, resolveCatCafeMcpServer } from './relayclaw-catcafe-mcp.js';

const log = createModuleLogger('relayclaw-sidecar');

export interface RelayClawSidecarRuntime {
  executablePath: string;
  pythonBin: string;
  appDir: string;
  useExecutable: boolean;
  homeDir: string;
  agentPort: number;
  webPort: number;
  env: Record<string, string>;
  signature: Record<string, string | number | boolean>;
}

export interface RelayClawLaunchCommand {
  command: string;
  args: string[];
  cwd: string;
}

export interface RelayClawSidecarController {
  ensureStarted(options?: AgentServiceOptions, signal?: AbortSignal): Promise<string>;
  /** @param reason Diagnostic tag for logs (e.g. runtime_signature_changed). */
  stop(reason?: string): void;
  getRecentLogs(): string;
}

export interface RelayClawSidecarControllerDeps {
  spawnFn?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  tcpProbeFn?: typeof tcpProbe;
  allocatePort?: () => Promise<number>;
}

export class DefaultRelayClawSidecarController implements RelayClawSidecarController {
  private readonly catId: CatId;
  private readonly config: RelayClawAgentConfig;
  private readonly spawnFn: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  private readonly tcpProbeFn: typeof tcpProbe;
  private readonly allocatePort: () => Promise<number>;
  private child: ChildProcess | null = null;
  private bootPromise: Promise<void> | null = null;
  private runtimeHash: string | null = null;
  private resolvedUrl: string | null = null;
  private recentLogs = '';

  constructor(catId: CatId, config: RelayClawAgentConfig, deps?: RelayClawSidecarControllerDeps) {
    this.catId = catId;
    this.config = config;
    this.spawnFn = deps?.spawnFn ?? ((command, args, options) => spawn(command, args, options));
    this.tcpProbeFn = deps?.tcpProbeFn ?? tcpProbe;
    this.allocatePort = deps?.allocatePort ?? findOpenPort;
  }

  async ensureStarted(options?: AgentServiceOptions, signal?: AbortSignal): Promise<string> {
    const runtime = this.buildRuntime(options);
    const runtimeHash = createHash('sha256').update(JSON.stringify(runtime.signature)).digest('hex');
    const childAlive = this.child?.killed === false && this.child.exitCode === null;

    if (childAlive && this.runtimeHash === runtimeHash && this.resolvedUrl) {
      const parsed = new URL(this.resolvedUrl);
      const port = Number.parseInt(parsed.port, 10);
      if (port > 0 && (await this.tcpProbeFn(parsed.hostname, port, 400))) {
        return this.resolvedUrl;
      }
    }

    if (this.child && this.runtimeHash !== runtimeHash) {
      this.stop('runtime_signature_changed');
    }

    if (this.bootPromise) {
      await this.bootPromise;
      return this.resolvedUrl!;
    }

    this.bootPromise = this.start(runtime, signal);
    try {
      await this.bootPromise;
      return this.resolvedUrl!;
    } finally {
      this.bootPromise = null;
    }
  }

  stop(reason = 'unspecified'): void {
    const child = this.child;
    const willKill = Boolean(child && child.exitCode === null);
    log.warn(
      {
        catId: this.catId,
        sidecarPid: child?.pid,
        willKill,
        reason,
      },
      'relayclaw sidecar stop invoked',
    );
    if (willKill && child) {
      if (process.platform === 'win32' && child.pid) {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
    }
    this.child = null;
    this.runtimeHash = null;
    this.resolvedUrl = null;
  }

  getRecentLogs(): string {
    return this.recentLogs;
  }

  private buildRuntime(options?: AgentServiceOptions): RelayClawSidecarRuntime {
    const callbackEnv = options?.callbackEnv ?? {};
    const appDir = resolveJiuwenClawAppDir(this.config.appDir);
    const executablePath = resolveJiuwenClawExecutable(this.config.executablePath);
    const pythonBin = resolveJiuwenClawPythonBin(this.config.pythonBin, appDir);
    const useExecutable = existsSync(executablePath);
    const homeDir = this.config.homeDir?.trim() || join(process.cwd(), '.cat-cafe', 'relayclaw', this.catId as string);
    const apiKey = callbackEnv.API_KEY || callbackEnv.OPENAI_API_KEY || callbackEnv.OPENROUTER_API_KEY || '';
    const apiBase = callbackEnv.API_BASE || callbackEnv.OPENAI_BASE_URL || callbackEnv.OPENAI_API_BASE || '';
    const defaultHeaders = callbackEnv.default_headers || callbackEnv.OPENAI_DEFAULT_HEADERS || '';
    const provider = apiBase.includes('openrouter.ai') ? 'OpenRouter' : 'OpenAI';
    const modelName = this.config.modelName?.trim() || 'gpt-5.4';
    const projectDir = options?.workingDirectory?.trim() || '';
    const projectRoot = projectDir || process.cwd();
    const catCafeMcp = resolveCatCafeMcpServer(options?.workingDirectory);
    const sharedSkillDirs = resolveRelayClawSharedSkillsDirs();
    const disabledSkills = resolveRelayClawDisabledSkills(projectRoot, this.catId as string);

    return {
      executablePath,
      pythonBin,
      appDir,
      useExecutable,
      homeDir,
      agentPort: this.config.agentPort ?? 0,
      webPort: this.config.webPort ?? 0,
      env: {
        HOME: homeDir,
        PYTHONUNBUFFERED: '1',
        WEB_HOST: '127.0.0.1',
        API_KEY: apiKey,
        API_BASE: apiBase,
        ...(defaultHeaders ? { default_headers: defaultHeaders } : {}),
        MODEL_NAME: modelName,
        MODEL_PROVIDER: provider,
        JIUWENCLAW_AGENT_ROOT: join(homeDir, 'agent'),
        JIUWENCLAW_RUNTIME_SKILLS_DIR: join(projectRoot, '.cat-cafe', 'relayclaw-skill-cache', this.catId as string),
        ...(projectDir ? { JIUWENCLAW_PROJECT_DIR: projectDir } : {}),
        ...(sharedSkillDirs.length > 0 ? { JIUWENCLAW_SHARED_SKILLS_DIRS: sharedSkillDirs.join(delimiter) } : {}),
        ...(disabledSkills.length > 0 ? { JIUWENCLAW_DISABLED_SKILLS: disabledSkills.join(',') } : {}),
        ...(catCafeMcp
          ? {
              CAT_CAFE_MCP_SERVER_PATH: catCafeMcp.serverPath,
              CAT_CAFE_MCP_COMMAND: catCafeMcp.command,
              CAT_CAFE_MCP_ARGS_JSON: JSON.stringify(catCafeMcp.args),
              CAT_CAFE_MCP_CWD: catCafeMcp.repoRoot,
            }
          : {}),
        ...buildCatCafeMcpEnv(callbackEnv),
      },
      signature: {
        executablePath,
        useExecutable,
        pythonBin,
        appDir,
        homeDir,
        appSignature: buildRelayClawAppSignature(appDir),
        apiBase,
        defaultHeaders,
        modelName,
        provider,
        runtimeSkillsDir: join(projectRoot, '.cat-cafe', 'relayclaw-skill-cache', this.catId as string),
        sharedSkillsSignature: buildRelayClawSharedSkillsSignature(),
        disabledSkillsSignature: buildRelayClawDisabledSkillsSignature(projectRoot, this.catId as string),
        catCafeMcpPath: catCafeMcp?.serverPath ?? '',
        keyHash: apiKey ? createHash('sha256').update(apiKey).digest('hex') : '',
      },
    };
  }

  private async start(runtime: RelayClawSidecarRuntime, signal?: AbortSignal): Promise<void> {
    if (!runtime.env.API_KEY || !runtime.env.API_BASE) {
      throw new Error('jiuwen requires a bound openai-compatible API key profile');
    }

    mkdirSync(runtime.homeDir, { recursive: true });
    const agentPort = runtime.agentPort || (await this.allocatePort());
    const webPort = runtime.webPort || (await this.allocatePort());
    this.resolvedUrl = `ws://127.0.0.1:${agentPort}`;
    this.recentLogs = '';

    const launchCommand = buildRelayClawLaunchCommand(runtime);

    // Windows Python: force UTF-8 and prepend bundled Python to PATH
    const spawnEnv: Record<string, string | undefined> = {
      ...process.env,
      ...runtime.env,
      AGENT_PORT: String(agentPort),
      WEB_PORT: String(webPort),
    };
    if (process.platform === 'win32') {
      spawnEnv.PYTHONIOENCODING = 'utf-8';
      spawnEnv.PYTHONUTF8 = '1';
      Object.assign(spawnEnv, withBundledPythonPath(spawnEnv, resolveCatCafeHostRoot(process.cwd())));
    }

    const child = this.spawnFn(launchCommand.command, launchCommand.args, {
      cwd: launchCommand.cwd,
      env: spawnEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    this.runtimeHash = createHash('sha256').update(JSON.stringify(runtime.signature)).digest('hex');
    const sidecarPid = child.pid;
    log.info(
      {
        catId: this.catId,
        sidecarPid,
        agentPort,
        webPort,
        command: launchCommand.command,
        args: launchCommand.args,
        cwd: launchCommand.cwd,
      },
      'relayclaw sidecar spawned',
    );

    const pushLog = (chunk: Buffer) => {
      this.recentLogs = `${this.recentLogs}${chunk.toString('utf-8')}`.slice(-8000);
    };
    child.stdout?.on('data', pushLog);
    child.stderr?.on('data', pushLog);
    child.once('exit', (code, exitSignal) => {
      if (this.child !== child) {
        return;
      }
      const tail = summarizeLogs(this.recentLogs);
      log.warn(
        {
          catId: this.catId,
          sidecarPid,
          code,
          exitSignal,
          logChars: this.recentLogs.length,
          ...(tail ? { logTail: tail } : {}),
          ...(this.recentLogs.length > 0
            ? { stderrPreview: this.recentLogs.slice(-1500) }
            : {}),
        },
        'relayclaw sidecar exited',
      );
      this.child = null;
      this.runtimeHash = null;
      this.resolvedUrl = null;
    });

    if (signal?.aborted) {
      this.stop('startup_aborted_signal');
      throw new Error('jiuwen sidecar startup aborted');
    }

    const timeoutAt = Date.now() + (this.config.startupTimeoutMs ?? 180_000);
    while (Date.now() < timeoutAt) {
      if (signal?.aborted) {
        this.stop('startup_aborted_signal');
        throw new Error('jiuwen sidecar startup aborted');
      }
      if (!this.child || this.child.exitCode !== null) {
        const tail = summarizeLogs(this.recentLogs);
        log.warn(
          {
            catId: this.catId,
            sidecarPid,
            exitCode: this.child?.exitCode ?? null,
            logChars: this.recentLogs.length,
            ...(tail ? { logTail: tail } : {}),
            ...(this.recentLogs.length > 0
              ? { stderrPreview: this.recentLogs.slice(-1500) }
              : {}),
          },
          'relayclaw sidecar startup failed: process exited before ready',
        );
        throw new Error(
          `jiuwen sidecar exited during startup${this.recentLogs ? `: ${tail}` : ''}`,
        );
      }
      if (await isRelayClawRuntimeReady(runtime, this.tcpProbeFn, this.recentLogs, agentPort, webPort)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const tail = summarizeLogs(this.recentLogs);
    log.warn(
      {
        catId: this.catId,
        sidecarPid,
        exitCode: this.child?.exitCode ?? null,
        logChars: this.recentLogs.length,
        ...(tail ? { logTail: tail } : {}),
        ...(this.recentLogs.length > 0 ? { stderrPreview: this.recentLogs.slice(-1500) } : {}),
      },
      'relayclaw sidecar startup failed: readiness timeout',
    );
    this.stop('readiness_timeout');
    throw new Error(
      `jiuwen sidecar did not become ready in time${this.recentLogs ? `: ${tail}` : ''}`,
    );
  }
}

export function buildRelayClawLaunchCommand(runtime: RelayClawSidecarRuntime): RelayClawLaunchCommand {
  if (runtime.useExecutable) {
    return {
      command: runtime.executablePath,
      args: ['--desktop-run-app'],
      cwd: dirname(runtime.executablePath),
    };
  }

  return {
    command: runtime.pythonBin,
    args: ['-m', 'jiuwenclaw.app'],
    cwd: runtime.appDir,
  };
}

export async function isRelayClawRuntimeReady(
  runtime: RelayClawSidecarRuntime,
  tcpProbeFn: typeof tcpProbe,
  recentLogs: string,
  agentPort: number,
  webPort: number,
): Promise<boolean> {
  if (!(await tcpProbeFn('127.0.0.1', agentPort, 400))) {
    return false;
  }
  if (isSidecarReady(recentLogs)) {
    return true;
  }
  if (await tcpProbeFn('127.0.0.1', webPort, 400)) {
    return true;
  }
  return false;
}

export function isSidecarReady(recentLogs: string): boolean {
  return (
    recentLogs.includes('[JiuWenClaw] 初始化完成') ||
    recentLogs.includes('JiuWenClaw] 初始化完成') ||
    recentLogs.includes('WebChannel 已启动')
  );
}

export function summarizeLogs(recentLogs: string): string {
  return recentLogs
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6)
    .join(' | ');
}

async function findOpenPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate relayclaw port')));
        return;
      }
      const { port } = address;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
  });
}
