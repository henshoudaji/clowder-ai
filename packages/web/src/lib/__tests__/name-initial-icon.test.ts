import { describe, expect, it } from 'vitest';
import { getNameInitial, getNameInitialIconTheme } from '../name-initial-icon';

describe('name initial icon utils', () => {
  it('normalizes initial as uppercase for latin letters', () => {
    expect(getNameInitial('gpt-5')).toBe('G');
  });

  it('supports non-latin initials and empty names', () => {
    expect(getNameInitial(' 缅因猫')).toBe('缅');
    expect(getNameInitial('   ')).toBe('?');
  });

  it('returns stable themed colors for same name and varying colors for different names', () => {
    const first = getNameInitialIconTheme('model-a');
    const second = getNameInitialIconTheme('model-a');
    const other = getNameInitialIconTheme('model-b');

    expect(first).toEqual(second);
    expect(first.background).not.toBe(other.background);
    expect(first.borderColor).not.toBe(other.borderColor);
  });
});
