import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ProviderProfileProtocol, ProviderProfileView } from './provider-profiles.types.js';
import { resolveProviderProfilesRootSync } from './provider-profiles-root.js';

export interface ModelConfigBinding {
  id: string;
  models: string[];
  displayName?: string;
  description?: string;
  icon?: string;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  protocol?: ProviderProfileProtocol;
}
export const HUAWEI_MAAS_MODEL_SOURCE_ID = 'huawei-maas';
export const MODEL_CONFIG_FALLBACK_ENV = 'CAT_CAFE_MODEL_CONFIG_FALLBACK_ENABLED';

export interface CreateProjectModelConfigSourceInput {
  id: string;
  displayName?: string;
  description?: string;
  icon?: string;
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  models: string[];
}

export interface UpdateProjectModelConfigSourceInput {
  displayName?: string | null;
  description?: string | null;
  icon?: string | null;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  models?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeModelArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function normalizeModelIds(value: unknown): string[] {
  const ids = normalizeModelArray(value)
    .map((item) => (typeof item.id === 'string' ? item.id.trim() : ''))
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function normalizeHeaderMap(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .map(([key, rawValue]) => {
      const trimmedKey = key.trim();
      const trimmedValue = typeof rawValue === 'string' ? rawValue.trim() : '';
      if (!trimmedKey || !trimmedValue) return null;
      return [trimmedKey, trimmedValue] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}
function normalizeModelConfigRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return { ...value };
}
function inferProtocol(profileId: string): ProviderProfileProtocol | undefined {
  if (profileId.trim().toLowerCase() === HUAWEI_MAAS_MODEL_SOURCE_ID) return 'huawei_maas';
  return undefined;
}

function displayNameForBinding(binding: ModelConfigBinding): string {
  if (binding.protocol === 'huawei_maas') return 'Huawei MaaS';
  return binding.displayName?.trim() || binding.id;
}

function normalizeOpenAiBinding(id: string, value: Record<string, unknown>): ModelConfigBinding | null {
  const protocol = typeof value.protocol === 'string' ? value.protocol.trim().toLowerCase() : '';
  if (protocol !== 'openai') return null;

  const models = normalizeModelIds(value.models);
  const baseUrl = typeof value.baseUrl === 'string' ? value.baseUrl.trim() : '';
  const apiKey = typeof value.apiKey === 'string' ? value.apiKey.trim() : '';
  if (!baseUrl || !apiKey || models.length === 0) return null;

  const displayName = typeof value.displayName === 'string' ? value.displayName.trim() : '';
  const description = typeof value.description === 'string' ? value.description.trim() : '';
  const icon = typeof value.icon === 'string' ? value.icon.trim() : '';
  const headers = normalizeHeaderMap(value.headers);
  return {
    id,
    models,
    protocol: 'openai',
    ...(displayName ? { displayName } : {}),
    ...(description ? { description } : {}),
    ...(icon ? { icon } : {}),
    baseUrl,
    apiKey,
    ...(headers ? { headers } : {}),
  } satisfies ModelConfigBinding;
}

function normalizeModelSourceBinding(id: string, value: unknown): ModelConfigBinding | null {
  const protocol = inferProtocol(id);
  if (Array.isArray(value)) {
    if (protocol !== 'huawei_maas') return null;
    return {
      id,
      models: normalizeModelIds(value),
      ...(protocol ? { protocol } : {}),
    } satisfies ModelConfigBinding;
  }
  if (isRecord(value)) {
    if (protocol === 'huawei_maas') {
      const models = normalizeModelIds(value.models);
      return {
        id,
        models,
        protocol,
      } satisfies ModelConfigBinding;
    }
    return normalizeOpenAiBinding(id, value);
  }
  return null;
}

export function resolveProjectModelConfigPath(projectRoot: string): string {
  return join(resolveProviderProfilesRootSync(projectRoot), '.cat-cafe', 'model.json');
}

export function isModelConfigProviderFallbackEnabled(): boolean {
  const raw = process.env[MODEL_CONFIG_FALLBACK_ENV]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export async function readProjectModelConfigDocument(projectRoot: string): Promise<Record<string, unknown> | null> {
  const filePath = resolveProjectModelConfigPath(projectRoot);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as { code?: string })?.code === 'ENOENT') return null;
    throw error;
  }

  const trimmed = raw.trim();
  if (!trimmed) return {};
  return normalizeModelConfigRecord(JSON.parse(trimmed) as unknown);
}

export async function readProjectModelConfigBindings(projectRoot: string): Promise<ModelConfigBinding[] | null> {
  const parsedRaw = await readProjectModelConfigDocument(projectRoot);
  if (!parsedRaw) return null;

  return Object.entries(parsedRaw)
    .map(([id, value]) => {
      const trimmedId = id.trim();
      if (!trimmedId) return null;
      return normalizeModelSourceBinding(trimmedId, value);
    })
    .filter((entry): entry is ModelConfigBinding => entry !== null);
}

export async function createProjectModelConfigSource(
  projectRoot: string,
  input: CreateProjectModelConfigSourceInput,
): Promise<ModelConfigBinding> {
  const trimmedId = input.id.trim();
  if (!trimmedId) {
    throw new Error('model config source id is required');
  }
  if (trimmedId === HUAWEI_MAAS_MODEL_SOURCE_ID) {
    throw new Error(`model config source "${HUAWEI_MAAS_MODEL_SOURCE_ID}" is reserved`);
  }

  const existingDocument = (await readProjectModelConfigDocument(projectRoot)) ?? {};
  if (existingDocument[trimmedId] !== undefined) {
    throw new Error(`model config source "${trimmedId}" already exists`);
  }

  const models = Array.from(new Set(input.models.map((model) => model.trim()).filter(Boolean)));
  if (models.length === 0) {
    throw new Error('at least one model is required');
  }

  const baseUrl = input.baseUrl.trim();
  const apiKey = input.apiKey.trim();
  if (!baseUrl || !apiKey) {
    throw new Error('baseUrl and apiKey are required');
  }

  const displayName = input.displayName?.trim();
  const description = input.description?.trim();
  const icon = input.icon?.trim();
  const headers = normalizeHeaderMap(input.headers);
  const nextDocument: Record<string, unknown> = {
    ...existingDocument,
    [trimmedId]: {
      protocol: 'openai',
      ...(displayName ? { displayName } : {}),
      ...(description ? { description } : {}),
      ...(icon ? { icon } : {}),
      baseUrl,
      apiKey,
      ...(headers ? { headers } : {}),
      models: models.map((model) => ({ id: model })),
    },
  };

  const filePath = resolveProjectModelConfigPath(projectRoot);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(nextDocument, null, 2)}\n`, 'utf-8');

  return {
    id: trimmedId,
    protocol: 'openai',
    ...(displayName ? { displayName } : {}),
    ...(description ? { description } : {}),
    ...(icon ? { icon } : {}),
    baseUrl,
    apiKey,
    ...(headers ? { headers } : {}),
    models,
  } satisfies ModelConfigBinding;
}

export async function findProjectModelConfigBinding(
  projectRoot: string,
  accountRef: string,
): Promise<ModelConfigBinding | null> {
  const bindings = await readProjectModelConfigBindings(projectRoot);
  if (!bindings) return null;
  const trimmedRef = accountRef.trim();
  return bindings.find((binding) => binding.id === trimmedRef) ?? null;
}

export async function deleteProjectModelConfigSource(projectRoot: string, sourceId: string): Promise<boolean> {
  const trimmedId = sourceId.trim();
  if (!trimmedId) {
    throw new Error('model config source id is required');
  }
  if (trimmedId === HUAWEI_MAAS_MODEL_SOURCE_ID) {
    throw new Error(`model config source "${HUAWEI_MAAS_MODEL_SOURCE_ID}" cannot be deleted`);
  }

  const existingDocument = await readProjectModelConfigDocument(projectRoot);
  if (!existingDocument || existingDocument[trimmedId] === undefined) {
    return false;
  }

  delete existingDocument[trimmedId];
  const filePath = resolveProjectModelConfigPath(projectRoot);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(existingDocument, null, 2)}\n`, 'utf-8');
  return true;
}

export async function updateProjectModelConfigSource(
  projectRoot: string,
  sourceId: string,
  input: UpdateProjectModelConfigSourceInput,
): Promise<ModelConfigBinding> {
  const trimmedId = sourceId.trim();
  if (!trimmedId) {
    throw new Error('model config source id is required');
  }
  if (trimmedId === HUAWEI_MAAS_MODEL_SOURCE_ID) {
    throw new Error(`model config source "${HUAWEI_MAAS_MODEL_SOURCE_ID}" cannot be updated`);
  }

  const existingDocument = await readProjectModelConfigDocument(projectRoot);
  if (!existingDocument || existingDocument[trimmedId] === undefined) {
    throw new Error(`model config source "${trimmedId}" not found`);
  }

  const existingValue = existingDocument[trimmedId];
  if (!isRecord(existingValue)) {
    throw new Error(`model config source "${trimmedId}" has invalid format`);
  }

  const existing = normalizeOpenAiBinding(trimmedId, existingValue);
  if (!existing) {
    throw new Error(`model config source "${trimmedId}" is not an editable openai source`);
  }

  // Handle displayName: null/empty string means "clear" -> fall back to id
  const displayName =
    input.displayName !== undefined
      ? input.displayName?.trim() || trimmedId // null/empty -> use id as fallback
      : existing.displayName;
  // Handle description/icon: null/empty string means "clear" -> undefined
  const description =
    input.description !== undefined
      ? input.description?.trim() || undefined
      : (existingValue.description as string | undefined);
  const icon = input.icon !== undefined ? input.icon?.trim() || undefined : (existingValue.icon as string | undefined);
  const baseUrl = input.baseUrl !== undefined ? input.baseUrl.trim() : existing.baseUrl;
  const apiKey = input.apiKey !== undefined ? input.apiKey.trim() : existing.apiKey;
  const headers =
    input.headers !== undefined ? normalizeHeaderMap(input.headers) : normalizeHeaderMap(existingValue.headers);
  const models =
    input.models !== undefined
      ? Array.from(new Set(input.models.map((model) => model.trim()).filter(Boolean)))
      : existing.models;

  if (!baseUrl || !apiKey) {
    throw new Error('baseUrl and apiKey are required');
  }
  if (models.length === 0) {
    throw new Error('at least one model is required');
  }

  const updatedRecord: Record<string, unknown> = {
    protocol: 'openai',
    ...(displayName ? { displayName } : {}),
    ...(description ? { description } : {}),
    ...(icon ? { icon } : {}),
    baseUrl,
    apiKey,
    ...(headers ? { headers } : {}),
    models: models.map((model) => ({ id: model })),
  };

  existingDocument[trimmedId] = updatedRecord;
  const filePath = resolveProjectModelConfigPath(projectRoot);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(existingDocument, null, 2)}\n`, 'utf-8');

  return {
    id: trimmedId,
    protocol: 'openai',
    ...(displayName ? { displayName } : {}),
    ...(description ? { description } : {}),
    ...(icon ? { icon } : {}),
    baseUrl,
    apiKey,
    ...(headers ? { headers } : {}),
    models,
  } satisfies ModelConfigBinding;
}

export async function readProjectModelConfigProfileViews(projectRoot: string): Promise<ProviderProfileView[] | null> {
  const bindings = await readProjectModelConfigBindings(projectRoot);
  if (!bindings) return null;

  let timestamp = new Date(0).toISOString();
  try {
    const info = await stat(resolveProjectModelConfigPath(projectRoot));
    timestamp = info.mtime.toISOString();
  } catch {
    timestamp = new Date(0).toISOString();
  }

  return bindings.map((binding) => ({
    id: binding.id,
    provider: binding.id,
    displayName: displayNameForBinding(binding),
    name: displayNameForBinding(binding),
    description: binding.description,
    icon: binding.icon,
    authType: binding.protocol === 'huawei_maas' ? 'none' : 'api_key',
    kind: 'api_key' as const,
    builtin: false,
    mode: binding.protocol === 'huawei_maas' ? ('none' as const) : ('api_key' as const),
    ...(binding.protocol ? { protocol: binding.protocol } : {}),
    models: binding.models,
    hasApiKey: binding.protocol !== 'huawei_maas',
    createdAt: timestamp,
    updatedAt: timestamp,
  })) as ProviderProfileView[];
}
