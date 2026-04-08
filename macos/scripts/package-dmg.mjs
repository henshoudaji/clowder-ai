#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const rootPackageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const defaultOutputDir = resolve(repoRoot, 'dist', 'macos');
const appName = 'Clowder AI';

function parseArgs(argv) {
  const options = {
    outputDir: defaultOutputDir,
    appPath: join(defaultOutputDir, `${appName}.app`),
    buildApp: true,
    skipBuild: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    switch (arg) {
      case '--output-dir':
        options.outputDir = resolve(repoRoot, value ?? '');
        options.appPath = join(options.outputDir, `${appName}.app`);
        index += 1;
        break;
      case '--app-path':
        options.appPath = resolve(repoRoot, value ?? '');
        index += 1;
        break;
      case '--skip-app-build':
        options.buildApp = false;
        break;
      case '--skip-build':
        options.skipBuild = true;
        break;
      case '--help':
      case '-h':
        process.stdout.write(
          `Usage: node macos/scripts/package-dmg.mjs [options]\n\nOptions:\n  --output-dir <path>   Override dist/macos output root\n  --app-path <path>     Package an existing .app\n  --skip-app-build      Do not rebuild the app before creating the dmg\n  --skip-build          Forward --skip-build to the app builder when rebuilding\n`,
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function logStep(message) {
  process.stdout.write(`\n[macos-dmg] ${message}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? 'inherit',
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function measurePathBytes(targetPath) {
  const stats = statSync(targetPath);
  if (!stats.isDirectory()) {
    return stats.size;
  }

  let total = 0;
  for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
    total += measurePathBytes(join(targetPath, entry.name));
  }
  return total;
}

function buildAppIfNeeded(options) {
  if (!options.buildApp) {
    return;
  }
  logStep('Building app bundle before creating dmg');
  const args = ['macos/scripts/build-app.mjs'];
  if (options.skipBuild) {
    args.push('--skip-build');
  }
  if (options.outputDir !== defaultOutputDir) {
    args.push('--output-dir', options.outputDir);
  }
  run('node', args);
}

function createApplicationsAlias(stagingDir) {
  run('ln', ['-s', '/Applications', join(stagingDir, 'Applications')]);
}

function estimateDmgSizeMegabytes(appPath) {
  const appBytes = measurePathBytes(appPath);
  const estimatedBytes = Math.ceil(appBytes * 1.35) + 128 * 1024 * 1024;
  const baseMegabytes = Math.ceil(estimatedBytes / (1024 * 1024));
  return Math.max(baseMegabytes, 512);
}

function writeReadme(stagingDir) {
  const readmePath = join(stagingDir, 'README.txt');
  const content = [
    'Clowder AI macOS Preview',
    '',
    '1. Drag Clowder AI.app into Applications.',
    '2. Open it from Applications.',
    '3. This preview build is unsigned and may trigger Gatekeeper warnings.',
    '4. The app currently falls back to a shell launcher when the native Swift launcher cannot be built.',
  ].join('\n');
  writeFileSync(readmePath, `${content}\n`, 'utf8');
}

function verifyNoExternalSymlinks(appRoot) {
  const allowedPrefixes = ['/Applications'];
  const violations = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const target = readlinkSync(fullPath);
        if (isAbsolute(target) && !allowedPrefixes.some((p) => target.startsWith(p))) {
          violations.push({ path: fullPath.slice(appRoot.length), target });
        }
      } else if (entry.isDirectory()) {
        walk(fullPath);
      }
    }
  }

  walk(appRoot);

  if (violations.length > 0) {
    const sample = violations
      .slice(0, 10)
      .map((v) => `  ${v.path} -> ${v.target}`)
      .join('\n');
    const suffix = violations.length > 10 ? `\n  ... and ${violations.length - 10} more` : '';
    throw new Error(
      `Found ${violations.length} symlink(s) with absolute targets inside staged .app (build-machine paths leaked into DMG):\n${sample}${suffix}`,
    );
  }
}

function createDmg(options) {
  if (!existsSync(options.appPath)) {
    throw new Error(`App bundle not found: ${options.appPath}`);
  }

  mkdirSync(options.outputDir, { recursive: true });
  const stagingDir = mkdtempSync(join(tmpdir(), 'clowder-macos-dmg-'));
  const dmgPath = join(options.outputDir, `Clowder-AI-${rootPackageJson.version}.dmg`);
  const imageSize = estimateDmgSizeMegabytes(options.appPath);

  try {
    logStep('Preparing dmg staging directory');
    const stagedAppPath = join(stagingDir, `${appName}.app`);
    cpSync(options.appPath, stagedAppPath, { recursive: true, force: true, verbatimSymlinks: true });
    createApplicationsAlias(stagingDir);
    writeReadme(stagingDir);

    logStep('Verifying no external symlinks in staged .app');
    verifyNoExternalSymlinks(stagedAppPath);

    logStep(`Creating unsigned dmg at ${dmgPath}`);
    rmSync(dmgPath, { force: true });
    run('hdiutil', [
      'create',
      '-volname',
      appName,
      '-srcfolder',
      stagingDir,
      '-ov',
      '-format',
      'UDZO',
      '-imagekey',
      'zlib-level=9',
      '-size',
      `${imageSize}m`,
      dmgPath,
    ]);

    return dmgPath;
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

function main() {
  if (process.platform !== 'darwin') {
    throw new Error('macOS dmg packaging must run on darwin');
  }

  const options = parseArgs(process.argv.slice(2));
  buildAppIfNeeded(options);
  const dmgPath = createDmg(options);
  logStep(`DMG ready at ${dmgPath}`);
}

main();
