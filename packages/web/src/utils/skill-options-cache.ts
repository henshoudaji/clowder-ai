import { apiFetch } from './api-client';

export interface SkillOption {
  name: string;
  iconUrl?: string | null;
}

interface CapabilitySkillItem {
  id: string;
  type: 'mcp' | 'skill' | 'limb';
}

interface CapabilitiesResponseLite {
  items?: CapabilitySkillItem[];
}

const SKILL_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedSkillOptions: SkillOption[] | null = null;
let cachedSkillOptionsAt = 0;
let skillOptionsInFlight: Promise<SkillOption[]> | null = null;

export function getCachedSkillOptions(): SkillOption[] | null {
  const now = Date.now();
  if (!cachedSkillOptions) return null;
  if (now - cachedSkillOptionsAt >= SKILL_CACHE_TTL_MS) return null;
  return cachedSkillOptions;
}

export function seedSkillOptionsCache(options: SkillOption[]): void {
  const deduped = Array.from(
    new Map(
      options
        .map((item) => ({
          name: item.name.trim(),
          iconUrl: item.iconUrl ?? null,
        }))
        .filter((item) => item.name.length > 0)
        .map((item) => [item.name, item] as const),
    ).values(),
  );
  cachedSkillOptions = deduped;
  cachedSkillOptionsAt = Date.now();
}

export async function fetchSkillOptionsWithCache(): Promise<SkillOption[]> {
  const cached = getCachedSkillOptions();
  if (cached) return cached;
  if (skillOptionsInFlight) return skillOptionsInFlight;

  skillOptionsInFlight = (async () => {
    try {
      const res = await apiFetch('/api/capabilities?probe=true');
      if (!res.ok) return [];
      const data = (await res.json()) as CapabilitiesResponseLite;
      const names = Array.from(
        new Set(
          (data.items ?? [])
            .filter((item) => item.type === 'skill' && typeof item.id === 'string' && item.id.trim().length > 0)
            .map((item) => item.id.trim()),
        ),
      );
      const options = names.map((name) => ({ name }));
      seedSkillOptionsCache(options);
      return options;
    } catch {
      return [];
    } finally {
      skillOptionsInFlight = null;
    }
  })();

  return skillOptionsInFlight;
}
