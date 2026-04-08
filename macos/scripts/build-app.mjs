#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const rootPackageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

const APP_DISPLAY_NAME = 'Clowder AI';
const APP_EXECUTABLE_NAME = 'ClowderAI';
const APP_BUNDLE_ID = 'ai.clowder.desktop';
const MAC_RUNTIME_NPM_ARGS = [
  'install',
  '--omit=dev',
  '--no-audit',
  '--no-fund',
  '--package-lock=false',
  '--loglevel=error',
];
const WEB_RUNTIME_DEPENDENCIES = ['next', 'react', 'react-dom', 'sharp'];
const WEB_STANDALONE_BUILD_DIR = join(repoRoot, 'packages', 'web', '.next', 'standalone');
const WEB_STANDALONE_APP_DIR = join(WEB_STANDALONE_BUILD_DIR, 'packages', 'web');
const WEB_STANDALONE_NODE_MODULES_DIR = join(WEB_STANDALONE_BUILD_DIR, 'node_modules');
const WEB_BUILD_STATIC_DIR = join(repoRoot, 'packages', 'web', '.next', 'static');
const WEB_PUBLIC_DIR = join(repoRoot, 'packages', 'web', 'public');
const RUNTIME_WEB_STANDALONE_SERVER = `const fs = require('node:fs');
const path = require('node:path');

function resolveApiBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_API_URL?.replace(/\\/+$/, '');
  if (explicit) return explicit;

  const apiPort = Number(process.env.API_SERVER_PORT);
  if (Number.isInteger(apiPort) && apiPort > 0) {
    return \`http://localhost:\${apiPort}\`;
  }

  const frontendPort = Number(process.env.FRONTEND_PORT);
  if (Number.isInteger(frontendPort) && frontendPort > 0) {
    return \`http://localhost:\${frontendPort + 1}\`;
  }

  return 'http://localhost:3004';
}

const dir = __dirname;

process.env.NODE_ENV = 'production';
process.chdir(__dirname);

const currentPort = parseInt(process.env.PORT, 10) || 3000;
const hostname = process.env.HOSTNAME || '127.0.0.1';

let keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT, 10);

const requiredServerFiles = JSON.parse(
  fs.readFileSync(path.join(__dirname, '.next', 'required-server-files.json'), 'utf8'),
);
const nextConfig = requiredServerFiles.config || {};
const rewrites = nextConfig._originalRewrites || {};
const afterFiles = Array.isArray(rewrites.afterFiles)
  ? rewrites.afterFiles.filter((entry) => entry && entry.source !== '/uploads/:path*')
  : [];

nextConfig._originalRewrites = {
  beforeFiles: Array.isArray(rewrites.beforeFiles) ? rewrites.beforeFiles : [],
  afterFiles: [
    ...afterFiles,
    {
      source: '/uploads/:path*',
      destination: \`\${resolveApiBaseUrl()}/uploads/:path*\`,
    },
  ],
  fallback: Array.isArray(rewrites.fallback) ? rewrites.fallback : [],
};

process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);

require('next');
const { startServer } = require('next/dist/server/lib/start-server');

if (
  Number.isNaN(keepAliveTimeout) ||
  !Number.isFinite(keepAliveTimeout) ||
  keepAliveTimeout < 0
) {
  keepAliveTimeout = undefined;
}

startServer({
  dir,
  isDev: false,
  config: nextConfig,
  hostname,
  port: currentPort,
  allowRetry: false,
  keepAliveTimeout,
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

function parseArgs(argv) {
  const options = {
    outputDir: resolve(repoRoot, 'dist', 'macos'),
    appName: APP_DISPLAY_NAME,
    bundleId: APP_BUNDLE_ID,
    skipBuild: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    switch (arg) {
      case '--output-dir':
        options.outputDir = resolve(repoRoot, value ?? '');
        index += 1;
        break;
      case '--app-name':
        options.appName = value ?? options.appName;
        index += 1;
        break;
      case '--bundle-id':
        options.bundleId = value ?? options.bundleId;
        index += 1;
        break;
      case '--skip-build':
        options.skipBuild = true;
        break;
      case '--help':
      case '-h':
        process.stdout.write(
          `Usage: node macos/scripts/build-app.mjs [options]\n\nOptions:\n  --output-dir <path>  Override dist/macos output root\n  --app-name <name>    Override app display name\n  --bundle-id <id>     Override CFBundleIdentifier\n  --skip-build         Reuse existing production build artifacts\n`,
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
  process.stdout.write(`\n[macos-app] ${message}\n`);
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

function commandExists(command) {
  const result = spawnSync(command, ['--version'], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
  return !result.error && result.status === 0;
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function resetDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function fillInfoPlist(templatePath, options) {
  const template = readFileSync(templatePath, 'utf8');
  return template
    .replaceAll('__APP_DISPLAY_NAME__', options.appName)
    .replaceAll('__APP_EXECUTABLE_NAME__', APP_EXECUTABLE_NAME)
    .replaceAll('__APP_BUNDLE_ID__', options.bundleId)
    .replaceAll('__APP_VERSION__', rootPackageJson.version);
}

function copyExecutable(sourcePath, destinationPath) {
  copyFileSync(sourcePath, destinationPath);
  chmodSync(destinationPath, 0o755);
}

function buildNativeLauncher(destinationPath) {
  if (!commandExists('swiftc')) {
    throw new Error('swiftc is required to build the native macOS launcher');
  }
  run('swiftc', [
    '-O',
    '-framework',
    'AppKit',
    '-framework',
    'WebKit',
    join(repoRoot, 'macos', 'packaging', 'Launcher.swift'),
    '-o',
    destinationPath,
  ]);
  chmodSync(destinationPath, 0o755);
}

function installLauncherExecutable(destinationPath) {
  try {
    logStep('Building native Swift launcher');
    buildNativeLauncher(destinationPath);
    return {
      type: 'native-swift',
      fallbackUsed: false,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logStep(`Native launcher unavailable, falling back to shell stub: ${reason}`);
    copyExecutable(join(repoRoot, 'macos', 'packaging', 'launcher-stub.sh'), destinationPath);
    return {
      type: 'shell-stub',
      fallbackUsed: true,
      fallbackReason: reason,
    };
  }
}

function copyIfPresent(sourcePath, destinationPath) {
  if (!existsSync(sourcePath)) {
    return;
  }
  ensureDir(dirname(destinationPath));
  cpSync(sourcePath, destinationPath, { recursive: true, force: true, verbatimSymlinks: true });
}

function removePaths(rootDir, relativePaths) {
  for (const relativePath of relativePaths) {
    rmSync(join(rootDir, relativePath), { recursive: true, force: true });
  }
}

function walkFiles(rootDir, visitor) {
  if (!existsSync(rootDir)) {
    return;
  }
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') {
          continue;
        }
        stack.push(fullPath);
        continue;
      }
      visitor(fullPath, entry);
    }
  }
}

function removeNamedDirectoriesRecursive(rootDir, directoryNames) {
  if (!existsSync(rootDir)) {
    return;
  }
  const names = new Set(directoryNames);
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name === 'node_modules') {
        continue;
      }
      const fullPath = join(current, entry.name);
      if (names.has(entry.name)) {
        rmSync(fullPath, { recursive: true, force: true });
        continue;
      }
      stack.push(fullPath);
    }
  }
}

function pruneRuntimePackage(targetDir, options = {}) {
  removePaths(targetDir, options.removePaths ?? []);
  removeNamedDirectoriesRecursive(targetDir, ['test', 'tests', '__tests__', 'example', 'examples', 'doc', 'docs']);
  walkFiles(targetDir, (fullPath, entry) => {
    const fileName = entry.name;
    if (fileName === 'package-lock.json' || fileName === '.package-lock.json') {
      rmSync(fullPath, { force: true });
      return;
    }
    if (fileName.endsWith('.d.ts.map') || fileName.endsWith('.map')) {
      rmSync(fullPath, { force: true });
      return;
    }
    if (fileName.endsWith('.md') || fileName.endsWith('.yml') || fileName.endsWith('.yaml')) {
      rmSync(fullPath, { force: true });
      return;
    }
    if (/^(README|CHANGELOG|CONTRIBUTING)(\..+)?$/i.test(fileName)) {
      rmSync(fullPath, { force: true });
      return;
    }
    if (/^\.(eslintrc|prettierrc|editorconfig|babelrc)/i.test(fileName)) {
      rmSync(fullPath, { force: true });
    }
  });
}

function createRuntimePackageJson(sourcePath, options = {}) {
  const source = readJson(sourcePath);
  const runtimePackage = {
    name: source.name,
    version: source.version,
    private: source.private ?? true,
  };

  for (const key of ['type', 'main', 'bin', 'exports', 'types']) {
    if (source[key] !== undefined) {
      runtimePackage[key] = source[key];
    }
  }

  if (options.scripts) {
    runtimePackage.scripts = options.scripts;
  } else if (source.scripts?.start) {
    runtimePackage.scripts = { start: source.scripts.start };
  }

  const dependencies = { ...(source.dependencies ?? {}) };
  if (dependencies['@cat-cafe/shared']) {
    dependencies['@cat-cafe/shared'] = 'file:../shared';
  }
  if (Object.keys(dependencies).length > 0) {
    runtimePackage.dependencies = dependencies;
  }

  if (source.optionalDependencies && Object.keys(source.optionalDependencies).length > 0) {
    runtimePackage.optionalDependencies = source.optionalDependencies;
  }

  return runtimePackage;
}

function resolveInstalledPackageVersion(nodeModulesDir, packageName) {
  const packageJsonPath = join(nodeModulesDir, packageName, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return null;
  }
  const installed = readJson(packageJsonPath);
  return typeof installed.version === 'string' && installed.version.trim().length > 0 ? installed.version.trim() : null;
}

function createStandaloneWebRuntimePackageJson(sourcePath) {
  const source = readJson(sourcePath);
  const runtimePackage = createRuntimePackageJson(sourcePath, {
    scripts: {
      start: 'node server.js',
    },
  });

  const runtimeDependencies = Object.fromEntries(
    WEB_RUNTIME_DEPENDENCIES.flatMap((dependency) => {
      const sourceVersion = source.dependencies?.[dependency];
      if (sourceVersion) {
        return [[dependency, sourceVersion]];
      }
      const installedVersion = resolveInstalledPackageVersion(WEB_STANDALONE_NODE_MODULES_DIR, dependency);
      return installedVersion ? [[dependency, installedVersion]] : [];
    }),
  );

  if (Object.keys(runtimeDependencies).length > 0) {
    runtimePackage.dependencies = runtimeDependencies;
  } else {
    delete runtimePackage.dependencies;
  }

  delete runtimePackage.optionalDependencies;
  return runtimePackage;
}

function stageRuntimePackageTemplate(targetRootDir, packageName, config) {
  const sourceDir = join(repoRoot, 'packages', packageName);
  const targetDir = join(targetRootDir, 'packages', packageName);
  resetDir(targetDir);
  for (const relativePath of config.copyPaths) {
    copyIfPresent(join(sourceDir, relativePath), join(targetDir, relativePath));
  }
  writeJson(join(targetDir, 'package.json'), createRuntimePackageJson(join(sourceDir, 'package.json'), config));
  pruneRuntimePackage(targetDir, { removePaths: config.removePaths ?? [] });
}

function stageApiRuntime(targetRootDir) {
  const sourceDir = join(repoRoot, 'packages', 'api');
  const targetDir = join(targetRootDir, 'packages', 'api');
  if (!existsSync(join(sourceDir, 'dist', 'index.js'))) {
    throw new Error(`Missing API build artifact for bundling: ${join(sourceDir, 'dist', 'index.js')}`);
  }

  resetDir(targetDir);
  copyIfPresent(join(sourceDir, 'dist'), join(targetDir, 'dist'));
  writeJson(
    join(targetDir, 'package.json'),
    createRuntimePackageJson(join(sourceDir, 'package.json'), {
      scripts: {
        start: 'node dist/index.js',
      },
    }),
  );
  pruneRuntimePackage(targetDir, { removePaths: ['src', 'test', 'scripts', 'uploads', 'tsconfig.json'] });
}

function stageStandaloneWebRuntime(targetRootDir) {
  const sourceDir = join(repoRoot, 'packages', 'web');
  const targetDir = join(targetRootDir, 'packages', 'web');
  const standaloneServerPath = join(WEB_STANDALONE_APP_DIR, 'server.js');

  if (!existsSync(standaloneServerPath)) {
    resetDir(targetDir);
    copyIfPresent(join(sourceDir, '.next'), join(targetDir, '.next'));
    copyIfPresent(WEB_PUBLIC_DIR, join(targetDir, 'public'));
    copyIfPresent(join(sourceDir, 'next.config.js'), join(targetDir, 'next.config.js'));
    writeJson(
      join(targetDir, 'package.json'),
      createRuntimePackageJson(join(sourceDir, 'package.json'), {
        scripts: {
          start: 'next start',
        },
      }),
    );
    pruneRuntimePackage(targetDir, {
      removePaths: [
        'src',
        'test',
        'worker',
        '.next/cache',
        '.next/standalone',
        '.next/types',
        'next-env.d.ts',
        'postcss.config.js',
        'tailwind.config.js',
        'tsconfig.json',
        'vitest.config.ts',
      ],
    });
    return;
  }

  if (!existsSync(WEB_STANDALONE_NODE_MODULES_DIR)) {
    throw new Error(`Missing Next standalone node_modules: ${WEB_STANDALONE_NODE_MODULES_DIR}`);
  }

  resetDir(targetDir);
  cpSync(WEB_STANDALONE_APP_DIR, targetDir, { recursive: true, force: true, verbatimSymlinks: true });
  rmSync(join(targetDir, 'node_modules'), { recursive: true, force: true });
  copyIfPresent(WEB_BUILD_STATIC_DIR, join(targetDir, '.next', 'static'));
  copyIfPresent(WEB_PUBLIC_DIR, join(targetDir, 'public'));
  writeJson(join(targetDir, 'package.json'), createStandaloneWebRuntimePackageJson(join(sourceDir, 'package.json')));
  writeFileSync(join(targetDir, 'server.js'), RUNTIME_WEB_STANDALONE_SERVER, 'utf8');
  pruneRuntimePackage(targetDir, {
    removePaths: [
      'src',
      'test',
      'worker',
      '.next/cache',
      '.next/types',
      'next-env.d.ts',
      'postcss.config.js',
      'tailwind.config.js',
      'tsconfig.json',
      'vitest.config.ts',
    ],
  });
}

function ensureBuildArtifacts(options) {
  if (options.skipBuild) {
    return;
  }

  logStep('Building shared, mcp-server, api, and web');
  run('pnpm', ['--filter', '@cat-cafe/shared', 'run', 'build']);
  run('pnpm', ['--filter', '@cat-cafe/mcp-server', 'run', 'build']);
  run('pnpm', ['--filter', '@cat-cafe/api', 'run', 'build']);
  run('pnpm', ['--filter', '@cat-cafe/web', 'run', 'build'], {
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  });
}

function stageWorkspacePackages(targetRootDir) {
  stageRuntimePackageTemplate(targetRootDir, 'shared', {
    copyPaths: ['dist'],
    removePaths: ['tsconfig.json'],
  });
  stageApiRuntime(targetRootDir);
  stageRuntimePackageTemplate(targetRootDir, 'mcp-server', {
    copyPaths: ['dist'],
    removePaths: ['src', 'test', 'tsconfig.json'],
  });
  stageStandaloneWebRuntime(targetRootDir);
}

function resolveNpmCommand() {
  return join(dirname(process.execPath), 'npm');
}

function runNpmInstall(packageDir) {
  run(resolveNpmCommand(), MAC_RUNTIME_NPM_ARGS, {
    cwd: packageDir,
    env: {
      PUPPETEER_SKIP_DOWNLOAD: '1',
    },
  });
}

function materializeSharedDependency(stagePackagesDir, packageName) {
  const sharedLinkPath = join(stagePackagesDir, packageName, 'node_modules', '@cat-cafe', 'shared');
  try {
    if (!lstatSync(sharedLinkPath).isSymbolicLink()) {
      return;
    }
  } catch {
    return;
  }

  rmSync(sharedLinkPath, { recursive: true, force: true });
  cpSync(join(stagePackagesDir, 'shared'), sharedLinkPath, { recursive: true, force: true, verbatimSymlinks: true });
  pruneRuntimePackage(sharedLinkPath);
}

function installMacRuntimeDependencies(runtimeRoot) {
  const stagePackagesDir = join(runtimeRoot, 'packages');
  for (const packageName of ['api', 'mcp-server', 'web']) {
    logStep(`Installing runtime dependencies for ${packageName}`);
    runNpmInstall(join(stagePackagesDir, packageName));
    materializeSharedDependency(stagePackagesDir, packageName);
    pruneRuntimePackage(join(stagePackagesDir, packageName));
  }
}

function stageCurrentMacNode(runtimeRoot) {
  const nodeRoot = dirname(dirname(process.execPath));
  const targetDir = join(runtimeRoot, 'node');
  resetDir(targetDir);
  cpSync(nodeRoot, targetDir, { recursive: true, force: true, verbatimSymlinks: true });
  removePaths(targetDir, ['include', 'share']);
  return {
    version: process.version,
    sourceRoot: nodeRoot,
    executable: 'bin/node',
  };
}

function writeRuntimeReleaseMetadata(runtimeRoot, options, bundledNode, launcher) {
  const metadata = {
    name: options.appName,
    version: rootPackageJson.version,
    generatedAt: new Date().toISOString(),
    platform: 'darwin',
    executableName: APP_EXECUTABLE_NAME,
    bundleId: options.bundleId,
    scaffold: false,
    managedTopLevelPaths: ['scripts', 'node', 'packages', 'assets', '.clowder-release.json', 'package.json'],
    bundledNode,
    launcher,
  };
  writeJson(join(runtimeRoot, '.clowder-release.json'), metadata);
}

function writeRuntimePackageJson(runtimeRoot) {
  writeJson(join(runtimeRoot, 'package.json'), {
    name: 'clowder-ai-runtime',
    version: rootPackageJson.version,
    private: true,
  });
}

function verifyRuntimeLayout(runtimeRoot) {
  const requiredPaths = [
    join(runtimeRoot, 'node', 'bin', 'node'),
    join(runtimeRoot, 'packages', 'api', 'package.json'),
    join(runtimeRoot, 'packages', 'api', 'dist', 'index.js'),
    join(runtimeRoot, 'packages', 'mcp-server', 'package.json'),
    join(runtimeRoot, 'packages', 'mcp-server', 'dist', 'index.js'),
    join(runtimeRoot, 'packages', 'shared', 'package.json'),
    join(runtimeRoot, 'packages', 'shared', 'dist', 'index.js'),
    join(runtimeRoot, 'packages', 'web', 'package.json'),
    join(runtimeRoot, 'scripts', 'start-bundle.sh'),
  ];

  for (const requiredPath of requiredPaths) {
    if (!existsSync(requiredPath)) {
      throw new Error(`Missing required runtime path: ${requiredPath}`);
    }
  }
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
      `Found ${violations.length} symlink(s) with absolute targets inside .app (build-machine paths leaked into bundle):\n${sample}${suffix}`,
    );
  }
}

function buildAppBundle(options) {
  const outputDir = options.outputDir;
  const appRoot = join(outputDir, `${options.appName}.app`);
  const contentsDir = join(appRoot, 'Contents');
  const macOsDir = join(contentsDir, 'MacOS');
  const resourcesDir = join(contentsDir, 'Resources');
  const runtimeRoot = join(resourcesDir, 'runtime');
  const runtimeScriptsDir = join(runtimeRoot, 'scripts');
  const runtimeAssetsDir = join(runtimeRoot, 'assets');

  logStep('Preparing app output directories');
  ensureDir(outputDir);
  resetDir(appRoot);
  ensureDir(macOsDir);
  ensureDir(resourcesDir);
  ensureDir(runtimeScriptsDir);
  ensureDir(runtimeAssetsDir);

  logStep('Writing Info.plist');
  const infoPlist = fillInfoPlist(join(repoRoot, 'macos', 'packaging', 'Info.plist'), options);
  writeFileSync(join(contentsDir, 'Info.plist'), infoPlist, 'utf8');

  logStep('Installing launcher executable');
  const launcher = installLauncherExecutable(join(macOsDir, APP_EXECUTABLE_NAME));

  logStep('Staging runtime scripts');
  copyExecutable(join(repoRoot, 'macos', 'scripts', 'start-bundle.sh'), join(runtimeScriptsDir, 'start-bundle.sh'));
  copyExecutable(join(repoRoot, 'macos', 'scripts', 'stop-bundle.sh'), join(runtimeScriptsDir, 'stop-bundle.sh'));
  copyExecutable(
    join(repoRoot, 'macos', 'scripts', 'write-runtime-state.mjs'),
    join(runtimeScriptsDir, 'write-runtime-state.mjs'),
  );

  ensureBuildArtifacts(options);

  logStep('Staging runtime packages');
  stageWorkspacePackages(runtimeRoot);

  logStep('Installing macOS runtime dependencies');
  installMacRuntimeDependencies(runtimeRoot);

  logStep('Bundling current macOS Node runtime');
  const bundledNode = stageCurrentMacNode(runtimeRoot);

  logStep('Writing runtime metadata');
  writeRuntimePackageJson(runtimeRoot);
  writeRuntimeReleaseMetadata(runtimeRoot, options, bundledNode, launcher);

  logStep('Copying placeholder assets when available');
  copyIfPresent(join(repoRoot, 'packaging', 'windows', 'desktop', 'splash.jpg'), join(runtimeAssetsDir, 'splash.jpg'));

  logStep('Verifying runtime layout');
  verifyRuntimeLayout(runtimeRoot);

  logStep('Verifying no external symlinks leaked into bundle');
  verifyNoExternalSymlinks(appRoot);

  logStep(`macOS app scaffold ready at ${appRoot}`);
  return { appRoot, runtimeRoot };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (process.platform !== 'darwin') {
    throw new Error('macOS app packaging scaffold must run on darwin');
  }
  buildAppBundle(options);
}

main();
