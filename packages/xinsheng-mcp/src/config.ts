import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_HOME_URL = 'https://xinsheng.huawei.com/next/index/#/home';
export const DEFAULT_DETAIL_PAGE_URL = 'https://xinsheng.huawei.com/next/detail/#/index';
export const DEFAULT_SEARCH_PAGE_URL = 'https://xinsheng.huawei.com/next/plus/#/search';
export const DEFAULT_NAVIGATION_TIMEOUT_MS = 60_000;
export const DEFAULT_SEARCH_TIMEOUT_MS = 45_000;

export interface XinshengConfig {
  homeUrl: string;
  detailPageUrl: string;
  searchPageUrl: string;
  browserExecutablePath: string;
  profileDir: string;
  defaultVisible: boolean;
  navigationTimeoutMs: number;
  searchTimeoutMs: number;
}

export function normalizeQuery(query: string): string {
  const normalized = query.trim();
  if (normalized.length < 2) {
    throw new Error('搜索词至少需要 2 个字符。');
  }
  return normalized;
}

export function normalizeUuid(uuid: string): string {
  const normalized = uuid.trim();
  if (!normalized) {
    throw new Error('文章 uuid 不能为空。');
  }
  return normalized;
}

export function buildDetailUrl(detailPageUrl: string, uuid: string): string {
  const url = new URL(detailPageUrl);
  const params = new URLSearchParams({
    uuid: normalizeUuid(uuid),
  });
  url.hash = `/index?${params.toString()}`;
  return url.toString();
}

export function buildSearchUrl(searchPageUrl: string, query: string): string {
  const url = new URL(searchPageUrl);
  const params = new URLSearchParams({
    keyword: normalizeQuery(query),
    type: 'all',
  });
  url.hash = `/search?${params.toString()}`;
  return url.toString();
}

export function ensureDirectory(dirPath: string): string {
  mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function defaultProfileDir(homeDir = os.homedir()): string {
  if (process.platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'clowder-ai', 'xinsheng-mcp-profile');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
    return path.join(appData, 'clowder-ai', 'xinsheng-mcp-profile');
  }
  return path.join(homeDir, '.config', 'clowder-ai', 'xinsheng-mcp-profile');
}

export function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function resolveChromeExecutablePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.XINSHENG_BROWSER_EXECUTABLE_PATH) {
    return env.XINSHENG_BROWSER_EXECUTABLE_PATH;
  }

  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : process.platform === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
          ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      '找不到可用的 Chrome/Edge，可通过 XINSHENG_BROWSER_EXECUTABLE_PATH 显式指定浏览器可执行文件。',
    );
  }
  return found;
}

export function resolveConfig(env: NodeJS.ProcessEnv = process.env): XinshengConfig {
  const profileDir = ensureDirectory(env.XINSHENG_PROFILE_DIR || defaultProfileDir());
  return {
    homeUrl: env.XINSHENG_HOME_URL || DEFAULT_HOME_URL,
    detailPageUrl: env.XINSHENG_DETAIL_PAGE_URL || DEFAULT_DETAIL_PAGE_URL,
    searchPageUrl: env.XINSHENG_SEARCH_PAGE_URL || DEFAULT_SEARCH_PAGE_URL,
    browserExecutablePath: resolveChromeExecutablePath(env),
    profileDir,
    defaultVisible: parseBooleanFlag(env.XINSHENG_DEFAULT_VISIBLE, false),
    navigationTimeoutMs: Number(env.XINSHENG_NAVIGATION_TIMEOUT_MS || DEFAULT_NAVIGATION_TIMEOUT_MS),
    searchTimeoutMs: Number(env.XINSHENG_SEARCH_TIMEOUT_MS || DEFAULT_SEARCH_TIMEOUT_MS),
  };
}
