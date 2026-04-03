'use client';

import { Children, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { getMentionColor, getMentionLabel, getMentionRe, getMentionToCat } from '@/lib/mention-highlight';
import { useChatStore } from '@/stores/chatStore';
import { fetchSkillOptionsWithCache, getCachedSkillOptions } from '@/utils/skill-options-cache';

function renderSkillToken(skillName: string, key: string): ReactNode {
  return (
    <span
      key={key}
      className="inline-flex max-w-full translate-y-[-1px] items-center gap-1 rounded px-1 py-[1px] align-middle text-[rgba(20,118,255,1)]"
      data-skill-token="true"
    >
      <span
        aria-hidden="true"
        className="inline-block h-3.5 w-3.5 shrink-0"
        style={{
          backgroundColor: 'currentColor',
          maskImage: "url('/icons/menu/skills.svg')",
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskImage: "url('/icons/menu/skills.svg')",
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          WebkitMaskSize: 'contain',
        }}
      />
      <span className="truncate">{skillName}</span>
    </span>
  );
}

function appendTextWithSkills(parts: ReactNode[], text: string, keyPrefix: string, skillNames: string[]): void {
  if (!text) return;
  if (skillNames.length === 0) {
    parts.push(text);
    return;
  }

  const sortedSkills = [...skillNames].sort((a, b) => b.length - a.length);
  let cursor = 0;
  let plainStart = 0;

  while (cursor < text.length) {
    let matchedSkill: string | null = null;
    for (const skillName of sortedSkills) {
      if (!skillName) continue;
      if (!text.startsWith(skillName, cursor)) continue;
      const prev = cursor > 0 ? text[cursor - 1] : ' ';
      const next = cursor + skillName.length < text.length ? text[cursor + skillName.length] : ' ';
      if (/\s/.test(prev) && /\s/.test(next)) {
        matchedSkill = skillName;
        break;
      }
    }

    if (!matchedSkill) {
      cursor += 1;
      continue;
    }

    if (cursor > plainStart) parts.push(text.slice(plainStart, cursor));
    parts.push(renderSkillToken(matchedSkill, `${keyPrefix}-s${cursor}`));
    cursor += matchedSkill.length;
    plainStart = cursor;
  }

  if (plainStart < text.length) parts.push(text.slice(plainStart));
}

function highlightMentionsAndSkills(text: string, skillNames: string[]): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  const re = getMentionRe();
  const toCat = getMentionToCat();
  const colorMap = getMentionColor();
  const labelMap = getMentionLabel();

  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) {
      appendTextWithSkills(parts, text.slice(lastIdx, m.index), `p${m.index}`, skillNames);
    }
    const catId = toCat[m[1].toLowerCase()] ?? 'opus';
    const catColor = colorMap[catId] ?? '#9B7EBD';
    const label = labelMap[m[1].toLowerCase()] ?? m[0];
    const r = Number.parseInt(catColor.slice(1, 3), 16);
    const g = Number.parseInt(catColor.slice(3, 5), 16);
    const b = Number.parseInt(catColor.slice(5, 7), 16);
    parts.push(
      <span
        key={`m${m.index}`}
        className="font-semibold"
        style={{
          color: catColor,
          borderRadius: 4,
          padding: '1px 5px',
        }}
      >
        {label}
      </span>,
    );
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) {
    appendTextWithSkills(parts, text.slice(lastIdx), `tail${lastIdx}`, skillNames);
  }
  return parts;
}

function withMentions(children: ReactNode, skillNames: string[]): ReactNode {
  return Children.map(children, (child) =>
    typeof child === 'string' ? highlightMentionsAndSkills(child, skillNames) : child,
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = useCallback(() => {
    const text = preRef.current?.textContent ?? '';
    void navigator.clipboard.writeText(text);
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, []);

  return (
    <div className="relative group my-2">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded text-[10px] bg-gray-700 text-gray-300 md:opacity-0 md:group-hover:opacity-100 hover:bg-gray-600 transition-opacity"
      >
        {copied ? '已复制' : '复制'}
      </button>
      <pre
        ref={preRef}
        className="bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto text-xs leading-5 font-mono [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit [&>code]:text-xs"
      >
        {children}
      </pre>
    </div>
  );
}

const PROJECT_ROOT = process.env.NEXT_PUBLIC_PROJECT_ROOT ?? '';
const FILE_PATH_RE = /(?:^|\s)`?((?:\/[\w.@-]+)+(?:\.[\w]+)(?::(\d+))?)(?:`?)/g;
const REL_PATH_RE = /(?:^|\s)`?((?:packages|src|docs|tests?)\/[\w./@-]+(?:\.[\w]+)(?::(\d+))?)(?:`?)/g;
const WT_TAG_RE = /^\s*\[wt:([a-zA-Z0-9_/-]+)\]/;

function linkifyFilePaths(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  const combined = new RegExp(`${FILE_PATH_RE.source}|${REL_PATH_RE.source}`, 'g');
  let m: RegExpExecArray | null;

  combined.lastIndex = 0;
  while ((m = combined.exec(text)) !== null) {
    const fullMatch = m[0];
    const leading = fullMatch.match(/^\s/)?.[0] ?? '';
    const path = m[1] ?? m[3];
    const line = m[2] ?? m[4];
    if (!path) continue;

    const start = m.index + leading.length;
    if (start > lastIdx) parts.push(text.slice(lastIdx, start));

    const afterMatch = text.slice(m.index + fullMatch.length);
    const wtMatch = afterMatch.match(WT_TAG_RE);
    const worktreeId = wtMatch?.[1] ?? undefined;

    const display = path;
    const isAbsolute = path.startsWith('/');
    const filePath = path.split(':')[0];
    const absPath = isAbsolute ? filePath : PROJECT_ROOT ? `${PROJECT_ROOT}/${filePath}` : null;
    const href = absPath ? `vscode://file${absPath}${line ? `:${line}` : ''}` : null;

    parts.push(
      href ? (
        <FilePathLink
          key={`fp${m.index}`}
          display={display}
          href={href}
          filePath={filePath!}
          line={line ? parseInt(line, 10) : undefined}
          worktreeId={worktreeId}
        />
      ) : (
        <span key={`fp${m.index}`} className="text-blue-400 font-mono text-[0.85em]">
          {display}
        </span>
      ),
    );

    if (wtMatch) {
      lastIdx = m.index + fullMatch.length + wtMatch[0].length;
      combined.lastIndex = lastIdx;
    } else {
      lastIdx = m.index + fullMatch.length;
    }
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length > 0 ? parts : [text];
}

function FilePathLink({
  display,
  href,
  filePath,
  line,
  worktreeId,
}: {
  display: string;
  href: string;
  filePath: string;
  line?: number;
  worktreeId?: string;
}) {
  const setOpenFile = useChatStore((s) => s.setWorkspaceOpenFile);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      setOpenFile(filePath, line ?? null, worktreeId ?? null);
    },
    [setOpenFile, filePath, line, worktreeId],
  );

  return (
    <a
      href={href}
      onClick={handleClick}
      className="text-blue-400 hover:text-blue-300 hover:underline font-mono text-[0.85em] cursor-pointer"
      title={`点击在工作区中查看 · Cmd+Click 打开 VSCode\n${display}`}
    >
      {display}
    </a>
  );
}

function withMentionsAndLinks(children: ReactNode, skillNames: string[]): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child !== 'string') return child;
    const linked = linkifyFilePaths(child);
    return (
      <>
        {linked.map((node, i) =>
          typeof node === 'string' ? <span key={i}>{highlightMentionsAndSkills(node, skillNames)}</span> : node,
        )}
      </>
    );
  });
}

function createMdComponents(skillNames: string[]): Components {
  return {
    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{withMentionsAndLinks(children, skillNames)}</p>,
    strong: ({ children }) => <strong className="font-semibold">{withMentions(children, skillNames)}</strong>,
    em: ({ children }) => <em>{withMentions(children, skillNames)}</em>,
    del: ({ children }) => <del className="opacity-60">{withMentions(children, skillNames)}</del>,

    h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{withMentions(children, skillNames)}</h1>,
    h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{withMentions(children, skillNames)}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{withMentions(children, skillNames)}</h3>,

    ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
    li: ({ children }) => <li>{withMentions(children, skillNames)}</li>,

    blockquote: ({ children }) => (
      <blockquote className="border-l-[3px] border-gray-300 pl-3 my-2 italic opacity-80">{children}</blockquote>
    ),
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
        {withMentions(children, skillNames)}
      </a>
    ),
    hr: () => <hr className="my-3 border-gray-200" />,

    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    code: ({ className, children }) => (
      <code className={`${className ?? ''} bg-gray-200/50 rounded px-1 py-0.5 text-[0.85em] font-mono`}>{children}</code>
    ),

    table: ({ children }) => (
      <div className="overflow-x-auto my-2">
        <table className="min-w-full text-sm border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
    th: ({ children }) => (
      <th className="border border-gray-300 px-2 py-1 text-left font-semibold text-xs">{withMentions(children, skillNames)}</th>
    ),
    td: ({ children }) => <td className="border border-gray-300 px-2 py-1">{withMentions(children, skillNames)}</td>,
  };
}

interface Props {
  content: string;
  className?: string;
  disableCommandPrefix?: boolean;
  basePath?: string;
}

export function isRelativeMdLink(href: string | undefined): href is string {
  if (!href) return false;
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/')) return false;
  return /\.mdx?(?:#|$)/.test(href);
}

export function resolveRelativePath(base: string, relative: string): string {
  const clean = relative.split('#')[0];
  const parts = base ? base.split('/') : [];
  for (const seg of clean.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

export function MarkdownContent({ content, className, disableCommandPrefix, basePath }: Props) {
  const [skillNames, setSkillNames] = useState<string[]>(() =>
    (getCachedSkillOptions() ?? []).map((item) => item.name),
  );

  useEffect(() => {
    let active = true;
    void fetchSkillOptionsWithCache().then((options) => {
      if (!active) return;
      setSkillNames(options.map((item) => item.name));
    });

    return () => {
      active = false;
    };
  }, []);

  const cmdMatch = disableCommandPrefix ? null : /^(\/\w+)/.exec(content);
  const md = cmdMatch ? content.slice(cmdMatch[1].length) : content;

  const components = useMemo(() => {
    const baseComponents = createMdComponents(skillNames);
    return basePath != null
      ? { ...baseComponents, a: createWorkspaceLinkComponent(basePath, skillNames) }
      : baseComponents;
  }, [basePath, skillNames]);

  return (
    <div
      className={`markdown-content font-sans text-sm break-words ${className ?? ''}`}
      style={{ fontFamily: 'Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif' }}
    >
      {cmdMatch && <span className="text-indigo-500">{cmdMatch[1]}</span>}
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {md}
      </ReactMarkdown>
    </div>
  );
}

function createWorkspaceLinkComponent(basePath: string, skillNames: string[]): Components['a'] {
  return function WorkspaceLink({ href, children }) {
    const setOpenFile = useChatStore((s) => s.setWorkspaceOpenFile);

    if (isRelativeMdLink(href)) {
      const resolved = resolveRelativePath(basePath, href);
      return (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setOpenFile(resolved);
          }}
          className="text-blue-500 hover:text-blue-400 hover:underline break-all cursor-pointer"
          title={`在工作区中打开 ${resolved}`}
        >
          {withMentions(children, skillNames)}
        </a>
      );
    }

    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
        {withMentions(children, skillNames)}
      </a>
    );
  };
}
