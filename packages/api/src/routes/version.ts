/**
 * Version Route
 * GET /api/curversion — 返回当前版本信息
 * GET /api/lastversion — 返回最新版本信息
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';
import { sessions } from './auth.js';
import { UserInfo } from 'node:os';

interface VersionRoutesOptions {
  projectRoot?: string;
}

function getPackageVersion(projectRoot: string): string {
  const pkgPath = resolve(projectRoot, 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function versionRoutes(app: FastifyInstance, opts: VersionRoutesOptions = {}): Promise<void> {
  const projectRoot = opts.projectRoot ?? resolveActiveProjectRoot();

  app.get('/api/curversion', async () => {
    const version = getPackageVersion(projectRoot);
    return {
      version,
      name: '@cat-cafe/api',
      current: true,
    };
  });

  app.get('/api/lastversion', async (request) => {
    const curversion = getPackageVersion(projectRoot);
    try {
      const userId = request.headers['x-cat-cafe-user'] as string;
      if (!userId) {
        throw new Error('Unauthorized: Missing user ID');
      }
      const userInfo: any = sessions.get(userId);
      const response = await fetch('https://versatile.cn-north-4.myhuaweicloud.com/v1/claw/client-latest-version', {
        headers: {
          'Content-Type': 'application/json;charset=utf8',
          'X-Auth-Token': userInfo.token || '',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch latest version');
      }
      const data: any = await response.json();
      return {
        curversion,
        lastversion: data.latest_version || curversion,
        downloadUrl: data.download_url || '',
        description: data.description || '',
      };
    } catch {
      return {
        curversion,
        lastversion: curversion
      };
    }
  });
}
