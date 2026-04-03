/**
 * Integration tests for GET /api/workspace/file/raw — F063 AC-8 image preview + Gap 5 media
 *
 * Uses the REAL workspaceRoutes plugin (not a mirror), injecting against
 * the actual production route handler. Test files are created in a temp
 * subdirectory of this worktree and cleaned up after.
 *
 * Security properties verified:
 * 1. Only media MIME types served (image/audio/video; others → 400)
 * 2. Path traversal/denylist inherited from resolveWorkspacePath
 * 3. Correct Content-Type / Content-Length headers
 * 4. Missing params → 400, nonexistent file → 404
 */

import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';

// 1x1 transparent PNG (68 bytes)
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' + 'Nl7BcQAAAABJRU5ErkJggg==',
  'base64',
);

describe('workspace file/raw endpoint (integration)', () => {
  let app;
  let worktreeId;
  const TEST_DIR = '__raw_endpoint_test__';

  before(async () => {
    // Import real route plugin and security module
    const { workspaceRoutes } = await import('../dist/routes/workspace.js');
    const { listWorktrees } = await import('../dist/domains/workspace/workspace-security.js');

    // Find this worktree's ID
    const worktrees = await listWorktrees();
    const thisWt = worktrees.find((w) => w.root.endsWith('cat-cafe-f063p2b4'));
    // Fallback: use the main worktree if this one isn't found
    const wt = thisWt ?? worktrees[0];
    worktreeId = wt.id;

    // Create temp test files inside the worktree root
    const testBase = join(wt.root, TEST_DIR);
    await mkdir(testBase, { recursive: true });
    await writeFile(join(testBase, 'logo.png'), TINY_PNG);
    await writeFile(join(testBase, 'photo.jpg'), TINY_PNG); // fake jpg
    await writeFile(join(testBase, 'code.ts'), 'export {}');
    // Fake audio/video files (content doesn't matter for MIME routing)
    await writeFile(join(testBase, 'clip.mp3'), Buffer.from([0xff, 0xfb, 0x90, 0x00]));
    await writeFile(join(testBase, 'demo.mp4'), Buffer.from([0x00, 0x00, 0x00, 0x1c]));

    // Register real workspaceRoutes on a Fastify instance
    app = Fastify();
    await app.register(workspaceRoutes);
    await app.ready();
  });

  after(async () => {
    await app?.close();
    // Clean up test files — find the worktree root from the resolved path
    const { listWorktrees } = await import('../dist/domains/workspace/workspace-security.js');
    const worktrees = await listWorktrees();
    const thisWt = worktrees.find((w) => w.root.endsWith('cat-cafe-f063p2b4'));
    const wt = thisWt ?? worktrees[0];
    await rm(join(wt.root, TEST_DIR), { recursive: true, force: true });
  });

  // ── Image files served correctly via real route ──

  it('serves PNG with correct Content-Type', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspace/file/raw?worktreeId=${worktreeId}&path=${TEST_DIR}/logo.png`,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.ok(Number(res.headers['content-length']) > 0);
    assert.equal(res.headers['cache-control'], 'private, max-age=60');
  });

  it('serves JPG with correct Content-Type', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspace/file/raw?worktreeId=${worktreeId}&path=${TEST_DIR}/photo.jpg`,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
  });

  // ── Audio/video files served (Gap 5) ──

  it('serves MP3 with correct Content-Type', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspace/file/raw?worktreeId=${worktreeId}&path=${TEST_DIR}/clip.mp3`,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'audio/mpeg');
    assert.ok(Number(res.headers['content-length']) > 0);
  });

  it('serves MP4 with correct Content-Type', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspace/file/raw?worktreeId=${worktreeId}&path=${TEST_DIR}/demo.mp4`,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'video/mp4');
  });

  // ── Non-media files rejected ──

  it('rejects non-media files with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspace/file/raw?worktreeId=${worktreeId}&path=${TEST_DIR}/code.ts`,
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.payload);
    assert.ok(body.error.includes('image'));
  });

  // ── Security inheritance from resolveWorkspacePath ──

  it('rejects path traversal (../) with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspace/file/raw?worktreeId=${worktreeId}&path=../etc/passwd`,
    });
    assert.equal(res.statusCode, 403);
  });

  it('rejects denylist files (.env) with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspace/file/raw?worktreeId=${worktreeId}&path=.env`,
    });
    assert.equal(res.statusCode, 403);
  });

  // ── Missing params ──

  it('rejects missing worktreeId with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspace/file/raw?path=${TEST_DIR}/logo.png`,
    });
    assert.equal(res.statusCode, 400);
  });

  it('rejects missing path with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspace/file/raw?worktreeId=${worktreeId}`,
    });
    assert.equal(res.statusCode, 400);
  });

  // ── File not found ──

  it('returns 404 for nonexistent image', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspace/file/raw?worktreeId=${worktreeId}&path=${TEST_DIR}/missing.png`,
    });
    assert.equal(res.statusCode, 404);
  });
});

describe('workspace reveal endpoint', () => {
  let app;
  let worktreeId;

  before(async () => {
    const { workspaceRoutes } = await import('../dist/routes/workspace.js');
    const { listWorktrees } = await import('../dist/domains/workspace/workspace-security.js');
    const worktrees = await listWorktrees();
    const wt = worktrees[0];
    worktreeId = wt.id;

    app = Fastify();
    await app.register(workspaceRoutes);
    await app.ready();
  });

  after(async () => {
    await app?.close();
  });

  it('rejects missing worktreeId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workspace/reveal',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ path: 'README.md' }),
    });
    assert.equal(res.statusCode, 400);
  });

  it('rejects missing path', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workspace/reveal',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ worktreeId }),
    });
    assert.equal(res.statusCode, 400);
  });

  it('rejects path traversal', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workspace/reveal',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ worktreeId, path: '../../etc/passwd' }),
    });
    // resolveWorkspacePath may return 403 or 404 depending on traversal detection
    assert.ok([403, 404].includes(res.statusCode));
  });
});

describe('workspace download/open endpoints', () => {
  let app;
  let worktreeId;
  const TEST_DIR = '__workspace_download_open_test__';

  before(async () => {
    const { workspaceRoutes } = await import('../dist/routes/workspace.js');
    const { listWorktrees } = await import('../dist/domains/workspace/workspace-security.js');

    const worktrees = await listWorktrees();
    const wt = worktrees[0];
    worktreeId = wt.id;

    await mkdir(join(wt.root, TEST_DIR), { recursive: true });
    await writeFile(join(wt.root, TEST_DIR, 'deck.pptx'), Buffer.from('pptx'));

    app = Fastify();
    await app.register(workspaceRoutes);
    await app.ready();
  });

  after(async () => {
    await app?.close();
    const { listWorktrees } = await import('../dist/domains/workspace/workspace-security.js');
    const worktrees = await listWorktrees();
    const wt = worktrees[0];
    await rm(join(wt.root, TEST_DIR), { recursive: true, force: true });
  });

  it('downloads workspace pptx with attachment headers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspace/download?worktreeId=${worktreeId}&path=${TEST_DIR}/deck.pptx`,
    });

    assert.equal(res.statusCode, 200);
    assert.equal(
      res.headers['content-type'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    assert.match(String(res.headers['content-disposition']), /attachment; filename="deck\.pptx"/);
  });

  it('rejects missing params for workspace open', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workspace/open',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ path: `${TEST_DIR}/deck.pptx` }),
    });

    assert.equal(res.statusCode, 400);
  });
});

describe('workspace open-local endpoint', () => {
  let app;
  let worktreeRoot;
  let customProjectRoot;
  const localAgentDir = join(homedir(), '.jiuwenclaw', 'agent');
  const localDeckPath = join(localAgentDir, 'meta-test-deck.pptx');
  const worktreeDeckDirName = '__workspace_open_local_test__';
  let worktreeDeckPath;
  let customProjectDeckPath;

  before(async () => {
    const { workspaceRoutes } = await import('../dist/routes/workspace.js');
    const { listWorktrees } = await import('../dist/domains/workspace/workspace-security.js');
    const worktrees = await listWorktrees();
    const wt = worktrees[0];
    worktreeRoot = wt.root;
    worktreeDeckPath = join(worktreeRoot, worktreeDeckDirName, 'thread-output-deck.pptx');
    customProjectRoot = resolve(worktreeRoot, '..', '__workspace_open_local_custom_project__');
    customProjectDeckPath = join(customProjectRoot, 'output', 'custom-project-deck.pptx');

    await mkdir(localAgentDir, { recursive: true });
    await writeFile(localDeckPath, Buffer.from('pptx-meta'));
    await mkdir(join(worktreeRoot, worktreeDeckDirName), { recursive: true });
    await writeFile(worktreeDeckPath, Buffer.from('pptx-worktree'));
    await mkdir(join(customProjectRoot, 'output'), { recursive: true });
    await writeFile(customProjectDeckPath, Buffer.from('pptx-custom-project'));
    app = Fastify();
    await app.register(workspaceRoutes);
    await app.ready();
  });

  after(async () => {
    await app?.close();
    await rm(localDeckPath, { force: true });
    if (worktreeRoot) {
      await rm(join(worktreeRoot, worktreeDeckDirName), { recursive: true, force: true });
    }
    if (customProjectRoot) {
      await rm(customProjectRoot, { recursive: true, force: true });
    }
  });

  it('rejects missing path', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workspace/open-local',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({}),
    });

    assert.equal(res.statusCode, 400);
  });

  it('rejects paths outside the allowed local agent root', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workspace/open-local',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ path: join(homedir(), 'Desktop', 'deck.pptx') }),
    });

    assert.equal(res.statusCode, 403);
  });

  it('returns 404 for missing pptx inside the allowed local agent root', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workspace/open-local',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ path: join(homedir(), '.jiuwenclaw', 'agent', 'missing-deck.pptx') }),
    });

    assert.equal(res.statusCode, 404);
  });

  it('returns local ppt metadata with generatedAt', async () => {
    await mkdir(localAgentDir, { recursive: true });
    await writeFile(localDeckPath, Buffer.from('pptx-meta'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/workspace/local-file-meta',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ path: localDeckPath }),
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.fileName, 'meta-test-deck.pptx');
    assert.equal(body.path, localDeckPath);
    assert.ok(typeof body.generatedAt === 'number');
    assert.ok(body.generatedAt > 0);
  });

  it('returns metadata for pptx inside a registered worktree root', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workspace/local-file-meta',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ path: worktreeDeckPath }),
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.fileName, 'thread-output-deck.pptx');
    assert.equal(body.path, worktreeDeckPath);
    assert.ok(typeof body.generatedAt === 'number');
    assert.ok(body.generatedAt > 0);
  });

  it('returns metadata for pptx inside the provided custom project path', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workspace/local-file-meta',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ path: customProjectDeckPath, projectPath: customProjectRoot }),
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.fileName, 'custom-project-deck.pptx');
    assert.equal(body.path, customProjectDeckPath);
    assert.ok(typeof body.generatedAt === 'number');
    assert.ok(body.generatedAt > 0);
  });
});
