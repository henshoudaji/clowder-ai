import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveEmbeddedRuntimeKind, type CatConfig } from '@cat-cafe/shared';
import { loadCatConfig, toAllCatConfigs } from './cat-config-loader.js';
import { resolveProjectTemplatePath } from './project-template-path.js';
import { resolveBuiltinClientForProvider } from './provider-binding-compat.js';
import { builtinAccountIdForClient } from './provider-profiles.js';

type LegacyAwareCatConfig = CatConfig & { providerProfileId?: string };

function trimBinding(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isSeedCat(projectRoot: string, catId: string): boolean {
  try {
    const seedCats = toAllCatConfigs(loadCatConfig(resolveProjectTemplatePath(projectRoot)));
    return Object.hasOwn(seedCats, catId);
  } catch {
    return false;
  }
}

export function resolveBoundAccountRefForCat(
  projectRoot: string,
  catId: string,
  catConfig: LegacyAwareCatConfig | null | undefined,
): string | undefined {
  if (!catConfig) return undefined;

  const source = isSeedCat(projectRoot, catId) ? 'seed' : 'runtime';
  if (resolveEmbeddedRuntimeKind({ id: catId, provider: catConfig.provider, source }) === 'agentteams_acp') {
    return trimBinding(catConfig.accountRef);
  }

  const explicitProviderProfileId = trimBinding(catConfig.providerProfileId);
  if (explicitProviderProfileId) return explicitProviderProfileId;

  const explicitAccountRef = trimBinding(catConfig.accountRef);
  if (!explicitAccountRef) return undefined;

  const builtinClient = resolveBuiltinClientForProvider(catConfig.provider);
  const runtimeCatalogExists = existsSync(resolve(projectRoot, '.cat-cafe', 'cat-catalog.json'));
  const builtinDefaultAccountRef = builtinClient ? builtinAccountIdForClient(builtinClient) : null;
  const inheritedTemplateDefaultBinding =
    !runtimeCatalogExists && !!builtinDefaultAccountRef && explicitAccountRef === builtinDefaultAccountRef;
  const inheritedSeedBootstrapBinding =
    runtimeCatalogExists && isSeedCat(projectRoot, catId) && !!builtinDefaultAccountRef && explicitAccountRef === builtinDefaultAccountRef;

  if (inheritedTemplateDefaultBinding || inheritedSeedBootstrapBinding) {
    return undefined;
  }

  return explicitAccountRef;
}
