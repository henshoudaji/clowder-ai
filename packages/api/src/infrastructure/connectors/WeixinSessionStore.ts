import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface PersistedWeixinSession {
  version: 1;
  botToken: string;
  updatedAt: string;
}

const SESSION_FILENAME = 'weixin-session.local.json';

export class WeixinSessionStore {
  private readonly filePath: string;

  constructor(hostRoot: string) {
    this.filePath = join(hostRoot, '.cat-cafe', SESSION_FILENAME);
  }

  load(): PersistedWeixinSession | null {
    if (!existsSync(this.filePath)) return null;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Partial<PersistedWeixinSession> | null;
      if (!parsed || parsed.version !== 1) return null;
      const botToken = typeof parsed.botToken === 'string' ? parsed.botToken.trim() : '';
      const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '';
      if (!botToken || !updatedAt) return null;
      return { version: 1, botToken, updatedAt };
    } catch {
      return null;
    }
  }

  save(botToken: string): void {
    const trimmed = botToken.trim();
    if (!trimmed) {
      this.clear();
      return;
    }
    const payload: PersistedWeixinSession = {
      version: 1,
      botToken: trimmed,
      updatedAt: new Date().toISOString(),
    };
    this.writeAtomic(`${JSON.stringify(payload, null, 2)}\n`);
  }

  clear(): void {
    try {
      unlinkSync(this.filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  private writeAtomic(content: string): void {
    const tempPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(tempPath, content, 'utf-8');
    try {
      renameSync(tempPath, this.filePath);
    } catch (err) {
      try {
        unlinkSync(tempPath);
      } catch {
        // best-effort cleanup
      }
      throw err;
    }
  }
}
