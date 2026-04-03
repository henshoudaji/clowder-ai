export interface NameInitialIconTheme {
  background: string;
  borderColor: string;
  textColor: string;
}

function stableHash(input: string): number {
  let hash = 0;
  for (const ch of input) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function getNameInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [initial] = Array.from(trimmed);
  return /[a-z]/i.test(initial) ? initial.toUpperCase() : initial;
}

export function getNameInitialIconTheme(name: string): NameInitialIconTheme {
  const seed = name.trim().toLowerCase() || '?';
  const hue = stableHash(seed) % 360;
  const accent = `hsl(${hue} 66% 52%)`;

  return {
    background: `linear-gradient(145deg, color-mix(in srgb, var(--surface-card) 86%, ${accent}) 0%, color-mix(in srgb, var(--accent-soft) 70%, ${accent}) 100%)`,
    borderColor: `color-mix(in srgb, var(--border-soft) 60%, ${accent})`,
    textColor: `color-mix(in srgb, var(--text-primary) 70%, ${accent})`,
  };
}
