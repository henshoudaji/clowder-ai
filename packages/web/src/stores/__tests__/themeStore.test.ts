import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeStore } from '../themeStore';

const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  }),
  key: vi.fn(() => null),
  get length() {
    return Object.keys(mockStorage).length;
  },
};

vi.stubGlobal('localStorage', mockLocalStorage);

beforeEach(() => {
  mockLocalStorage.clear();
  vi.clearAllMocks();
  useThemeStore.setState({
    theme: 'business',
    isLoaded: false,
  });
});

describe('themeStore', () => {
  it('keeps theme runtime state without embedding style config objects', () => {
    const state = useThemeStore.getState() as unknown as Record<string, unknown>;

    expect(state.theme).toBe('business');
    expect(state.isLoaded).toBe(false);
    expect('config' in state).toBe(false);
  });

  it('initializes from localStorage while remaining config-free', () => {
    mockStorage['clowder-ai-theme'] = 'business';

    useThemeStore.getState().initializeTheme();

    const state = useThemeStore.getState() as unknown as Record<string, unknown>;
    expect(state.theme).toBe('business');
    expect(state.isLoaded).toBe(true);
    expect('config' in state).toBe(false);
  });

  it('migrates legacy default theme storage to business', () => {
    mockStorage['clowder-ai-theme'] = 'default';

    useThemeStore.getState().initializeTheme();

    const state = useThemeStore.getState() as unknown as Record<string, unknown>;
    expect(state.theme).toBe('business');
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('clowder-ai-theme', 'business');
  });
});
