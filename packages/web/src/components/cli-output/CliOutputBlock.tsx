'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MarkdownContent } from '@/components/MarkdownContent';
import type { CliEvent, CliStatus } from '@/stores/chat-types';
import { apiFetch } from '@/utils/api-client';
import { LoadingSmall } from '../LoadingSmall';
import { LoadingPointStyle } from '../LoadingPointStyle';

/* ── Helpers ── */

/** Convert hex to rgba */
function hexToRgba(hex: string, opacity: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** Blend accent into a dark base → tinted dark surface (not transparent) */
function tintedDark(hex: string, ratio = 0.25, base = '#1A1625'): string {
  const parse = (h: string) => [
    Number.parseInt(h.slice(1, 3), 16),
    Number.parseInt(h.slice(3, 5), 16),
    Number.parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(base);
  return `rgb(${Math.round(r2 + (r1 - r2) * ratio)}, ${Math.round(g2 + (g1 - g2) * ratio)}, ${Math.round(b2 + (b1 - b2) * ratio)})`;
}

/** Lighten a hex color toward white by ratio (0-1) */
function lighten(hex: string, ratio: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * ratio);
  const lg = Math.round(g + (255 - g) * ratio);
  const lb = Math.round(b + (255 - b) * ratio);
  return `rgb(${lr}, ${lg}, ${lb})`;
}

/* ── Divider stays neutral; surface colors are now breed-tinted (see buildSurface) ── */
const DIVIDER = '#334155';
const LOCAL_PPT_FILE = {
  name: 'NVIDIA_GTC_2026_华为风.pptx',
  path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent\\NVIDIA_GTC_2026_华为风.pptx',
};

/* ── Inline SVG icons (Lucide-style, from Pencil design) ── */

interface LocalPresentationFile {
  name: string;
  path: string;
}

interface LocalPresentationFileMeta {
  generatedAt: number;
}

const PRESENTATION_PATH_PATTERNS = [
  /(?:saved|output|exported|generated|final\s+artifact|文件路径|路径|产物|输出|保存)[^:\n\r]*[:：]\s*[`'"]?([A-Za-z]:\\[^\r\n`'"]+?\.pptx?)/gi,
  /(?:saved|output|exported|generated|final\s+artifact|文件路径|路径|产物|输出|保存)[^:\n\r]*[:：]\s*[`'"]?(\/[^\r\n`'"]+?\.pptx?)/gi,
  // 以下代码会导致页面卡死
  // /(?:saved|output|exported|generated|final\s+artifact|æ–‡ä»¶è·¯å¾„|è·¯å¾„|äº§ç‰©|è¾“å‡º|ä¿å­˜)[^:\n\r]*[:ï¼š]\s*[`'"]?((?:\.{1,2}[\\/])?[^:\r\n`'"]*[\\/][^\r\n`'"]+?\.pptx?)/gi,
  // /((?:(?:\.{1,2}|~)?[\\/])?(?:[^:\s`'"]+[\\/])+[^:\s`'"]+?\.pptx?)/gi,
  /([A-Za-z]:\\[^\r\n`'"]+?\.pptx?)/gi,
  /(\/[^\r\n`'"]+?\.pptx?)/gi,
];
const RELATIVE_PRESENTATION_PATH_TOKENS = /[^\s"'`<>]+\.pptx?\b/gi;

function isAbsolutePresentationPath(path: string): boolean {
  return /^[A-Za-z]:\\/.test(path) || path.startsWith('/');
}

function normalizePathSeparators(path: string, separator: '\\' | '/'): string {
  return separator === '\\' ? path.replace(/\//g, '\\') : path.replace(/\\/g, '/');
}

function joinPresentationPath(basePath: string, filePath: string): string {
  const separator: '\\' | '/' = basePath.includes('\\') || /^[A-Za-z]:\\/.test(basePath) ? '\\' : '/';
  const normalizedBase = normalizePathSeparators(basePath, separator).replace(/[\\/]+$/, '');
  const normalizedFile = normalizePathSeparators(filePath, separator).replace(/^[.][\\/]/, '').replace(/^[\\/]+/, '');
  return `${normalizedBase}${separator}${normalizedFile}`;
}

function resolvePresentationPath(rawPath: string, configuredProjectPath?: string | null, defaultProjectPath?: string | null): string | null {
  if (isAbsolutePresentationPath(rawPath)) return rawPath;

  const basePath =
    configuredProjectPath && configuredProjectPath !== 'default'
      ? configuredProjectPath
      : defaultProjectPath && defaultProjectPath !== 'default'
        ? defaultProjectPath
        : null;

  return basePath ? joinPresentationPath(basePath, rawPath) : null;
}

function normalizePresentationPath(rawPath: string): string {
  return rawPath
    .trim()
    .replace(/^[('"`\[{<]+/, '')
    .replace(/['"`)\]}>.,;:!?]+$/g, '');
}

function isLikelyRelativePresentationPath(path: string): boolean {
  if (isAbsolutePresentationPath(path)) return false;
  if (!/[\\/]/.test(path)) return false;
  if (/^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/|\\\\)/.test(path)) return false;
  return /\.pptx?$/i.test(path);
}

function collectRelativePresentationCandidates(text: string): string[] {
  const matches = text.match(RELATIVE_PRESENTATION_PATH_TOKENS) ?? [];
  return matches.map((match) => normalizePresentationPath(match)).filter((match) => isLikelyRelativePresentationPath(match));
}

function pushPresentationCandidate(candidates: string[], candidate: string): void {
  const hasMoreSpecificCandidate = candidates.some(
    (existing) => existing.length > candidate.length && existing.endsWith(candidate),
  );
  if (!hasMoreSpecificCandidate) {
    candidates.push(candidate);
  }
}

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function formatGeneratedDate(timestamp: number | null): string {
  if (timestamp == null || Number.isNaN(timestamp)) return '生成时间获取中...';
  const date = new Date(timestamp);
  return `生成时间：${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function extractLocalPresentationFile(events: CliEvent[]): LocalPresentationFile | null {
  const searchSpace = events.flatMap((event) => [event.content, event.detail, event.label]).filter(Boolean) as string[];
  const candidates: string[] = [];

  for (const text of searchSpace) {
    for (const pattern of PRESENTATION_PATH_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        const rawPath = match[1];
        if (!rawPath) continue;
        const fullMatch = match[0] ?? '';
        const normalized = normalizePresentationPath(rawPath);
        if (normalized.startsWith('/') && typeof match.index === 'number') {
          const pathStart = match.index + fullMatch.indexOf(rawPath);
          const previousChar = pathStart > 0 ? text[pathStart - 1] : '';
          // Guard against extracting "/foo.pptx" out of "output/foo.pptx".
          if (previousChar && /[A-Za-z0-9_.-]/.test(previousChar)) {
            continue;
          }
        }
        pushPresentationCandidate(candidates, normalized);
      }
    }

    for (const relativeCandidate of collectRelativePresentationCandidates(text)) {
      pushPresentationCandidate(candidates, relativeCandidate);
    }
  }

  const path = candidates.at(-1);
  if (!path) return null;
  return { name: fileNameFromPath(path), path };
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <>
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgb(31, 31, 31)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-transform duration-150 flex-shrink-0"
        style={{ display: 'none', transform: expanded ? 'rotate(-90deg)' : 'rotate(90deg)' }}
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
      <svg
        style={{ transform: expanded ? 'rotate(-180deg)' : 'rotate(0deg)' }}
        viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="16.000000" height="16.000000" fill="none">
        <rect id="收起-regular" width="16.000000" height="16.000000" x="0.000000" y="0.000000" />
        <path id="路径" d="M6.3 0C6.6866 0 7 0.313401 7 0.7L7 6.5C7 6.77614 6.77614 7 6.5 7C6.22386 7 6 6.77614 6 6.5L6 1L0.5 1C0.25454 1 0.0503915 0.823125 0.00805569 0.589876L0 0.5C0 0.223858 0.223858 0 0.5 0L6.3 0Z" fill="rgb(128,128,128)" fillRule="nonzero" transform="matrix(-0.707107,0.707107,-0.707107,-0.707107,12.9492,6)" />
      </svg>
    </>
  );
}

function WrenchIcon({ color }: { color?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'rgb(89, 89, 89)'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="16.000000" height="16.000000" fill="none">
      <mask id="mask_5" width="16.000000" height="16.000008" x="0.000000" y="0.000000" maskUnits="userSpaceOnUse">
        <g filter="url(#pixso_custom_mask_type_alpha)">
          <g id="mask431_3429">
            <path id="减去顶层" d="M16 0L0 0L0 16L16 16L16 0ZM7.39177 11.0114L12.4626 5.67807C12.6556 5.47511 12.6478 5.16407 12.4448 4.97104C12.2419 4.77814 11.9308 4.78597 11.738 4.98894L7.0288 9.94191L4.52863 7.32161C4.33543 7.11897 4.0244 7.11181 3.82177 7.30501C3.61913 7.49837 3.6118 7.80941 3.80517 8.01188L6.66763 11.0119C6.7827 11.1325 6.89927 11.1942 7.01693 11.1969C7.13477 11.1997 7.27117 11.1263 7.39177 11.0114Z" fill="rgb(255,255,255)" fillOpacity="0" fillRule="evenodd" />
          </g>
        </g>
      </mask>
      <mask id="mask_4" width="16.000000" height="16.000000" x="0.000000" y="0.000000" maskUnits="userSpaceOnUse">
        <g filter="url(#pixso_custom_mask_type_alpha)">
          <g id="clip431_3420">
            <rect id="support" width="16.000000" height="16.000000" x="0.000000" y="0.000000" fill="rgb(0,0,0)" />
          </g>
        </g>
      </mask>
      <defs>
        <filter id="pixso_custom_mask_type_alpha">
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0 " />
        </filter>
      </defs>
      <mask id="mask_3" width="16.000000" height="16.000000" x="0.000000" y="0.000000" maskUnits="userSpaceOnUse">
        <g filter="url(#pixso_custom_mask_type_alpha)">
          <g id="clip431_3419">
            <rect id="ic_public_success-成功/base/ic_public_success" width="16.000000" height="16.000000" x="0.000000" y="0.000000" fill="rgb(0,0,0)" />
          </g>
        </g>
      </mask>
      <rect id="ic_public_success" width="16.000000" height="16.000000" x="0.000000" y="0.000000" />
      <rect id="ic_public_success-成功/base/ic_public_success" width="16.000000" height="16.000000" x="0.000000" y="0.000000" fill="rgb(255,255,255)" fillOpacity="0" />
      <g id="clip path group" mask="url(#mask_3)">
        <g id="组合 5142">
          <g id="clip path group" mask="url(#mask_4)">
            <g id="组合 5143">
              <path id="path1" d="M1.66378e-05 7.9924C1.66378e-05 6.7424 -0.0033167 5.4924 1.66378e-05 4.2424C-0.0033167 3.63574 0.07335 3.0324 0.220017 2.44907C0.546683 1.20907 1.35335 0.469071 2.59668 0.185737C3.21335 0.052404 3.85335 -0.0109293 4.48668 -0.000929316C6.88002 -0.000929316 9.27668 -0.000929316 11.68 -0.000929316C12.2833 -0.00426265 12.8867 0.0590707 13.4767 0.205737C14.7533 0.515737 15.52 1.3224 15.81 2.59907C15.9434 3.19907 16.0033 3.80907 15.9967 4.42907C15.9967 6.8524 15.9967 9.27574 15.9967 11.6957C16 12.2957 15.9333 12.8924 15.79 13.4757C15.4767 14.7557 14.6667 15.5157 13.3934 15.8091C12.77 15.9424 12.1367 16.0057 11.5033 15.9957C9.11668 15.9957 6.72668 15.9957 4.34335 15.9957C3.73335 16.0024 3.12335 15.9324 2.53335 15.7924C1.25002 15.4824 0.476683 14.6691 0.186683 13.3857C0.0400166 12.7391 1.66378e-05 12.0891 1.66378e-05 11.4324C1.66378e-05 10.2857 1.66378e-05 9.13574 1.66378e-05 7.9924Z" fill="rgb(255,255,255)" fillOpacity="0" fillRule="evenodd" />
              <circle id="path2" cx="8" cy="8" r="8" fill="rgb(255,255,255)" fillOpacity="0" />
            </g>
          </g>
          <ellipse id="path3" rx="7.333333" ry="7.333102" cx="8.00008202" cy="7.99911785" stroke="rgb(92,179,0)" strokeWidth="1" />
          <path id="path6" d="M4.16675 7.66732L7.02675 10.6673L12.0967 5.33398" fillRule="nonzero" stroke="rgb(92,179,0)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" />
          <g id="mask" mask="url(#mask_5)">
            <g id="组合 5144">
              <ellipse id="path4" rx="8.000000" ry="7.999748" cx="8" cy="7.99974823" fill="rgb(255,255,255)" fillOpacity="0" />
            </g>
          </g>
          <path id="path6 (边框)" d="M12.4601 5.67729L7.39005 11.0106C7.27005 11.124 7.13339 11.1973 7.01672 11.1973C6.89672 11.194 6.78005 11.1306 6.66672 11.0106L3.80339 8.01062C3.61005 7.80729 3.61672 7.49729 3.82005 7.30396C4.02339 7.11062 4.33339 7.11729 4.52672 7.32062L7.02672 9.94062L11.7367 4.98729C11.9301 4.78396 12.2401 4.77729 12.4434 4.97062C12.6467 5.16396 12.6534 5.47396 12.4601 5.67729Z" fill="rgb(255,255,255)" fillOpacity="0" fillRule="evenodd" />
        </g>
      </g>
    </svg>
  );
}

function LoaderIcon({ color }: { color?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0 animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function PawPrint() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#64748B"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0"
    >
      <circle cx="11" cy="4" r="2" />
      <circle cx="18" cy="8" r="2" />
      <circle cx="20" cy="16" r="2" />
      <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
    </svg>
  );
}

/* ── Status helpers ── */

function PptAttachmentCard({
  file,
  projectPath,
}: {
  file: LocalPresentationFile;
  projectPath?: string | null;
}) {
  const [isOpening, setIsOpening] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [defaultProjectPath, setDefaultProjectPath] = useState<string | null>(null);
  const resolvedPath = useMemo(
    () => resolvePresentationPath(file.path, projectPath, defaultProjectPath),
    [defaultProjectPath, file.path, projectPath],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadDefaultProjectPath(): Promise<void> {
      if (isAbsolutePresentationPath(file.path)) return;
      if (projectPath && projectPath !== 'default') return;

      try {
        const response = await apiFetch('/api/projects/cwd');
        if (!response.ok) return;
        const payload = (await response.json()) as { path?: string };
        if (!cancelled && typeof payload.path === 'string' && payload.path.trim()) {
          setDefaultProjectPath(payload.path.trim());
        }
      } catch {
        if (!cancelled) setDefaultProjectPath(null);
      }
    }

    void loadDefaultProjectPath();
    return () => {
      cancelled = true;
    };
  }, [file.path, projectPath]);

  useEffect(() => {
    let cancelled = false;

    async function loadMeta(): Promise<void> {
      if (!resolvedPath) return;
      try {
        const response = await apiFetch('/api/workspace/local-file-meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: resolvedPath, ...(projectPath ? { projectPath } : {}) }),
        });
        if (!response.ok) return;
        const payload = (await response.json()) as LocalPresentationFileMeta;
        if (!cancelled && typeof payload.generatedAt === 'number') {
          setGeneratedAt(payload.generatedAt);
        }
      } catch {
        if (!cancelled) setGeneratedAt(null);
      }
    }

    void loadMeta();
    return () => {
      cancelled = true;
    };
  }, [resolvedPath]);

  async function handleOpen(): Promise<void> {
    if (isOpening || !resolvedPath) return;
    setIsOpening(true);
    try {
      await apiFetch('/api/workspace/open-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: resolvedPath, ...(projectPath ? { projectPath } : {}) }),
      });
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <div
      data-testid="cli-output-ppt-card"
      className="mt-3 flex items-center gap-3 rounded-2xl border border-[#E9E5DF] bg-[#FBF9F6] px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
    >
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-[11px] font-semibold tracking-[0.16em]">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24.000000" height="24.000000" fill="none">
          <rect id="文件格式/ppt" width="24.000000" height="24.000000" x="0.000000" y="0.000000" fill="rgb(255,255,255)" fill-opacity="0" />
          <path id="矩形备份-23" d="M21.625 20.801L21.625 6.77597L15.8626 1.00098L4.575 1.00098C3.35997 1.00098 2.375 1.98595 2.375 3.20097L2.375 20.801C2.375 22.0159 3.35997 23.001 4.575 23.001L19.425 23.001C20.64 23.001 21.625 22.0159 21.625 20.801Z" fill="rgb(217,105,0)" fill-rule="evenodd" />
          <path id="矩形备份-24" d="M15.8671 1.00098L21.625 6.78135L17.1071 6.78135C16.4128 6.78135 15.8671 6.2129 15.8671 5.5186L15.8671 1.00098Z" opacity="0.599999964" fill="rgb(255,255,255)" fill-rule="evenodd" />
          <path id="矢量 62" d="M12.904 9.02646C13.1096 9.02646 13.3108 9.04714 13.5076 9.08877C13.6941 9.12852 13.8765 9.18599 14.0551 9.26279C14.407 9.41453 14.7187 9.62856 14.9902 9.9041C15.2604 10.1783 15.4698 10.492 15.6185 10.8462C15.6938 11.0259 15.7507 11.2101 15.7893 11.3973C15.8294 11.5925 15.8494 11.791 15.8494 11.9945C15.8494 12.3939 15.7721 12.7766 15.6176 13.1418C15.4686 13.4941 15.2584 13.8062 14.9868 14.0774C14.7152 14.3492 14.4032 14.5598 14.0508 14.7091C13.8832 14.7797 13.712 14.834 13.5373 14.8724C13.3311 14.9175 13.1201 14.9411 12.904 14.9411L10.4915 14.9411L10.4773 17.5657C10.4773 17.9422 10.1694 18.2465 9.79276 18.2465C9.4141 18.2465 9.10822 17.9393 9.10822 17.5606L9.12453 10.0437C9.12453 9.97231 9.13175 9.90276 9.14615 9.83428C9.15951 9.77063 9.17901 9.70833 9.20483 9.64736C9.23007 9.58774 9.26045 9.53054 9.29587 9.47764C9.33269 9.42231 9.37506 9.37075 9.42289 9.32295C9.47073 9.27515 9.52216 9.23298 9.57731 9.19619C9.63032 9.16074 9.68675 9.13013 9.7465 9.10488C9.80753 9.0791 9.8699 9.0603 9.93355 9.04688C10.0019 9.03264 10.0718 9.02539 10.1432 9.02539L12.904 9.02646ZM12.8715 10.3918L10.4915 10.3918L10.4915 13.5736L12.904 13.5736C13.1184 13.5736 13.3231 13.5328 13.5182 13.4501C13.707 13.3703 13.8743 13.2578 14.0201 13.1117C14.0995 13.0325 14.1692 12.946 14.2291 12.8539C14.2792 12.7768 14.3224 12.6949 14.3588 12.609C14.3937 12.5265 14.4212 12.4425 14.4414 12.3565C14.4688 12.2392 14.4826 12.1183 14.4826 11.9945C14.4826 11.7794 14.441 11.5734 14.358 11.3758C14.2774 11.1835 14.1637 11.0124 14.0168 10.8634C13.9271 10.7723 13.8295 10.6939 13.7241 10.6281C13.6572 10.5865 13.5871 10.5502 13.5139 10.5186C13.4217 10.4788 13.3275 10.4482 13.2313 10.4272C13.1247 10.4042 12.9831 10.3918 12.8715 10.3918Z" fill="rgb(255,255,255)" fill-rule="evenodd" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[#1F2937]">{file.name}</div>
        <div className="mt-1 break-all text-[11px] leading-4 text-[#9A8F84]">{formatGeneratedDate(generatedAt)}</div>
      </div>
      <button
        type="button"
        data-testid="cli-output-ppt-open"
        onClick={() => {
          void handleOpen();
        }}
        disabled={isOpening || !resolvedPath}
        className="inline-flex flex-shrink-0 items-center rounded-full border border-[#D2CDC4] bg-white px-4 py-1.5 text-xs font-medium text-[#3F3B37] transition-colors hover:bg-[#F4F1EC] disabled:cursor-not-allowed disabled:opacity-70"
      >
        打开
      </button>
    </div>
  );
}

function buildSummary(events: CliEvent[], status: CliStatus): string {
  const toolCount = events.filter((e) => e.kind === 'tool_use').length;
  if (status === 'streaming') {
    return '正在执行工具调用';
  }
  return `已执行${toolCount}次工具调用`;
}

/* ── Tool row — design: [status] [wrench] [name] [detail] [result] ── */

function ToolRow({
  event,
  isActive,
  onUserInteract,
  accent,
}: {
  event: CliEvent;
  isActive: boolean;
  onUserInteract?: () => void;
  accent: string;
}) {
  const [rowExpanded, setRowExpanded] = useState(false);
  const hasResult = event.detail != null;
  // Design: active = breed bg 20% + left border 2px + lighter text
  const accentLight = lighten(accent, 0.6); // ~#C084FC equivalent
  const accentVeryLight = lighten(accent, 0.9); // ~#F5F3FF equivalent

  return (
    <button
      type="button"
      data-testid={`tool-row-${event.id}`}
      className="w-full text-left cursor-pointer rounded  text-[11px] flex flex-col gap-2"
      style={{
        padding: '5px 0 5px 28px',
        borderRadius: 4,
      }}
      onClick={() => {
        setRowExpanded((v) => !v);
        onUserInteract?.();
      }}
    >
      <div className="flex">
        <div className="flex items-center gap-2 mr-2">
          {/* Status icon */}
          {isActive ? <LoadingSmall className="w-4 h-4 flex-shrink-0" /> : hasResult ? <CheckIcon /> : null}
          {/* Wrench icon — design: rgb(89, 89, 89) normal, #F5F3FF active */}
          { false && <WrenchIcon color={isActive ? 'rgb(89, 89, 89)' : 'rgb(89, 89, 89)'} /> }
          {/* Tool label (full) */}
          <span className="truncate" style={{ color: isActive ? 'rgb(89, 89, 89)' : 'rgb(89, 89, 89)' }}>
            <span className="font-[14px]">{event.label?.split(' ')[0]}</span>
            {event.label?.includes(' ') && (
              <span
                style={{ color: isActive ? accentLight : '#64748B', display: 'none' }}
              >{` ${event.label.split(' ').slice(1).join(' ')}`}</span>
            )}
          </span>
        </div>
        {/* Detail — hidden by default, shown on click */}
        {hasResult && <ChevronIcon expanded={rowExpanded} />}
      </div>
      {rowExpanded && hasResult && event.detail && (
        <div className="w-full mt-1 ml-6 whitespace-pre-wrap text-[12px] rounded-lg bg-[rgb(248_248_248)] p-[12px]" style={{ color: '#64748B' }}>
          {event.detail}
        </div>
      )}
    </button>
  );
}

/* ── Collapsible tools section ── */

function ToolsSection({
  toolUses,
  toolResults,
  lastToolId,
  status,
  onUserInteract,
  accent,
}: {
  toolUses: CliEvent[];
  toolResults: CliEvent[];
  lastToolId: string | undefined;
  status: CliStatus;
  onUserInteract: () => void;
  accent: string;
}) {
  const isStreaming = status === 'streaming';
  const [toolsExpanded, setToolsExpanded] = useState(isStreaming);
  const toolsUserInteracted = useRef(false);

  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === 'streaming' && !isStreaming && !toolsUserInteracted.current) {
      setToolsExpanded(false);
    }
    prevStatus.current = status;
  }, [status, isStreaming]);

  useEffect(() => {
    if (isStreaming) {
      setToolsExpanded(true);
    }
  }, [isStreaming]);

  const toolSummary = `${toolUses.length} tool${toolUses.length > 1 ? 's' : ''}`;

  return (
    <div style={{ padding: '4px 0' }}>
      <button
        type="button"
        data-testid="tools-section-toggle"
        className="w-full hidden items-center gap-1.5 py-1.5 text-[12px] rounded transition-colors"
        style={{ color: '#94A3B8' }}
        onClick={() => {
          toolsUserInteracted.current = true;
          setToolsExpanded((v) => !v);
          onUserInteract();
        }}
      >
        <span>{toolsExpanded ? toolSummary : `${toolSummary} (collapsed)`}</span>
        <ChevronIcon expanded={toolsExpanded} />
      </button>
      {true && (
        <div className="space-y-0.5">
          {toolUses.map((e, i) => {
            const result = toolResults[i];
            return (
              <ToolRow
                key={e.id}
                event={{ ...e, detail: result?.detail ?? e.detail }}
                isActive={e.id === lastToolId}
                onUserInteract={onUserInteract}
                accent={accent}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main component ── */

interface CliOutputBlockProps {
  events: CliEvent[];
  status: CliStatus;
  thinkingMode?: 'debug' | 'play';
  defaultExpanded?: boolean;
  breedColor?: string;
  projectPath?: string | null;
}

export function CliOutputBlock({
  events,
  status,
  thinkingMode,
  defaultExpanded = false,
  breedColor,
  projectPath,
}: CliOutputBlockProps) {
  const isExport =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('export') === 'true';
  const forceExpanded = status === 'streaming' || isExport;
  const [expanded, setExpanded] = useState(forceExpanded || defaultExpanded);
  const userInteracted = useRef(false);
  const hasMounted = useRef(false);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current === 'streaming' && status !== 'streaming' && !userInteracted.current) {
      setExpanded(false);
    }
    prevStatusRef.current = status;
  }, [status]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: expanded is intentional — dispatch on toggle
  useEffect(() => {
    if (forceExpanded) {
      setExpanded(true);
    }
  }, [forceExpanded]);

  const localPresentationFile = useMemo(() => extractLocalPresentationFile(events), [events]);

  useLayoutEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('catcafe:chat-layout-changed'));
    }
  }, [expanded]);

  if (events.length === 0) return null;

  const summary = buildSummary(events, status);
  const toolUses = events.filter((e) => e.kind === 'tool_use');
  const toolResults = events.filter((e) => e.kind === 'tool_result');
  const textEvents = events.filter((e) => e.kind === 'text');
  const lastToolId = status === 'streaming' ? [...events].reverse().find((e) => e.kind === 'tool_use')?.id : undefined;
  const accent = breedColor || '#7C3AED';
  // Breed-tinted dark surface: accent blended into dark base → visibly colored AND text-readable
  const surface = tintedDark(accent, 0.25);
  const surfaceInner = tintedDark(accent, 0.18);

  const handleToggle = () => {
    userInteracted.current = true;
    setExpanded((v) => !v);
  };

  return (
    <div className="cli-output-container mt-2 mb-1 overflow-hidden">
      {/* Header — design: chevron(accent) + summary(slate-400) + paw chip */}
      {toolUses.length > 0 && <button
        type="button"
        data-testid="cli-output-toggle"
        onClick={handleToggle}
        className="cli-output-button w-full flex items-center gap-2 text-[14px] transition-colors"
        style={{ padding: '8px 0' }}
      >
        { status === 'streaming' && <LoadingPointStyle className="w-4 h-4 flex-shrink-0" /> }
        { status === 'done' && 
          <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none">
            <mask id="mask_5" width="16.000000" height="16.000008" x="0.000000" y="0.000000" maskUnits="userSpaceOnUse">
              <g filter="url(#pixso_custom_mask_type_alpha)">
                <g id="mask431_3429">
                  <path id="减去顶层" d="M16 0L0 0L0 16L16 16L16 0ZM7.39177 11.0114L12.4626 5.67807C12.6556 5.47511 12.6478 5.16407 12.4448 4.97104C12.2419 4.77814 11.9308 4.78597 11.738 4.98894L7.0288 9.94191L4.52863 7.32161C4.33543 7.11897 4.0244 7.11181 3.82177 7.30501C3.61913 7.49837 3.6118 7.80941 3.80517 8.01188L6.66763 11.0119C6.7827 11.1325 6.89927 11.1942 7.01693 11.1969C7.13477 11.1997 7.27117 11.1263 7.39177 11.0114Z" fill="rgb(255,255,255)" fillOpacity="0" fillRule="evenodd" />
                </g>
              </g>
            </mask>
            <mask id="mask_4" width="16.000000" height="16.000000" x="0.000000" y="0.000000" maskUnits="userSpaceOnUse">
              <g filter="url(#pixso_custom_mask_type_alpha)">
                <g id="clip431_3420">
                  <rect id="support" width="16.000000" height="16.000000" x="0.000000" y="0.000000" fill="rgb(0,0,0)" />
                </g>
              </g>
            </mask>
            <defs>
              <filter id="pixso_custom_mask_type_alpha">
                <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0 " />
              </filter>
            </defs>
            <mask id="mask_3" width="16.000000" height="16.000000" x="0.000000" y="0.000000" maskUnits="userSpaceOnUse">
              <g filter="url(#pixso_custom_mask_type_alpha)">
                <g id="clip431_3419">
                  <rect id="ic_public_success-成功/base/ic_public_success" width="16.000000" height="16.000000" x="0.000000" y="0.000000" fill="rgb(0,0,0)" />
                </g>
              </g>
            </mask>
            <rect id="ic_public_success" width="16.000000" height="16.000000" x="0.000000" y="0.000000" />
            <rect id="ic_public_success-成功/base/ic_public_success" width="16.000000" height="16.000000" x="0.000000" y="0.000000" fill="rgb(255,255,255)" fillOpacity="0" />
            <g id="clip path group" mask="url(#mask_3)">
              <g id="组合 5142">
                <g id="clip path group" mask="url(#mask_4)">
                  <g id="组合 5143">
                    <path id="path1" d="M1.66378e-05 7.9924C1.66378e-05 6.7424 -0.0033167 5.4924 1.66378e-05 4.2424C-0.0033167 3.63574 0.07335 3.0324 0.220017 2.44907C0.546683 1.20907 1.35335 0.469071 2.59668 0.185737C3.21335 0.052404 3.85335 -0.0109293 4.48668 -0.000929316C6.88002 -0.000929316 9.27668 -0.000929316 11.68 -0.000929316C12.2833 -0.00426265 12.8867 0.0590707 13.4767 0.205737C14.7533 0.515737 15.52 1.3224 15.81 2.59907C15.9434 3.19907 16.0033 3.80907 15.9967 4.42907C15.9967 6.8524 15.9967 9.27574 15.9967 11.6957C16 12.2957 15.9333 12.8924 15.79 13.4757C15.4767 14.7557 14.6667 15.5157 13.3934 15.8091C12.77 15.9424 12.1367 16.0057 11.5033 15.9957C9.11668 15.9957 6.72668 15.9957 4.34335 15.9957C3.73335 16.0024 3.12335 15.9324 2.53335 15.7924C1.25002 15.4824 0.476683 14.6691 0.186683 13.3857C0.0400166 12.7391 1.66378e-05 12.0891 1.66378e-05 11.4324C1.66378e-05 10.2857 1.66378e-05 9.13574 1.66378e-05 7.9924Z" fill="rgb(255,255,255)" fillOpacity="0" fillRule="evenodd" />
                    <circle id="path2" cx="8" cy="8" r="8" fill="rgb(255,255,255)" fillOpacity="0" />
                  </g>
                </g>
                <ellipse id="path3" rx="7.333333" ry="7.333102" cx="8.00008202" cy="7.99911785" stroke="rgb(92,179,0)" strokeWidth="1" />
                <path id="path6" d="M4.16675 7.66732L7.02675 10.6673L12.0967 5.33398" fillRule="nonzero" stroke="rgb(92,179,0)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" />
                <g id="mask" mask="url(#mask_5)">
                  <g id="组合 5144">
                    <ellipse id="path4" rx="8.000000" ry="7.999748" cx="8" cy="7.99974823" fill="rgb(255,255,255)" fillOpacity="0" />
                  </g>
                </g>
                <path id="path6 (边框)" d="M12.4601 5.67729L7.39005 11.0106C7.27005 11.124 7.13339 11.1973 7.01672 11.1973C6.89672 11.194 6.78005 11.1306 6.66672 11.0106L3.80339 8.01062C3.61005 7.80729 3.61672 7.49729 3.82005 7.30396C4.02339 7.11062 4.33339 7.11729 4.52672 7.32062L7.02672 9.94062L11.7367 4.98729C11.9301 4.78396 12.2401 4.77729 12.4434 4.97062C12.6467 5.16396 12.6534 5.47396 12.4601 5.67729Z" fill="rgb(255,255,255)" fillOpacity="0" fillRule="evenodd" />
              </g>
            </g>
          </svg>
        }
        { status === 'failed' && 
          <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none">
            <mask id="mask_2" width="16.000000" height="16.000008" x="0.000000" y="0.000000" maskUnits="userSpaceOnUse">
              <g filter="url(#pixso_custom_mask_type_alpha)">
                <g id="mask431_3429">
                  <path id="减去顶层" d="M16 0L0 0L0 16L16 16L16 0ZM7.39177 11.0114L12.4626 5.67807C12.6556 5.47511 12.6478 5.16407 12.4448 4.97104C12.2419 4.77814 11.9308 4.78597 11.738 4.98894L7.0288 9.94191L4.52863 7.32161C4.33543 7.11897 4.0244 7.11181 3.82177 7.30501C3.61913 7.49837 3.6118 7.80941 3.80517 8.01188L6.66763 11.0119C6.7827 11.1325 6.89927 11.1942 7.01693 11.1969C7.13477 11.1997 7.27117 11.1263 7.39177 11.0114Z" fill="rgb(255,255,255)" fillOpacity="0" fillRule="evenodd" />
                </g>
              </g>
            </mask>
            <mask id="mask_1" width="16.000000" height="16.000000" x="0.000000" y="0.000000" maskUnits="userSpaceOnUse">
              <g filter="url(#pixso_custom_mask_type_alpha)">
                <g id="clip431_3420">
                  <rect id="support" width="16.000000" height="16.000000" x="0.000000" y="0.000000" fill="rgb(0,0,0)" />
                  <path id="合并" d="M9.72492 10.2286C9.65951 10.2286 9.59888 10.217 9.54302 10.1939C9.48689 10.1707 9.43559 10.1359 9.38909 10.0894L7.1 7.80031L4.81091 10.0894C4.76441 10.1359 4.7131 10.1707 4.65697 10.1939Q4.57318 10.2286 4.47508 10.2286Q4.37698 10.2286 4.29319 10.1939C4.23706 10.1707 4.18575 10.1359 4.13925 10.0894C4.09254 10.0427 4.05758 9.99115 4.03438 9.93476C4.01146 9.87908 4 9.81869 4 9.75358C4 9.68846 4.01146 9.62807 4.03438 9.57239Q4.06919 9.48781 4.13925 9.41775L6.42835 7.12866L4.13925 4.83957Q4.06919 4.7695 4.03438 4.68493Q4 4.60141 4 4.50374Q4 4.40607 4.03438 4.32256L4.03438 4.32256Q4.06919 4.23798 4.13925 4.16791Q4.20932 4.09785 4.2939 4.06304Q4.37741 4.02866 4.47508 4.02866Q4.57275 4.02866 4.65627 4.06304Q4.74084 4.09785 4.81091 4.16791L7.1 6.457L9.38909 4.16791C9.50103 4.05597 9.61298 4 9.72492 4C9.83686 4 9.9488 4.05597 10.0607 4.16791C10.1075 4.21462 10.1424 4.26617 10.1656 4.32255C10.1885 4.37823 10.2 4.43863 10.2 4.50374Q10.2 4.60141 10.1656 4.68493C10.1424 4.74131 10.1075 4.79286 10.0607 4.83957L7.77165 7.12866L10.0607 9.41775C10.1075 9.46446 10.1424 9.51601 10.1656 9.57239C10.1885 9.62807 10.2 9.68847 10.2 9.75358C10.2 9.81869 10.1885 9.87909 10.1656 9.93477C10.1424 9.99115 10.1075 10.0427 10.0607 10.0894C10.0142 10.1359 9.96293 10.1707 9.90681 10.1939C9.85095 10.217 9.79032 10.2286 9.72492 10.2286Z" fill="rgb(255,255,255)" fillRule="evenodd" />
                </g>
              </g>
            </mask>
            <defs>
              <filter id="pixso_custom_mask_type_alpha">
                <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0 " />
              </filter>
            </defs>
            <mask id="mask_0" width="16.000000" height="16.000000" x="0.000000" y="0.000000" maskUnits="userSpaceOnUse">
              <g filter="url(#pixso_custom_mask_type_alpha)">
                <g id="clip431_3419">
                  <rect id="ic_public_success-成功/base/ic_public_success" width="16.000000" height="16.000000" x="0.000000" y="0.000000" fill="rgb(0,0,0)" />
                </g>
              </g>
            </mask>
            <rect id="ic_public_error" width="16.000000" height="16.000000" x="0.000000" y="0.000000" />
            <rect id="ic_public_success-成功/base/ic_public_success" width="16.000000" height="16.000000" x="0.000000" y="0.000000" fill="rgb(255,255,255)" fillOpacity="0" />
            <g id="clip path group" mask="url(#mask_0)">
              <g id="组合 5142">
                <g id="clip path group" mask="url(#mask_1)">
                  <g id="组合 5143">
                    <path id="path1" d="M1.66378e-05 7.9924C1.66378e-05 6.7424 -0.0033167 5.4924 1.66378e-05 4.2424C-0.0033167 3.63574 0.07335 3.0324 0.220017 2.44907C0.546683 1.20907 1.35335 0.469071 2.59668 0.185737C3.21335 0.052404 3.85335 -0.0109293 4.48668 -0.000929316C6.88002 -0.000929316 9.27668 -0.000929316 11.68 -0.000929316C12.2833 -0.00426265 12.8867 0.0590707 13.4767 0.205737C14.7533 0.515737 15.52 1.3224 15.81 2.59907C15.9434 3.19907 16.0033 3.80907 15.9967 4.42907C15.9967 6.8524 15.9967 9.27574 15.9967 11.6957C16 12.2957 15.9333 12.8924 15.79 13.4757C15.4767 14.7557 14.6667 15.5157 13.3934 15.8091C12.77 15.9424 12.1367 16.0057 11.5033 15.9957C9.11668 15.9957 6.72668 15.9957 4.34335 15.9957C3.73335 16.0024 3.12335 15.9324 2.53335 15.7924C1.25002 15.4824 0.476683 14.6691 0.186683 13.3857C0.0400166 12.7391 1.66378e-05 12.0891 1.66378e-05 11.4324C1.66378e-05 10.2857 1.66378e-05 9.13574 1.66378e-05 7.9924Z" fill="rgb(255,255,255)" fillOpacity="0" fillRule="evenodd" />
                    <circle id="path2" cx="8" cy="8" r="8" fill="rgb(255,255,255)" fillOpacity="0" />
                  </g>
                </g>
                <ellipse id="path3" rx="7.333333" ry="7.333102" cx="8.00008202" cy="7.99911785" stroke="rgb(242,48,48)" strokeWidth="1" />
                <g id="mask" mask="url(#mask_2)">
                  <g id="组合 5144">
                    <ellipse id="path4" rx="8.000000" ry="7.999748" cx="8" cy="7.99974823" fill="rgb(255,255,255)" fillOpacity="0" />
                  </g>
                </g>
                <path id="path6 (边框)" d="M12.4601 5.67729L7.39005 11.0106C7.27005 11.124 7.13339 11.1973 7.01672 11.1973C6.89672 11.194 6.78005 11.1306 6.66672 11.0106L3.80339 8.01062C3.61005 7.80729 3.61672 7.49729 3.82005 7.30396C4.02339 7.11062 4.33339 7.11729 4.52672 7.32062L7.02672 9.94062L11.7367 4.98729C11.9301 4.78396 12.2401 4.77729 12.4434 4.97062C12.6467 5.16396 12.6534 5.47396 12.4601 5.67729Z" fill="rgb(255,255,255)" fillOpacity="0" fillRule="evenodd" />
                <path id="合并" d="M10.7249 11.2286C10.6595 11.2286 10.5989 11.217 10.543 11.1939C10.4869 11.1707 10.4356 11.1359 10.3891 11.0894L8.1 8.80031L5.81091 11.0894C5.76441 11.1359 5.7131 11.1707 5.65697 11.1939Q5.57318 11.2286 5.47508 11.2286Q5.37698 11.2286 5.29319 11.1939C5.23706 11.1707 5.18575 11.1359 5.13925 11.0894C5.09254 11.0427 5.05758 10.9911 5.03438 10.9348C5.01146 10.8791 5 10.8187 5 10.7536C5 10.6885 5.01146 10.6281 5.03438 10.5724Q5.06919 10.4878 5.13925 10.4177L7.42835 8.12866L5.13925 5.83957Q5.06919 5.7695 5.03438 5.68493Q5 5.60141 5 5.50374Q5 5.40607 5.03438 5.32256L5.03438 5.32256Q5.06919 5.23798 5.13925 5.16791Q5.20932 5.09785 5.2939 5.06304Q5.37741 5.02866 5.47508 5.02866Q5.57275 5.02866 5.65627 5.06304Q5.74084 5.09785 5.81091 5.16791L8.1 7.457L10.3891 5.16791C10.501 5.05597 10.613 5 10.7249 5C10.8369 5 10.9488 5.05597 11.0607 5.16791C11.1075 5.21462 11.1424 5.26617 11.1656 5.32255C11.1885 5.37823 11.2 5.43863 11.2 5.50374Q11.2 5.60141 11.1656 5.68493C11.1424 5.74131 11.1075 5.79286 11.0607 5.83957L8.77165 8.12866L11.0607 10.4177C11.1075 10.4645 11.1424 10.516 11.1656 10.5724C11.1885 10.6281 11.2 10.6885 11.2 10.7536C11.2 10.8187 11.1885 10.8791 11.1656 10.9348C11.1424 10.9912 11.1075 11.0427 11.0607 11.0894C11.0142 11.1359 10.9629 11.1707 10.9068 11.1939C10.8509 11.217 10.7903 11.2286 10.7249 11.2286Z" fill="rgb(242,48,48)" fillRule="evenodd" />
              </g>
            </g>
          </svg>
        }
        <span className="text-[16px] font-normal font-sans">{summary}</span>
        <span style={{ color: 'rgb(31, 31, 31)' }}>
          <ChevronIcon expanded={expanded} />
        </span>
        <span className="ml-auto hidden items-center gap-1" style={{ color: '#64748B', fontSize: 10 }}>
          {thinkingMode === 'debug' ? (
            <>
              <PawPrint />
              <span>shared</span>
            </>
          ) : (
            <span>private</span>
          )}
        </span>
      </button>}

      {/* Expanded body */}
      {expanded && (
        <div data-testid="cli-output-body">
          {toolUses.length > 0 && (
            <ToolsSection
              toolUses={toolUses}
              toolResults={toolResults}
              lastToolId={lastToolId}
              status={status}
              onUserInteract={() => {
                userInteracted.current = true;
              }}
              accent={accent}
            />
          )}
          {textEvents.length > 0 && (
            <>
              {toolUses.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '8px 12px 4px 12px',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 10,
                      color: '#475569',
                      display: 'none',
                    }}
                  >
                    ─── stdout ───
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
      <div
        style={{ padding: '8px 0 10px 0' }}
        className=" text-[11px] leading-relaxed cli-output-md"
      >
        <span>
          <MarkdownContent content={textEvents.map((e) => e.content).join('\n')} />
        </span>
      </div>
      {localPresentationFile && <PptAttachmentCard file={localPresentationFile} projectPath={projectPath} />}
    </div>
  );
}
