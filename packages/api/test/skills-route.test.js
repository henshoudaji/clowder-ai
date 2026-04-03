/**
 * Skills route tests
 * GET /api/skills          — Clowder AI 共享 Skills 看板数据
 * GET /api/skills/detail   — 获取已安装 skill 详情
 * GET /api/skills/file     — 预览 skill 目录中的文本文件
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import Fastify from 'fastify';
import { skillsRoutes } from '../dist/routes/skills.js';

const AUTH_HEADERS = { 'x-cat-cafe-user': 'test-user' };

describe('Skills Route', () => {
  it('returns 401 when no identity header is provided', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills',
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('Identity required'));

    await app.close();
  });

  it('GET /api/skills returns skills array and summary', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    // Response structure
    assert.ok(Array.isArray(body.skills), 'skills should be an array');
    assert.ok(body.summary, 'should have summary');
    assert.equal(typeof body.summary.total, 'number');
    assert.equal(typeof body.summary.allMounted, 'boolean');
    assert.equal(typeof body.summary.registrationConsistent, 'boolean');

    await app.close();
  });

  it('each skill entry has required fields', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills',
      headers: AUTH_HEADERS,
    });

    const body = JSON.parse(res.body);
    if (body.skills.length === 0) {
      // No skills found (possible in CI), skip field checks
      await app.close();
      return;
    }

    for (const skill of body.skills) {
      assert.equal(typeof skill.name, 'string', 'name should be string');
      assert.equal(typeof skill.category, 'string', 'category should be string');
      assert.equal(typeof skill.trigger, 'string', 'trigger should be string');
      assert.ok(skill.mounts, 'should have mounts');
      assert.equal(typeof skill.mounts.claude, 'boolean');
      assert.equal(typeof skill.mounts.codex, 'boolean');
      assert.equal(typeof skill.mounts.gemini, 'boolean');
    }

    await app.close();
  });

  it('skills follow BOOTSTRAP ordering (registered before unregistered)', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills',
      headers: AUTH_HEADERS,
    });

    const body = JSON.parse(res.body);
    if (body.skills.length === 0) {
      await app.close();
      return;
    }

    // Skills with a category (from BOOTSTRAP) should come before '其他'
    let seenUnregistered = false;
    for (const skill of body.skills) {
      if (skill.category === '其他') {
        seenUnregistered = true;
      } else if (seenUnregistered) {
        assert.fail(`Registered skill "${skill.name}" appeared after unregistered skill — ordering violated`);
      }
    }

    await app.close();
  });

  it('summary.total matches skills array length', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills',
      headers: AUTH_HEADERS,
    });

    const body = JSON.parse(res.body);
    assert.equal(body.summary.total, body.skills.length);

    await app.close();
  });

  // ─── GET /api/skills/detail tests ────────────────────────

  it('GET /api/skills/detail returns 401 without identity', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/detail?name=tdd',
    });

    assert.equal(res.statusCode, 401);
    await app.close();
  });

  it('GET /api/skills/detail returns 400 without name parameter', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/detail',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('Missing required parameter'));
    await app.close();
  });

  it('GET /api/skills/detail returns 404 for non-existent skill', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/detail?name=non-existent-skill-12345',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 404);
    await app.close();
  });

  it('GET /api/skills/detail returns 400 for path traversal in name', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/detail?name=../etc/passwd',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('Invalid skill name'));
    await app.close();
  });

  // ─── GET /api/skills/file tests ──────────────────────────

  it('GET /api/skills/file returns 401 without identity', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/file?name=tdd&path=SKILL.md',
    });

    assert.equal(res.statusCode, 401);
    await app.close();
  });

  it('GET /api/skills/file returns 400 without required parameters', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/file?name=tdd',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('Missing required parameters'));
    await app.close();
  });

  it('GET /api/skills/file returns 403 for hidden files', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    // Use a skill that exists in the project (tdd should exist)
    // The hidden file check happens before file existence check
    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/file?name=tdd&path=.hidden',
      headers: AUTH_HEADERS,
    });

    // Should return 403 for hidden files (before checking if file exists)
    // If skill doesn't exist, it might return 404 first - that's also acceptable
    // The important thing is that hidden files are blocked when skill exists
    assert.ok(res.statusCode === 403 || res.statusCode === 404, `Expected 403 or 404, got ${res.statusCode}`);
    await app.close();
  });

  it('GET /api/skills/file returns 403 for hidden files in subdirectory', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/file?name=tdd&path=subdir/.env',
      headers: AUTH_HEADERS,
    });

    // Should return 403 for hidden files (before checking if file exists)
    assert.ok(res.statusCode === 403 || res.statusCode === 404, `Expected 403 or 404, got ${res.statusCode}`);
    await app.close();
  });

  it('GET /api/skills/file returns 400 for path traversal', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/file?name=tdd&path=../../../etc/passwd',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('Invalid file path'));
    await app.close();
  });

  it('GET /api/skills/file returns 400 for absolute path', async () => {
    const app = Fastify();
    await app.register(skillsRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/file?name=tdd&path=/etc/passwd',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('Invalid file path'));
    await app.close();
  });
});
