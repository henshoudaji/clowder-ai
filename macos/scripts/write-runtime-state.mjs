#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const options = {
    file: null,
    mode: 'bundle-production',
    frontendUrl: null,
    apiUrl: null,
    frontendPort: null,
    apiPort: null,
    apiPidFile: null,
    webPidFile: null,
    mcpServerPidFile: null,
    startedAt: new Date().toISOString(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    switch (arg) {
      case '--file':
        options.file = resolve(value ?? '');
        index += 1;
        break;
      case '--mode':
        options.mode = value ?? options.mode;
        index += 1;
        break;
      case '--frontend-url':
        options.frontendUrl = value ?? null;
        index += 1;
        break;
      case '--api-url':
        options.apiUrl = value ?? null;
        index += 1;
        break;
      case '--frontend-port':
        options.frontendPort = value ? Number.parseInt(value, 10) : null;
        index += 1;
        break;
      case '--api-port':
        options.apiPort = value ? Number.parseInt(value, 10) : null;
        index += 1;
        break;
      case '--api-pid-file':
        options.apiPidFile = value ? resolve(value) : null;
        index += 1;
        break;
      case '--web-pid-file':
        options.webPidFile = value ? resolve(value) : null;
        index += 1;
        break;
      case '--mcp-server-pid-file':
        options.mcpServerPidFile = value ? resolve(value) : null;
        index += 1;
        break;
      case '--started-at':
        options.startedAt = value ?? options.startedAt;
        index += 1;
        break;
      case '--help':
      case '-h':
        process.stdout.write(
          `Usage: node macos/scripts/write-runtime-state.mjs --file <path> [options]\n\nOptions:\n  --mode <mode>\n  --frontend-url <url>\n  --api-url <url>\n  --frontend-port <port>\n  --api-port <port>\n  --api-pid-file <path>\n  --web-pid-file <path>\n  --mcp-server-pid-file <path>\n  --started-at <iso-timestamp>\n`,
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.file) {
    throw new Error('--file is required');
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));
const state = {
  mode: options.mode,
  frontendUrl: options.frontendUrl,
  apiUrl: options.apiUrl,
  frontendPort: Number.isInteger(options.frontendPort) ? options.frontendPort : null,
  apiPort: Number.isInteger(options.apiPort) ? options.apiPort : null,
  pidFiles: {
    api: options.apiPidFile,
    web: options.webPidFile,
    mcpServer: options.mcpServerPidFile,
  },
  startedAt: options.startedAt,
};

mkdirSync(dirname(options.file), { recursive: true });
writeFileSync(options.file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
