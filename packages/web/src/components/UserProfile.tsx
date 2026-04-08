'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTheme, type ThemeType } from '@/hooks/useTheme';
import { apiFetch } from '@/utils/api-client';
import { getIsSkipAuth, getUserId } from '@/utils/userId';
import VersionUpdateModal from './VersionUpdateModal';

interface UserProfileProps {
  className?: string;
}

const THEME_OPTIONS: Array<{
  id: ThemeType;
  label: string;
  swatchBackground: string;
}> = [
  {
    id: 'business',
    label: '灰白浅色',
    swatchBackground:
      'linear-gradient(-50.71deg, rgba(237, 244, 246, 1), rgba(235, 235, 235, 1) 100%)',
  },
  {
    id: 'warm',
    label: '橙白浅色',
    swatchBackground:
      'linear-gradient(-65.45deg, rgba(123, 72, 255, 1), rgba(200, 27, 181, 0.74) 24%, rgba(255, 100, 84, 0.44) 50%, rgba(255, 119, 49, 0.35) 72%, rgba(255, 92, 12, 1) 100%)',
  },
];

export function UserProfile({ className }: UserProfileProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [showVersionUpdate, setShowVersionUpdate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSkipAuth, setIsSkipAuth] = useState(false);
  const [themePopoverTop, setThemePopoverTop] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const themeAnchorRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const userId = getUserId();
  const { theme, setTheme } = useTheme();

  const getUserName = () => {
    if (userId === 'default-user') return '未登录';
    const parts = userId.split(':');
    return parts.length > 1 ? parts[1] || parts[0] : parts[0];
  };

  const userName = getUserName();
  const avatarLetter = userName.charAt(0).toUpperCase();

  const updateThemePopoverPosition = () => {
    if (!panelRef.current || !themeAnchorRef.current) return;

    const rootRect = panelRef.current.getBoundingClientRect();
    const anchorRect = themeAnchorRef.current.getBoundingClientRect();
    setThemePopoverTop(anchorRect.top - rootRect.top);
  };

  const handleTogglePanel = () => {
    setShowPanel((prev) => {
      const next = !prev;
      if (!next) setShowThemePanel(false);
      return next;
    });
  };

  const handleOpenVersionUpdate = () => {
    setShowVersionUpdate(true);
    setShowThemePanel(false);
    setShowPanel(false);
  };

  const handleCloseVersionUpdate = () => {
    setShowVersionUpdate(false);
  };

  const handleToggleThemePanel = () => {
    setShowThemePanel((prev) => !prev);
  };

  const handleSelectTheme = (nextTheme: ThemeType) => {
    setTheme(nextTheme);
    setShowThemePanel(false);
    setShowPanel(false);
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch('/api/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        localStorage.removeItem('cat-cafe-userId');
        router.replace('/login');
      } else {
        console.error('退出登录失败');
      }
    } catch (err) {
      console.error('退出登录错误:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setShowPanel(false);
        setShowThemePanel(false);
      }
    };

    if (showPanel || showThemePanel) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPanel, showThemePanel]);

  useEffect(() => {
    if (!showPanel || !showThemePanel) return;

    updateThemePopoverPosition();

    const handlePositionChange = () => {
      updateThemePopoverPosition();
    };

    const scrollElement = panelScrollRef.current;
    window.addEventListener('resize', handlePositionChange);
    scrollElement?.addEventListener('scroll', handlePositionChange, { passive: true });

    return () => {
      window.removeEventListener('resize', handlePositionChange);
      scrollElement?.removeEventListener('scroll', handlePositionChange);
    };
  }, [showPanel, showThemePanel]);

  useEffect(() => {
    setIsSkipAuth(getIsSkipAuth());
  }, []);

  return (
    <div className={`relative ${className ?? ''}`} ref={panelRef}>
      <button
        type="button"
        onClick={handleTogglePanel}
        className="group flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-gray-50"
        data-testid="user-profile-toggle"
      >
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#F2F2F2]">
          <span className="text-sm font-bold text-[#191919]">{avatarLetter}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-medium text-gray-900" title={userName}>
            {userName}
          </div>
        </div>

        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${showPanel ? 'rotate-90' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {showPanel && (
        <div
          className="absolute bottom-full left-3 right-3 z-50 mb-2 rounded-3xl border border-gray-200 bg-white shadow-lg"
          data-testid="user-profile-panel"
        >
          <div className="p-4" data-testid="user-profile-panel-scroll" ref={panelScrollRef}>
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F2F2F2]">
                  <span className="text-base font-bold text-[#191919]">{avatarLetter}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-normal text-gray-900" title={userName}>
                    {userName}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-3 border-t border-gray-200" />

            <div className="space-y-3" data-testid="user-profile-content-actions">
              <button
                className="hidden flex w-full items-center gap-2 rounded-md px-3 py-2 text-[16px] font-normal leading-[20px] text-gray-700 transition-colors hover:bg-gray-50"
                onClick={handleOpenVersionUpdate}
              >
                <img src="/icons/userprofile/version.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
                版本更新
              </button>

              <div className="relative" data-testid="user-profile-theme-anchor" ref={themeAnchorRef}>
                <button
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[16px] font-normal leading-[20px] text-gray-700 transition-colors hover:bg-gray-50"
                  onClick={handleToggleThemePanel}
                  data-testid="user-profile-theme-trigger"
                >
                  <img src="/icons/userprofile/theme.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
                  主题模式
                </button>
              </div>

              <button className="hidden flex w-full items-center gap-2 rounded-md px-3 py-2 text-[16px] font-normal leading-[20px] text-gray-700 transition-colors hover:bg-gray-50">
                <img src="/icons/userprofile/help.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
                帮助
              </button>
            </div>

            {!isSkipAuth && (
              <>
                <div className="mt-3 border-t border-gray-200" />
                <button
                  onClick={handleLogout}
                  disabled={isLoading}
                  className="mt-4 h-7 w-full rounded-full border border-gray-300 bg-white text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? '退出中...' : '退出登录'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showPanel && showThemePanel && (
        <div
          className="absolute left-[calc(100%-12px)] z-[60] -translate-y-1/2 rounded-3xl border border-gray-200 bg-white shadow-lg"
          data-testid="user-theme-popover"
          style={{ top: `${themePopoverTop}px` }}
        >
          <div className="p-4">
            <div className="flex items-start justify-between gap-4" data-testid="user-theme-options">
              {THEME_OPTIONS.map((option) => {
                const isActive = theme === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelectTheme(option.id)}
                    className={`flex min-w-[88px] flex-col items-center gap-2 rounded-2xl px-3 py-2 text-center transition-colors ${
                      isActive ? 'bg-[#F7F8FA]' : 'hover:bg-[#F7F8FA]'
                    }`}
                    data-testid={`user-theme-option-${option.id}`}
                  >
                    <div className="relative">
                      <div
                        className="h-9 w-9 rounded-full"
                        data-testid={`user-theme-swatch-${option.id}`}
                        style={{ background: option.swatchBackground }}
                      />
                      {isActive && (
                        <div
                          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white"
                          data-testid={`user-theme-selected-badge-${option.id}`}
                        >
                          <svg className="h-2.5 w-2.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path
                              d="M4 8.25 6.5 10.75 12 5.25"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <span className="text-[12px] font-medium leading-[18px] text-[#2E3440]">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <VersionUpdateModal open={showVersionUpdate} onCancel={handleCloseVersionUpdate} />
    </div>
  );
}
