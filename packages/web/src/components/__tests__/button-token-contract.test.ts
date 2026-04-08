import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const globalsCssPath = resolve(testDir, '..', '..', 'app', 'globals.css');
const globalsCss = readFileSync(globalsCssPath, 'utf8');

function getCssBlock(selector: string): string {
  const blocks = [...globalsCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const [, selectorGroup, body] of blocks) {
    const selectors = selectorGroup
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (selectors.length === 1 && selectors[0] === selector) {
      return body;
    }
  }

  throw new Error(`Missing CSS selector: ${selector}`);
}

function getDeclarationValue(block: string, property: string): string | null {
  const match = block.match(new RegExp(`${property}\\s*:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
}

function getVarRefs(value: string): string[] {
  return [...value.matchAll(/var\((--[^)]+)\)/g)].map((match) => match[1]);
}

describe('button token contract in globals.css', () => {
  it('defines button-prefixed aliases in :root', () => {
    expect(globalsCss).toContain('--button-primary-bg:');
    expect(globalsCss).toContain('--button-default-bg:');
    expect(globalsCss).toContain('--button-danger-bg:');
  });

  it('limits semantic button classes to --button-* tokens', () => {
    const selectors = [
      { selector: '.ui-button-primary', properties: ['background', 'color'] },
      { selector: '.ui-button-primary:hover', properties: ['background', 'color'] },
      { selector: '.ui-button-primary:disabled', properties: ['background', 'color'] },
      { selector: '.ui-button-default', properties: ['border', 'background', 'color'] },
      { selector: '.ui-button-default:hover', properties: ['border-color', 'background', 'color'] },
      { selector: '.ui-button-default:disabled', properties: ['border-color', 'background', 'color'] },
      { selector: '.ui-button-danger', properties: ['background', 'color'] },
      { selector: '.ui-button-danger:hover', properties: ['background', 'color'] },
      { selector: '.ui-button-danger:disabled', properties: ['background', 'color'] },
    ];

    for (const { selector, properties } of selectors) {
      const block = getCssBlock(selector);
      const values = properties
        .map((property) => getDeclarationValue(block, property))
        .filter((value): value is string => value !== null);
      const tokenRefs = values.flatMap((value) => getVarRefs(value));
      const visualTokenRefs = tokenRefs.filter((token) => token !== '--border-width-default');

      expect(values.length).toBe(properties.length);
      expect(visualTokenRefs.length).toBeGreaterThan(0);
      expect(visualTokenRefs.every((token) => token.startsWith('--button-'))).toBe(true);
    }
  });
});
