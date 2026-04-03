import { create } from 'zustand';

export type ThemeType = 'warm' | 'business';

const THEME_STORAGE_KEY = 'clowder-ai-theme';

interface ThemeStore {
  theme: ThemeType;
  isLoaded: boolean;
  setTheme: (theme: ThemeType) => void;
  toggleTheme: () => void;
  initializeTheme: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: 'business',
  isLoaded: false,

  setTheme: (newTheme: ThemeType) => {
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    set({ theme: newTheme });
  },

  toggleTheme: () => {
    const { theme } = get();
    const newTheme = theme === 'business' ? 'warm' : 'business';
    get().setTheme(newTheme);
  },

  initializeTheme: () => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const theme: ThemeType = savedTheme === 'warm' ? 'warm' : 'business';
    if (savedTheme === 'default') {
      localStorage.setItem(THEME_STORAGE_KEY, 'business');
    }
    set({ theme, isLoaded: true });
  },
}));
