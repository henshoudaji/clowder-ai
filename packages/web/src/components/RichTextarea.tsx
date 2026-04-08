import {
  forwardRef,
  type CSSProperties,
  type ClipboardEvent,
  type KeyboardEvent,
  type UIEvent,
  useLayoutEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { getMentionToCat } from '@/lib/mention-highlight';

export interface RichSkillOption {
  name: string;
  iconUrl?: string | null;
}

interface RichTextareaProps {
  value: string;
  onValueChange: (value: string, selectionStart: number, selectionEnd: number) => void;
  onInput?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onPaste?: (e: ClipboardEvent<HTMLDivElement>) => void;
  onScroll?: (e: UIEvent<HTMLDivElement>) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  skillOptions?: RichSkillOption[];
}

export interface RichTextareaHandle {
  focus: () => void;
  getSelectionStart: () => number;
  getSelectionEnd: () => number;
  setSelectionRange: (start: number, end: number) => void;
  getElement: () => HTMLDivElement | null;
}

type Segment =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string }
  | { type: 'skill'; text: string; iconUrl?: string | null };

const MENTION_RIGHT_WHITESPACE_RE = /\s/;

function buildSegments(value: string, skillOptions: RichSkillOption[]): Segment[] {
  if (!value) return [{ type: 'text', text: '' }];
  const sortedSkills = [...skillOptions].sort((a, b) => b.name.length - a.name.length);
  const mentionToCat = getMentionToCat();
  const mentionAliases = Object.keys(mentionToCat).sort((a, b) => b.length - a.length);
  const segments: Segment[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    let matchedSkill: RichSkillOption | null = null;
    for (const skill of sortedSkills) {
      const name = skill.name;
      if (!name) continue;
      if (!value.startsWith(name, cursor)) continue;
      const prev = cursor > 0 ? value[cursor - 1] : ' ';
      const next = cursor + name.length < value.length ? value[cursor + name.length] : ' ';
      if (/\s/.test(prev) && /\s/.test(next)) {
        matchedSkill = skill;
        break;
      }
    }
    if (matchedSkill) {
      segments.push({ type: 'skill', text: matchedSkill.name, iconUrl: matchedSkill.iconUrl });
      cursor += matchedSkill.name.length;
      continue;
    }

    const prev = cursor > 0 ? value[cursor - 1] : ' ';
    if (value[cursor] === '@' && /\s/.test(prev)) {
      let matched: { text: string; len: number } | null = null;
      for (const alias of mentionAliases) {
        if (!alias) continue;
        const token = `@${alias}`;
        const raw = value.slice(cursor, cursor + token.length);
        if (raw.toLowerCase() !== token.toLowerCase()) continue;
        const next = value[cursor + token.length];
        // Mention must be followed by an actual whitespace char.
        // End-of-text does NOT count, so deleting trailing space de-highlights immediately.
        if (!next || !MENTION_RIGHT_WHITESPACE_RE.test(next)) continue;
        matched = { text: raw, len: token.length };
        break;
      }
      if (matched) {
        segments.push({ type: 'mention', text: matched.text });
        cursor += matched.len;
        continue;
      }
    }

    segments.push({ type: 'text', text: value[cursor] ?? '' });
    cursor += 1;
  }
  return segments;
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\u00A0/g, ' ');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  if (el.dataset.tokenType === 'skill') return el.dataset.tokenValue ?? '';
  let out = '';
  for (const child of Array.from(el.childNodes)) out += serializeNode(child);
  return out;
}

function serializeNodeSignature(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return `t:${(node.textContent ?? '').replace(/\u00A0/g, ' ')}`;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  if (el.dataset.tokenType === 'skill') return `s:${el.dataset.tokenValue ?? ''}`;
  if (el.dataset.tokenType === 'mention') return `m:${el.textContent ?? ''}`;
  let out = '';
  for (const child of Array.from(el.childNodes)) out += serializeNodeSignature(child);
  return out;
}

function collectTextNodes(root: HTMLElement): Array<{ node: Node; start: number; end: number }> {
  const out: Array<{ node: Node; start: number; end: number }> = [];
  let offset = 0;
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      out.push({ node, start: offset, end: offset + text.length });
      offset += text.length;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.dataset.tokenType === 'skill') {
      const token = el.dataset.tokenValue ?? '';
      out.push({ node: el, start: offset, end: offset + token.length });
      offset += token.length;
      return;
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  walk(root);
  return out;
}

function getSelectionOffset(root: HTMLElement, atEnd: boolean): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(root);
  const active = sel.getRangeAt(0);
  range.setEnd(atEnd ? active.endContainer : active.startContainer, atEnd ? active.endOffset : active.startOffset);
  return range.toString().length;
}

function setSelectionOffset(root: HTMLElement, start: number, end: number): void {
  const nodes = collectTextNodes(root);
  const pick = (offset: number): { node: Node; offset: number } => {
    for (const item of nodes) {
      if (offset <= item.end) {
        if (item.node.nodeType === Node.TEXT_NODE) {
          return { node: item.node, offset: Math.max(0, Math.min((item.node.textContent ?? '').length, offset - item.start)) };
        }
        const parent = item.node.parentNode;
        if (parent) {
          const idx = Array.prototype.indexOf.call(parent.childNodes, item.node);
          if (offset - item.start <= 0) return { node: parent, offset: idx };
          return { node: parent, offset: idx + 1 };
        }
      }
    }
    return { node: root, offset: root.childNodes.length };
  };

  const s = pick(start);
  const e = pick(end);
  const range = document.createRange();
  range.setStart(s.node, s.offset);
  range.setEnd(e.node, e.offset);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

export const RichTextarea = forwardRef<RichTextareaHandle, RichTextareaProps>(function RichTextarea(
  {
    value,
    onValueChange,
    onInput,
    onKeyDown,
    onPaste,
    onScroll,
    placeholder,
    className,
    style,
    disabled,
    skillOptions = [],
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isComposingRef = useRef(false);
  const segments = useMemo(() => buildSegments(value, skillOptions), [value, skillOptions]);
  const segmentSignature = useMemo(
    () =>
      segments
        .map((seg) => {
          if (seg.type === 'text') return `t:${seg.text}`;
          if (seg.type === 'mention') return `m:${seg.text}`;
          return `s:${seg.text}`;
        })
        .join(''),
    [segments],
  );

  useImperativeHandle(ref, () => ({
    focus: () => rootRef.current?.focus(),
    getSelectionStart: () => {
      const root = rootRef.current;
      if (!root) return 0;
      return getSelectionOffset(root, false);
    },
    getSelectionEnd: () => {
      const root = rootRef.current;
      if (!root) return 0;
      return getSelectionOffset(root, true);
    },
    setSelectionRange: (start: number, end: number) => {
      const root = rootRef.current;
      if (!root) return;
      setSelectionOffset(root, start, end);
    },
    getElement: () => rootRef.current,
  }));

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // IME composition guard: rebuilding DOM during 拼音组合输入会打断候选词。
    if (isComposingRef.current) return;
    const current = Array.from(root.childNodes).map((n) => serializeNode(n)).join('');
    const currentSignature = Array.from(root.childNodes).map((n) => serializeNodeSignature(n)).join('');
    if (current === value && currentSignature === segmentSignature) return;

    const active = document.activeElement === root;
    const start = active ? getSelectionOffset(root, false) : 0;
    const end = active ? getSelectionOffset(root, true) : 0;

    const frag = document.createDocumentFragment();
    for (const seg of segments) {
      if (seg.type === 'text') {
        frag.appendChild(document.createTextNode(seg.text));
        continue;
      }
      if (seg.type === 'mention') {
        const span = document.createElement('span');
        span.setAttribute('data-token-type', 'mention');
        span.className = 'text-[rgba(20,118,255,1)]';
        span.textContent = seg.text;
        frag.appendChild(span);
        continue;
      }
      const token = document.createElement('span');
      token.setAttribute('data-token-type', 'skill');
      token.setAttribute('data-token-value', seg.text);
      token.setAttribute('contenteditable', 'false');
      token.className =
        'inline-flex max-w-full translate-y-[-1px] items-center gap-1 text-[rgba(20,118,255,1)] text-[16px] leading-5 align-middle';

      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.className = 'inline-block h-4 w-4 shrink-0';
      icon.style.backgroundColor = 'currentColor';
      icon.style.maskImage = "url('/icons/menu/skills.svg')";
      icon.style.maskRepeat = 'no-repeat';
      icon.style.maskPosition = 'center';
      icon.style.maskSize = 'contain';
      icon.style.webkitMaskImage = "url('/icons/menu/skills.svg')";
      icon.style.webkitMaskRepeat = 'no-repeat';
      icon.style.webkitMaskPosition = 'center';
      icon.style.webkitMaskSize = 'contain';
      token.appendChild(icon);

      const label = document.createElement('span');
      label.className = 'truncate';
      label.textContent = seg.text;
      token.appendChild(label);
      frag.appendChild(token);
    }

    root.replaceChildren(frag);
    if (active) {
      const nextStart = Math.min(start, value.length);
      const nextEnd = Math.min(end, value.length);
      setSelectionOffset(root, nextStart, nextEnd);
    }
  }, [segments, segmentSignature, value]);

  return (
    <div className="relative">
      {!value && placeholder && (
        <div className="pointer-events-none absolute left-4 top-4 text-[16px] text-gray-400">{placeholder}</div>
      )}
      <div
        ref={rootRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={className}
        style={style}
        role="textbox"
        aria-multiline="true"
        onInput={() => {
          const root = rootRef.current;
          if (!root) return;
          const next = Array.from(root.childNodes).map((n) => serializeNode(n)).join('');
          onValueChange(next, getSelectionOffset(root, false), getSelectionOffset(root, true));
          onInput?.();
        }}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          const root = rootRef.current;
          if (!root) return;
          const next = Array.from(root.childNodes).map((n) => serializeNode(n)).join('');
          onValueChange(next, getSelectionOffset(root, false), getSelectionOffset(root, true));
          onInput?.();
        }}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          onPaste?.(e);
          if (e.defaultPrevented) return;

          e.preventDefault();
          const root = rootRef.current;
          if (!root) return;
          const plain = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r?\n+/g, ' ');

          const start = getSelectionOffset(root, false);
          const end = getSelectionOffset(root, true);
          const next = `${value.slice(0, start)}${plain}${value.slice(end)}`;
          const caret = start + plain.length;
          onValueChange(next, caret, caret);
          onInput?.();
        }}
        onScroll={onScroll}
      />
    </div>
  );
});
