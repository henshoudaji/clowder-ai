/**
 * Unified userId source for the frontend.
 * Priority: URL ?userId= > localStorage > 'default-user'
 */

const STORAGE_KEY = 'cat-cafe-userId';
const SKIP_AUTH_KEY = 'cat-cafe-isskip';
const DEFAULT_USER = 'default-user';

export function getUserId(): string {
  if (typeof window === 'undefined') return DEFAULT_USER;

  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('userId');
  if (fromUrl) {
    localStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl;
  }

  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_USER;
}

export function setUserId(id: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, id);
  }
}

export function getIsSkipAuth(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem(SKIP_AUTH_KEY);
  return raw === '1' || raw === 'true';
}

export function setIsSkipAuth(value: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SKIP_AUTH_KEY, value ? '1' : '0');
  }
}
