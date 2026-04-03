'use client';

import { type ReactNode } from 'react';
import { NameInitialIcon } from './NameInitialIcon';

export interface CapabilityBoardItem {
  id: string;
  type: 'mcp' | 'skill';
  source: 'cat-cafe' | 'external';
  enabled: boolean;
  cats: Record<string, boolean>;
  description?: string;
  triggers?: string[];
  category?: string;
  mounts?: Record<string, boolean>;
  tools?: { name: string; description?: string }[];
  connectionStatus?: 'connected' | 'disconnected' | 'unknown';
}

export interface CatFamily {
  id: string;
  name: string;
  catIds: string[];
}

export interface SkillHealthSummary {
  allMounted: boolean;
  registrationConsistent: boolean;
  unregistered: string[];
  phantom: string[];
}

export interface CapabilityBoardResponse {
  items: CapabilityBoardItem[];
  catFamilies: CatFamily[];
  projectPath: string;
  skillHealth?: SkillHealthSummary;
}

export type ToggleHandler = (
  id: string,
  type: 'mcp' | 'skill',
  enabled: boolean,
  scope?: 'global' | 'cat',
  catId?: string,
) => void;

export function McpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </svg>
  );
}

export function SkillIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export function ExtensionIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.315 8.685a.98.98 0 0 1 .837-.276c.47.07.802.48.968.925a2.501 2.501 0 1 0 3.214-3.214c-.446-.166-.855-.497-.925-.968a.979.979 0 0 1 .276-.837l1.61-1.61a2.404 2.404 0 0 1 1.705-.707c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.969a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" />
    </svg>
  );
}

function getSourceLabel(source: CapabilityBoardItem['source']): string {
  if (source === 'cat-cafe') return '官方';
  if (source === 'external') return '三方';
  return '未知';
}

export function CapabilitySection({
  title,
  subtitle: _subtitle,
  headerSlot,
  headerSlotClassName,
  titleActionSlot,
  showWhenEmpty,
  emptyState,
  items,
  catFamilies,
  toggling,
  onToggle,
  onUninstall,
  hideSkillMountStatus: _hideSkillMountStatus,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  headerSlot?: ReactNode;
  headerSlotClassName?: string;
  titleActionSlot?: ReactNode;
  showWhenEmpty?: boolean;
  emptyState?: ReactNode;
  items: CapabilityBoardItem[];
  catFamilies: CatFamily[];
  toggling: string | null;
  onToggle: ToggleHandler;
  onUninstall?: (id: string) => void;
  hideSkillMountStatus?: boolean;
}) {
  if (items.length === 0 && !showWhenEmpty) return null;

  return (
    <div className="mb-6 pt-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[20px] font-semibold">{title}</p>
          {titleActionSlot ? <div className="shrink-0">{titleActionSlot}</div> : null}
        </div>
        {headerSlot ? <div className={headerSlotClassName ?? 'mt-3'}>{headerSlot}</div> : null}
      </div>
      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <CapabilityCard
              key={`${item.type}:${item.id}`}
              item={item}
              catFamilies={catFamilies}
              toggling={toggling}
              onToggle={onToggle}
              onUninstall={onUninstall}
              hideSkillMountStatus={_hideSkillMountStatus}
            />
          ))}
        </div>
      ) : (
        emptyState ?? null
      )}
    </div>
  );
}

function CapabilityCard({
  item,
  catFamilies: _catFamilies,
  toggling,
  onToggle,
  onUninstall,
  hideSkillMountStatus: _hideSkillMountStatus,
}: {
  item: CapabilityBoardItem;
  catFamilies: CatFamily[];
  toggling: string | null;
  onToggle: ToggleHandler;
  onUninstall?: (id: string) => void;
  hideSkillMountStatus?: boolean;
}) {
  const isToggling = toggling === `${item.type}:${item.id}`;
  const sourceLabel = getSourceLabel(item.source);
  const resolvedDescription = item.description?.trim() || '暂未提供技能描述。';
  const showDeleteAction = item.source === 'external' && typeof onUninstall === 'function';

  return (
    <div
      className="ui-card group flex min-h-[194px] flex-col gap-4 p-5"
      data-testid={`capability-card-${item.type}-${item.id}`}
    >
      <div className="flex items-start gap-3">
        <NameInitialIcon name={item.id} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">{item.id}</h3>
            {item.connectionStatus ? <StatusDot status={item.connectionStatus} /> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span className="ui-badge-muted">{item.category?.trim() || '其他'}</span>
          </div>
        </div>
      </div>

      <p
        className="line-clamp-2 min-h-[44px] text-sm leading-6 text-[var(--text-secondary)]"
        title={resolvedDescription}
      >
        {resolvedDescription}
      </p>

      <div className="mt-auto flex items-end justify-between gap-3">
        <div className="min-h-5 text-xs leading-5">
          {showDeleteAction ? (
            <div className="relative">
              <span className="text-[var(--text-muted)] transition-opacity duration-200 group-hover:opacity-0">
                来源：{sourceLabel}
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUninstall?.(item.id);
                }}
                className="absolute left-0 top-0 opacity-0 text-[14px] font-bold text-[var(--text-accent)] transition-opacity duration-200 hover:underline group-hover:opacity-100"
              >
                删除
              </button>
            </div>
          ) : (
            <span className="text-[var(--text-muted)]">来源：{sourceLabel}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function StatusDot({ status }: { status: 'connected' | 'disconnected' | 'unknown' }) {
  const color =
    status === 'connected'
      ? 'bg-[var(--state-success-text)]'
      : status === 'disconnected'
        ? 'bg-[var(--state-error-text)]'
        : 'bg-[var(--text-muted)]';
  const label = status === 'connected' ? '已连接' : status === 'disconnected' ? '掉线' : '未知';
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} title={label} />;
}

export function SkillHealthBanner({ health, items }: { health: SkillHealthSummary; items?: CapabilityBoardItem[] }) {
  const allGood = health.allMounted && health.registrationConsistent;
  const mountFailures = (items ?? [])
    .filter((item) => item.type === 'skill' && item.source === 'cat-cafe' && item.mounts)
    .filter((item) => !Object.values(item.mounts!).every(Boolean))
    .map((item) => ({
      id: item.id,
      failed: Object.entries(item.mounts!)
        .filter(([, ok]) => !ok)
        .map(([provider]) => provider),
    }));

  return (
    <div
      className={`rounded-[var(--radius-md)] border px-3.5 py-2.5 text-xs ${allGood ? 'ui-status-success' : 'ui-status-warning'}`}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <span className={health.allMounted ? 'text-[var(--state-success-text)]' : 'text-[var(--state-warning-text)]'}>
            {health.allMounted ? '全部挂载正常' : '部分挂载异常'}
          </span>
          <span className="text-[var(--text-subtle)]">/</span>
          <span
            className={
              health.registrationConsistent ? 'text-[var(--state-success-text)]' : 'text-[var(--state-warning-text)]'
            }
          >
            {health.registrationConsistent ? '注册一致' : '注册不一致'}
          </span>
        </div>
        {mountFailures.length > 0 && (
          <div className="space-y-0.5 text-[var(--state-warning-text)]">
            {mountFailures.map((failure) => (
              <p key={failure.id}>
                <code className="rounded-[var(--radius-xs)] bg-[var(--state-warning-surface)] px-1 text-[10px]">
                  {failure.id}
                </code>{' '}
                — {failure.failed.join(', ')} 未挂载
              </p>
            ))}
          </div>
        )}
        {health.unregistered.length > 0 && (
          <p className="text-[var(--state-warning-text)]">未注册: {health.unregistered.join(', ')}</p>
        )}
        {health.phantom.length > 0 && (
          <p className="text-[var(--state-warning-text)]">幽灵项: {health.phantom.join(', ')}</p>
        )}
      </div>
    </div>
  );
}

export function FilterChips({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-[var(--text-secondary)]">{label}:</span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
            value === option.value
              ? 'border-[var(--border-accent)] bg-[var(--accent-soft)] text-[var(--text-accent)]'
              : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SectionIconMcp() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-card-muted)]">
      <McpIcon className="h-4 w-4 text-[var(--text-accent)]" />
    </div>
  );
}

export function SectionIconSkill() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-card-muted)]">
      <SkillIcon className="h-4 w-4 text-[var(--text-accent)]" />
    </div>
  );
}

export function SectionIconExtension() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-card-muted)]">
      <ExtensionIcon className="h-4 w-4 text-[var(--text-accent)]" />
    </div>
  );
}
