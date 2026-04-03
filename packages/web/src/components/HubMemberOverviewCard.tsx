import type { CatData } from '@/hooks/useCatData';
import type { CatConfig, CoCreatorConfig } from './config-viewer-types';

function safeAvatarSrc(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/avatars/')) return trimmed;
  return null;
}

function humanizeProvider(provider: string, labels?: Record<string, string>) {
  if (labels?.[provider]) return labels[provider];
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'anthropic') return 'Anthropic';
  if (provider === 'google') return 'Gemini';
  if (provider === 'dare') return 'Office Agent';
  if (provider === 'opencode') return 'OpenCode';
  if (provider === 'relayclaw') return 'Assistant Agent';
  if (provider === 'antigravity') return 'Antigravity';
  return provider;
}

function clientRuntimeLabel(cat: CatData, configCat?: CatConfig, labels?: Record<string, string>) {
  if (cat.embeddedRuntimeKind === 'agentteams_acp') return 'Assistant Agent';
  if (labels?.[cat.provider]) return labels[cat.provider];
  if (cat.provider === 'relayclaw') return 'Assistant Agent';
  if (cat.provider === 'dare') return 'Office Agent';
  const accountRef = (cat.accountRef ?? cat.providerProfileId ?? '').toLowerCase();
  if (accountRef.includes('claude')) return 'Claude';
  if (accountRef.includes('codex')) return 'Codex';
  if (accountRef.includes('gemini')) return 'Gemini';
  if (accountRef.includes('opencode')) return 'OpenCode';
  if (accountRef.includes('dare')) return 'Office Agent';
  if (accountRef.includes('jiu') || accountRef.includes('modelarts')) return 'ModelArts';
  if (cat.provider === 'antigravity') return 'Antigravity';
  if (cat.source === 'runtime' && cat.provider === 'openai') return 'OpenAI-Compatible';
  return humanizeProvider(configCat?.provider ?? cat.provider, labels);
}

function cleanAccountRef(raw: string): string {
  return raw.replace(/-migrated-\d+$/, '');
}

function accountSummary(cat: CatData) {
  const accountRef = cat.accountRef?.trim() ?? cat.providerProfileId?.trim() ?? '';
  if (cat.embeddedRuntimeKind === 'agentteams_acp') {
    const cleaned = accountRef ? cleanAccountRef(accountRef) : '';
    return cleaned ? `内置 Runtime · API Key · ${cleaned}` : '内置 Runtime · 待绑定 API Key';
  }
  if (!accountRef) return humanizeProvider(cat.provider);
  const cleaned = cleanAccountRef(accountRef);
  if (cleaned === 'claude' || cleaned === 'codex' || cleaned === 'gemini' || cleaned === 'dare' || cleaned === 'opencode') {
    return '内置 OAuth 账号';
  }
  return `API Key · ${cleaned}`;
}

function getMetaSummary(cat: CatData, configCat?: CatConfig, labels?: Record<string, string>) {
  if (cat.provider === 'antigravity') {
    return `Antigravity · ${configCat?.model ?? cat.defaultModel} · CLI Bridge`;
  }

  return `${clientRuntimeLabel(cat, configCat, labels)} · ${configCat?.model ?? cat.defaultModel} · ${accountSummary(cat)}`;
}

function getStatusBadge(cat: CatData) {
  if (cat.roster?.available === false) {
    return {
      enabled: false,
      label: '未启用',
      className: 'border border-[var(--border-default)] bg-[var(--surface-card-muted)] text-[var(--text-secondary)]',
    };
  }
  return {
    enabled: true,
    label: '已启用',
    className: 'ui-status-success',
  };
}

function formatMentionPreview(patterns: string[], max = 3) {
  const visible = patterns.slice(0, max);
  const rest = patterns.length - visible.length;
  return rest > 0 ? `${visible.join('  ')}  +${rest}` : visible.join('  ');
}

export function HubCoCreatorOverviewCard({ coCreator, onEdit }: { coCreator: CoCreatorConfig; onEdit?: () => void }) {
  const primary = coCreator.color?.primary ?? '#D4A76A';
  const avatarSrc = safeAvatarSrc(coCreator.avatar);

  return (
    <section
      role={onEdit ? 'button' : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onClick={() => onEdit?.()}
      onKeyDown={(event) => {
        if (!onEdit) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEdit();
        }
      }}
      className="ui-card-muted px-[18px] py-[18px]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white"
            style={{ backgroundColor: primary }}
          >
            {avatarSrc ? (
              // biome-ignore lint/performance/noImgElement: co-creator avatar may be runtime upload URL
              <img src={avatarSrc} alt={`${coCreator.name} avatar`} className="h-full w-full object-cover" />
            ) : (
              'ME'
            )}
          </div>
          <h3 className="text-base font-bold text-[var(--text-primary)]">{coCreator.name}</h3>
        </div>
        <span className="ui-status-warning flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-1 text-[11px] font-semibold">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
          Owner
        </span>
      </div>
      <p className="mt-2.5 text-[13px] text-[var(--text-secondary)]">
        别名: {coCreator.aliases.join(' · ') || '无'} · 仅可编辑，不可新增或删除
      </p>
      <p className="mt-2 text-[13px] text-[var(--text-accent)]">{formatMentionPreview(coCreator.mentionPatterns, 2)}</p>
    </section>
  );
}

export function HubOverviewToolbar({ onAddMember }: { onAddMember?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[13px] text-[var(--text-secondary)]">全部 · 订阅 · API Key · 未启用</p>
      <button type="button" onClick={onAddMember} className="ui-button-primary">
        + 添加成员
      </button>
    </div>
  );
}

export function HubMemberOverviewCard({
  cat,
  configCat,
  clientLabels,
  onEdit,
  onToggleAvailability,
  togglingAvailability = false,
}: {
  cat: CatData;
  configCat?: CatConfig;
  clientLabels?: Record<string, string>;
  onEdit?: (cat: CatData) => void;
  onToggleAvailability?: (cat: CatData) => void;
  togglingAvailability?: boolean;
}) {
  const status = getStatusBadge(cat);
  const title = [cat.breedDisplayName ?? cat.displayName, cat.nickname].filter(Boolean).join(' · ');

  return (
    <section
      role={onEdit ? 'button' : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onClick={() => onEdit?.(cat)}
      onKeyDown={(event) => {
        if (!onEdit) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEdit(cat);
        }
      }}
      className="ui-card px-[18px] py-[18px] transition-colors hover:border-[var(--border-accent)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-bold text-[var(--text-primary)]">{title}</h3>
            {cat.source === 'runtime' ? (
              <span className="ui-badge-muted text-[var(--text-accent)]">动态创建</span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleAvailability?.(cat);
          }}
          disabled={!onToggleAvailability || togglingAvailability}
          aria-pressed={status.enabled}
          className={`rounded-[var(--radius-pill)] px-2.5 py-1 text-[11px] font-semibold transition ${status.className} disabled:cursor-default`}
        >
          {togglingAvailability ? '切换中...' : status.label}
        </button>
      </div>

      <p className="mt-2.5 text-[13px] text-[var(--text-secondary)]">{getMetaSummary(cat, configCat, clientLabels)}</p>

      <p className="mt-2 text-[13px] text-[var(--text-accent)]">{formatMentionPreview(cat.mentionPatterns)}</p>
    </section>
  );
}
