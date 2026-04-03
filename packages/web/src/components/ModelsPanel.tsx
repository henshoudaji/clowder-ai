﻿'use client';

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import { getNameInitial } from '@/lib/name-initial-icon';
import { NameInitialIcon } from './NameInitialIcon';
import { TagEditor } from './hub-tag-editor';
import { uploadAvatarAsset } from './hub-cat-editor.client';
import { useConfirm } from './useConfirm';

const ADD_MODEL = '添加模型';
const MODEL_TITLE = '模型';
const SEARCH_PLACEHOLDER = '输入关键字搜索、过滤';
const LOADING_TEXT = '加载中...';
const EMPTY_TEXT = '暂无模型信息';
const NO_RESULTS_TEXT = '未找到匹配模型';
const NO_RESULTS_HINT = '试试模型名、厂商名、模型 ID 或描述关键词';
const DEFAULT_DESC =
  '专注于知识问答、内容创作等通用任务，可实现高性能与低成本的平衡，适用于智能客服、个性化推荐等场景。';
const HUAWEI_MAAS_GROUP_LABEL = '华为云 MaaS';
const CUSTOM_MODEL_GROUP_LABEL = '自定义模型';
const VENDOR_ICON = '/images/vendor.svg';
const DEFAULT_DEVELOPER = '华为云 MaaS';
const UNKNOWN_PROTOCOL_LABEL = 'unknown';
const CREATE_MODEL_LABEL = '新建模型';
const CREATE_MODEL_CANCEL_LABEL = '取消';
const CREATE_MODEL_CONFIRM_LABEL = '确定';
const DELETE_MODEL_LABEL = '删除';
const MODEL_ICON_MAX_BYTES = 200 * 1024;
const EMPTY_MODEL_ICON_DATA_URL =
  'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%3E%3Crect%20x%3D%223%22%20y%3D%223%22%20width%3D%2290%22%20height%3D%2290%22%20rx%3D%2245%22%20fill%3D%22%23F8FAFC%22%20stroke%3D%22%23CBD5E1%22%20stroke-width%3D%223%22%20stroke-dasharray%3D%226%206%22/%3E%3Cpath%20d%3D%22M48%2034v28M34%2048h28%22%20stroke%3D%22%2394A3B8%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22/%3E%3C/svg%3E';

function stableHash(input: string): number {
  let hash = 0;
  for (const ch of input) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function generateModelIconDataUrl(name: string, variant = 0): string {
  const seed = `${name.trim().toLowerCase() || 'model'}#${variant}`;
  const baseHue = stableHash(seed) % 360;
  const accentHue = (baseHue + 34) % 360;
  const haloHue = (baseHue + 68) % 360;
  const label = getNameInitial(name || 'M');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="hsl(${baseHue} 68% 55%)" />
          <stop offset="100%" stop-color="hsl(${accentHue} 62% 48%)" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="48" fill="url(#g)" />
      <circle cx="48" cy="48" r="38" fill="hsl(${haloHue} 80% 92% / 0.25)" />
      <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="38" font-weight="700" fill="#FFFFFF">${label}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function SparklesIcon() {
  return (
    <svg className="mx-auto block h-[16px] w-[16px] text-[var(--text-accent)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4.4L13.7 9.3L18.6 11L13.7 12.7L12 17.6L10.3 12.7L5.4 11L10.3 9.3L12 4.4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M17.8 5.7L18.2 6.8L19.3 7.2L18.2 7.6L17.8 8.7L17.4 7.6L16.3 7.2L17.4 6.8L17.8 5.7Z" fill="currentColor" />
      <path d="M6.2 15.6L6.45 16.3L7.15 16.55L6.45 16.8L6.2 17.5L5.95 16.8L5.25 16.55L5.95 16.3L6.2 15.6Z" fill="currentColor" />
    </svg>
  );
}

interface MassModelResponseItem {
  id?: string | number;
  object?: string;
  name?: string;
  description?: string;
  protocol?: string;
  labels?: string[];
  developer?: string;
  icon?: string;
  [key: string]: unknown;
}

interface ModelCardData {
  id: string;
  object: string;
  name: string;
  description: string;
  labels: string[];
  developer: string;
  icon?: string;
  protocol: string;
  [key: string]: unknown;
}

interface ModelCardGroup {
  key: string;
  label: string;
  items: ModelCardData[];
}

interface ModelConfigProviderItem {
  id: string;
  displayName?: string;
  description?: string;
  icon?: string;
  models?: string[];
}

function pickStringField(item: MassModelResponseItem, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const value = item[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[,，/|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeModel(item: MassModelResponseItem, index: number): ModelCardData {
  const nameFromKnownFields = pickStringField(item, [
    'name',
    'modelName',
    'model_name',
    'displayName',
    'display_name',
    '名称',
  ]);

  const genericStringEntries = Object.entries(item).filter(
    ([key, value]) => typeof value === 'string' && key !== 'id' && key !== 'object',
  ) as Array<[string, string]>;

  const inferredName =
    nameFromKnownFields ?? genericStringEntries.find(([key]) => !/desc|description|描述/i.test(key))?.[1]?.trim() ?? '';

  const inferredDescription =
    pickStringField(item, ['description', 'desc', '描述']) ??
    genericStringEntries.find(([, value]) => value.trim() !== inferredName)?.[1]?.trim() ??
    DEFAULT_DESC;

  const id = String(item.id ?? `${inferredName || 'model'}-${index}`);
  const object = String(item.object ?? 'model');
  const labels = normalizeStringArray(item.labels || []);
  const developer =
    pickStringField(item, ['developer', 'provider', 'vendor', 'publisher', 'company']) ?? DEFAULT_DEVELOPER;
  const icon = pickStringField(item, ['icon', 'logo', 'image', 'avatar']);
  const protocol = pickStringField(item, ['protocol']) ?? UNKNOWN_PROTOCOL_LABEL;

  return {
    id,
    object,
    name: inferredName,
    description: inferredDescription,
    labels,
    developer,
    icon,
    protocol,
  };
}

function protocolGroupLabel(protocol: string): string {
  const trimmed = protocol.trim();
  if (trimmed.toLowerCase() === 'huawei_maas') return HUAWEI_MAAS_GROUP_LABEL;
  return CUSTOM_MODEL_GROUP_LABEL;
}

function protocolGroupKey(protocol: string): string {
  const trimmed = protocol.trim().toLowerCase();
  if (trimmed === 'huawei_maas') return 'huawei_maas';
  return 'custom_models';
}

function buildModelSearchText(card: ModelCardData): string {
  return [
    card.name,
    card.description,
    card.id,
    card.object,
    card.developer,
    card.protocol,
    protocolGroupLabel(card.protocol),
    ...card.labels,
  ]
    .join(' ')
    .toLowerCase();
}

function groupCards(cards: ModelCardData[]): ModelCardGroup[] {
  return cards.reduce<ModelCardGroup[]>((acc, item) => {
    const key = protocolGroupKey(item.protocol || UNKNOWN_PROTOCOL_LABEL);
    const existing = acc.find((group) => group.key === key);
    if (existing) {
      existing.items.push(item);
      return acc;
    }
    acc.push({ key, label: protocolGroupLabel(key), items: [item] });
    return acc;
  }, []);
}

export function ModelsPanel() {
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cards, setCards] = useState<ModelCardData[]>([]);
  const [resolvedProjectPath, setResolvedProjectPath] = useState<string | null>(null);
  const [showAddModelModal, setShowAddModelModal] = useState(false);
  const [showCreateModelModal, setShowCreateModelModal] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createModelError, setCreateModelError] = useState<string | null>(null);
  const [createModelBusy, setCreateModelBusy] = useState(false);
  const [modelNameInput, setModelNameInput] = useState('');
  const [modelDescriptionInput, setModelDescriptionInput] = useState('');
  const [modelIconInput, setModelIconInput] = useState(EMPTY_MODEL_ICON_DATA_URL);
  const [modelIconUploading, setModelIconUploading] = useState(false);
  const [modelDisplayNameInput, setModelDisplayNameInput] = useState('');
  const [modelUrlInput, setModelUrlInput] = useState('');
  const [modelApiKeyInput, setModelApiKeyInput] = useState('');
  const [modelHeadersInput, setModelHeadersInput] = useState('');
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingOriginalModelName, setEditingOriginalModelName] = useState<string | null>(null);
  const [editingSourceModels, setEditingSourceModels] = useState<string[]>([]);
  const [editModelBusy, setEditModelBusy] = useState(false);
  const modelIconFileInputRef = useRef<HTMLInputElement | null>(null);
  const openHub = useChatStore((s) => s.openHub);
  const currentProjectPath = useChatStore((s) => s.currentProjectPath);
  const confirm = useConfirm();

  const isEditMode = Boolean(editingSourceId);
  const canConfirmCreateModel = isEditMode
    ? modelNameInput?.trim().length > 0
    : modelNameInput?.trim().length > 0 && modelUrlInput?.trim().length > 0 && modelApiKeyInput?.trim().length > 0;

  const buildModelsUrl = useCallback(() => {
    const query = new URLSearchParams();
    if (currentProjectPath && currentProjectPath !== 'default') {
      query.set('projectPath', currentProjectPath);
    }
    const queryText = query.toString();
    return queryText ? `/api/maas-models?${queryText}` : '/api/maas-models';
  }, [currentProjectPath]);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(buildModelsUrl());
      if (!res.ok) {
        setCards([]);
        return;
      }
      const json = (await res.json()) as {
        projectPath?: string;
        list?: MassModelResponseItem[];
        models?: MassModelResponseItem[];
      };
      const source = Array.isArray(json.list) ? json.list : Array.isArray(json.models) ? json.models : [];
      setCards(source.map(normalizeModel));
      setResolvedProjectPath(typeof json.projectPath === 'string' ? json.projectPath : null);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [buildModelsUrl]);

  const handleDeleteModel = useCallback(
    async (cardId: string, cardName: string) => {
      if (deletingModelId) return;
      const ok = await confirm({
        title: '删除模型',
        message: `确认删除模型“${cardName || cardId}”？此操作不可恢复。`,
        confirmLabel: '删除',
        cancelLabel: '取消',
        variant: 'danger',
      });
      if (!ok) return;
      setDeletingModelId(cardId);
      try {
        // cardId format: model_config:{sourceId}:{modelName} or model_config:{sourceId}
        // extract sourceId (the part after "model_config:" and before the last ":")
        let sourceId = cardId;
        if (cardId.startsWith('model_config:')) {
          const parts = cardId.split(':');
          if (parts.length >= 2) {
            sourceId = parts[1];
          }
        }
        const query = new URLSearchParams();
        if (currentProjectPath && currentProjectPath !== 'default') {
          query.set('projectPath', currentProjectPath);
        }
        const queryText = query.toString();
        const url = `/api/model-config-profiles/${encodeURIComponent(sourceId)}${queryText ? `?${queryText}` : ''}`;
        const res = await apiFetch(url, { method: 'DELETE' });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `删除失败 (${res.status})`);
        }
        await fetchModels();
      } catch (error) {
        console.error('Delete model failed:', error);
      } finally {
        setDeletingModelId(null);
      }
    },
    [confirm, deletingModelId, currentProjectPath, fetchModels],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(buildModelsUrl());
        if (!res.ok) {
          if (!cancelled) setCards([]);
          return;
        }
        const json = (await res.json()) as {
          projectPath?: string;
          list?: MassModelResponseItem[];
          models?: MassModelResponseItem[];
        };
        const source = Array.isArray(json.list) ? json.list : Array.isArray(json.models) ? json.models : [];
        if (!cancelled) {
          setCards(source.map(normalizeModel));
          setResolvedProjectPath(typeof json.projectPath === 'string' ? json.projectPath : null);
        }
      } catch {
        if (!cancelled) setCards([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildModelsUrl]);

  const normalizedQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  const filteredCards = useMemo(() => {
    if (!normalizedQuery) return cards;
    return cards.filter((card) => buildModelSearchText(card).includes(normalizedQuery));
  }, [cards, normalizedQuery]);

  const groupedCards = useMemo(() => groupCards(filteredCards), [filteredCards]);
  const hasSearchQuery = normalizedQuery.length > 0;
  const showEmptyData = !loading && cards.length === 0;
  const showNoResults = !loading && cards.length > 0 && hasSearchQuery && groupedCards.length === 0;
  const showGroups = !loading && groupedCards.length > 0;

  const resolveModelConfigSourceId = (cardId: string): string | null => {
    if (!cardId.startsWith('model_config:')) return null;
    const parts = cardId.split(':');
    if (parts.length < 3) return null;
    const sourceId = parts[1]?.trim();
    return sourceId ? sourceId : null;
  };

  const resolveProjectPathForPayload = () =>
    resolvedProjectPath || (currentProjectPath && currentProjectPath !== 'default' ? currentProjectPath : undefined);

  const closeCreateModelModal = () => {
    setShowCreateModelModal(false);
    setCreateModelError(null);
    setEditingSourceId(null);
    setEditingOriginalModelName(null);
    setEditingSourceModels([]);
  };

  const resetCreateModelForm = () => {
    setModelNameInput('');
    setModelDescriptionInput('');
    setModelIconInput(EMPTY_MODEL_ICON_DATA_URL);
    setModelDisplayNameInput('');
    setModelUrlInput('');
    setModelApiKeyInput('');
    setModelHeadersInput('');
  };

  const handleOpenCreateModelModal = () => {
    resetCreateModelForm();
    setEditingSourceId(null);
    setEditingOriginalModelName(null);
    setEditingSourceModels([]);
    setCreateModelError(null);
    setShowCreateModelModal(true);
  };

  const handleOpenEditModelModal = async (card: ModelCardData) => {
    const sourceId = resolveModelConfigSourceId(card.id);
    if (!sourceId || editModelBusy) return;

    resetCreateModelForm();
    setCreateModelError(null);
    setEditModelBusy(true);
    try {
      const projectPath = resolveProjectPathForPayload();
      const query = new URLSearchParams();
      if (projectPath) query.set('projectPath', projectPath);
      const queryText = query.toString();
      const url = `/api/model-config-profiles${queryText ? `?${queryText}` : ''}`;
      const res = await apiFetch(url);
      const body = (await res.json().catch(() => ({}))) as { providers?: ModelConfigProviderItem[]; error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `请求失败 (${res.status})`);
      }
      const provider = (body.providers ?? []).find((item) => item.id === sourceId);

      setEditingSourceId(sourceId);
      setEditingOriginalModelName(card.name);
      setEditingSourceModels(Array.isArray(provider?.models) ? provider.models : [card.name]);
      setModelNameInput(card.name);
      setModelDescriptionInput(provider?.description ?? card.description ?? '');
      setModelDisplayNameInput(provider?.displayName ?? '');
      setModelIconInput(provider?.icon?.trim() || card.icon?.trim() || EMPTY_MODEL_ICON_DATA_URL);
      setShowCreateModelModal(true);
    } catch (error) {
      setCreateModelError(error instanceof Error ? error.message : String(error));
    } finally {
      setEditModelBusy(false);
    }
  };

  const handleCreateModel = async () => {
    if (!canConfirmCreateModel || createModelBusy) return;
    setCreateModelError(null);
    setCreateModelBusy(true);
    try {
      const headers = parseHeadersJson(modelHeadersInput);
      const description = modelDescriptionInput.trim();
      const displayName = modelDisplayNameInput.trim();
      const icon = modelIconInput.trim();
      const projectPath = resolveProjectPathForPayload();
      let method: 'POST' | 'PUT' = 'POST';
      let url = '/api/model-config-profiles';
      let payload: Record<string, unknown>;

      if (editingSourceId) {
        method = 'PUT';
        url = `/api/model-config-profiles/${encodeURIComponent(editingSourceId)}`;
        const nextModel = modelNameInput.trim();
        const previousModel = editingOriginalModelName?.trim() || '';
        const sourceModels = editingSourceModels.length > 0 ? [...editingSourceModels] : previousModel ? [previousModel] : [];
        const replacedModels = sourceModels.map((name) => (name === previousModel ? nextModel : name));
        const mergedModels = Array.from(
          new Set((replacedModels.length > 0 ? replacedModels : [nextModel]).map((name) => name.trim()).filter(Boolean)),
        );
        payload = {
          ...(displayName ? { displayName } : {}),
          description: description || null,
          icon: icon || null,
          ...(modelUrlInput.trim() ? { baseUrl: modelUrlInput.trim() } : {}),
          ...(modelApiKeyInput.trim() ? { apiKey: modelApiKeyInput.trim() } : {}),
          ...(headers ? { headers } : {}),
          models: mergedModels,
          ...(projectPath ? { projectPath } : {}),
        };
      } else {
        payload = {
          sourceId: generateModelConfigSourceId(),
          ...(displayName ? { displayName } : {}),
          ...(description ? { description } : {}),
          ...(icon ? { icon } : {}),
          baseUrl: modelUrlInput.trim(),
          apiKey: modelApiKeyInput.trim(),
          ...(headers ? { headers } : {}),
          models: [modelNameInput.trim()],
          ...(projectPath ? { projectPath } : {}),
        };
      }

      const res = await apiFetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `请求失败 (${res.status})`);
      }
      resetCreateModelForm();
      closeCreateModelModal();
      await fetchModels();
    } catch (error) {
      setCreateModelError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreateModelBusy(false);
    }
  };

  const handleModelIconUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MODEL_ICON_MAX_BYTES) {
      setCreateModelError('图标文件大小不能超过 200KB');
      event.target.value = '';
      return;
    }

    setCreateModelError(null);
    setModelIconUploading(true);
    try {
      const uploaded = await uploadAvatarAsset(file);
      setModelIconInput(uploaded);
    } catch (error) {
      setCreateModelError(error instanceof Error ? error.message : '图标上传失败');
    } finally {
      setModelIconUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="ui-page-shell">
      <div className="ui-page-header">
        <h1 className="ui-page-title">{MODEL_TITLE}</h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 pb-2">
          <section className="flex justify-between gap-2">
            <div className="relative flex-1 mr-2">
              <input
                type="search"
                aria-label="搜索模型"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={SEARCH_PLACEHOLDER}
                className="ui-field h-[28px] min-h-[28px] w-full px-3 py-0 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openHub('provider-profiles')}
                className="hidden rounded-[16px] border border-[#DCE1E8] px-3 py-1.5 text-[12px] font-medium text-[#5F6775] transition-colors hover:bg-[#F7F8FA]"
              >
                ACP / 账号配置
              </button>
              <button
                type="button"
                onClick={() => setShowAddModelModal(true)}
                className="hidden rounded-[16px] bg-[#101317] px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#262C34]"
              >
                {ADD_MODEL}
              </button>
              <button
                type="button"
                onClick={handleOpenCreateModelModal}
                data-testid="models-open-create-model-modal"
                className="ui-button-primary"
              >
                {CREATE_MODEL_LABEL}
              </button>
            </div>
          </section>

          {loading && <p className="py-10 text-center text-sm text-[var(--text-muted)]">{LOADING_TEXT}</p>}

          {showEmptyData && <p className="py-10 text-center text-sm text-[var(--text-muted)]">{EMPTY_TEXT}</p>}

          {showNoResults && (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-[var(--text-secondary)]">{NO_RESULTS_TEXT}</p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">{NO_RESULTS_HINT}</p>
            </div>
          )}

          {showGroups &&
            groupedCards.map((group) => (
              <section key={group.key} className="space-y-3">
                <h3
                  className="text-[14px] font-semibold text-[var(--text-primary)]"
                  style={{ marginBlock: '24px' }}
                >
                  {group.label} ({group.items.length})
                </h3>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((card) => (
                    <article key={card.id} className="ui-card group flex min-h-[194px] flex-col gap-4 p-5">
                      <div>
                        <div className="flex items-start gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {card.icon ? (
                            <img
                              src={card.icon}
                              alt={`${card.name} icon`}
                              width={48}
                              height={48}
                              className="h-12 w-12 shrink-0 rounded-[var(--radius-lg)] border border-[var(--border-default)] object-cover p-1.5"
                              data-testid={`model-card-icon-${card.id}`}
                            />
                          ) : (
                            <NameInitialIcon name={card.name} dataTestId={`model-card-icon-${card.id}`} />
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="truncate text-[var(--font-size-xl)] font-semibold text-[var(--text-primary)]">
                                {card.name}
                              </h4>
                            </div>
                            {card.labels.length > 0 ? (
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {card.labels.map((label, index) => (
                                  <span key={`${card.id}-label-${label}-${index}`} className="ui-badge-muted">
                                    {label}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <p
                        className="text-[13px] leading-6 text-[var(--text-secondary)] line-clamp-2 overflow-hidden"
                        title={card.description}
                      >
                        {card.description}
                      </p>

                      <div className="mt-auto flex items-end justify-between gap-3">
                        <div className="min-h-5 text-xs leading-5">
                          {card.protocol !== 'huawei_maas' ? (
                            <div className="relative">
                              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] transition-opacity duration-200 group-hover:opacity-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={VENDOR_ICON}
                                  alt={`${card.developer} icon`}
                                  width={16}
                                  height={16}
                                  className="h-4 w-4 rounded-sm object-cover"
                                />
                                <span>{card.developer}</span>
                              </span>
                              <div className="absolute left-0 top-0 flex items-center whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                <button
                                  type="button"
                                  data-testid={`model-card-edit-${card.id}`}
                                  disabled={editModelBusy}
                                  onClick={() => {
                                    void handleOpenEditModelModal(card);
                                  }}
                                  className="whitespace-nowrap text-[14px] font-bold text-[var(--text-accent)] hover:underline"
                                >
                                  编辑
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingModelId === card.id}
                                  onClick={() => {
                                    void handleDeleteModel(card.id, card.name);
                                  }}
                                  data-testid={`model-card-delete-${card.id}`}
                                  className="ml-3 whitespace-nowrap text-[14px] font-bold text-[var(--text-accent)] hover:underline disabled:opacity-50"
                                >
                                  {deletingModelId === card.id ? '删除中...' : DELETE_MODEL_LABEL}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={VENDOR_ICON}
                                alt={`${card.developer} icon`}
                                width={16}
                                height={16}
                                className="h-4 w-4 rounded-sm object-cover"
                              />
                              <span>{card.developer}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
        </div>
      </div>

      {showCreateModelModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          data-testid="models-create-model-modal"
        >
          <div className="flex w-[500px] max-h-[calc(100vh-4rem)] flex-col gap-5 overflow-hidden rounded-[8px] border border-[#E5EAF0] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-bold">{isEditMode ? '编辑模型' : CREATE_MODEL_LABEL}</h3>
              <button
                type="button"
                onClick={closeCreateModelModal}
                aria-label="close"
                className="flex h-6 w-6 items-center justify-center rounded text-[#5F6775] transition-colors hover:bg-[#F7F8FA]"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div className="space-y-1">
                <p className="text-[12px] leading-[18px] text-[#2E3440]">{'模型名称'}</p>
                <input
                  data-testid="models-create-model-name-input"
                  value={modelNameInput}
                  onChange={(event) => setModelNameInput(event.target.value)}
                  placeholder={'请输入模型名称'}
                  className="ui-form-focus w-full rounded-[6px] border border-[rgb(194,194,194)] px-3 py-[5px] text-sm"
                  style={{ height: '28px' }}
                  required
                />
              </div>
              <div className="space-y-2.5">
                <div className="text-[12px] text-[var(--text-primary)]">模型描述（可选）</div>
                <div className="ui-field ui-form-focus-within relative bg-[var(--surface-panel)] pl-4 pt-2 pr-1">
                  <textarea
                    data-testid="models-create-model-description-textarea"
                    value={modelDescriptionInput}
                    onChange={(event) => setModelDescriptionInput(event.target.value)}
                    placeholder="请输入描述"
                    maxLength={500}
                    className="pb-3 h-[60px] min-h-[60px] w-full resize-y border-0 bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                  <div className="pointer-events-none absolute bottom-0 right-4 text-[12px] text-[var(--text-muted)]">
                    {modelDescriptionInput.length}/500
                  </div>
                </div>
              </div>
              <div className="hidden space-y-1">
                <p className="text-[12px] leading-[18px] text-[#2E3440]">{'模型展示名称'}</p>
                <input
                  data-testid="models-create-model-display-name-input"
                  value={modelDisplayNameInput}
                  onChange={(event) => setModelDisplayNameInput(event.target.value)}
                  placeholder={'请输入模型展示名称'}
                  className="ui-form-focus w-full rounded-[6px] border border-[rgb(194,194,194)] px-3 py-[5px] text-sm"
                  style={{ height: '28px' }}
                  required
                />
              </div>
              <div className="space-y-2.5">
                <div className="text-[12px] text-[var(--text-primary)]">图标（可选）</div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Upload model icon"
                    onClick={() => modelIconFileInputRef.current?.click()}
                    className="group relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-transparent transition hover:border-[var(--border-accent)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={modelIconInput} alt="Model icon preview" className="h-full w-full object-cover" />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 text-[12px] font-semibold text-[#3B82F6] opacity-0 transition group-hover:opacity-100">
                      上传
                    </span>
                  </button>
                  <input
                    ref={modelIconFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/jpg"
                    onChange={handleModelIconUpload}
                    className="hidden"
                    data-testid="models-create-model-icon-file-input"
                  />
                  <div className="h-11 pt-[22px]">
                    <div aria-hidden="true" className="h-[16px] w-px bg-[var(--border-default)]" />
                  </div>
                  <div className="h-11 pt-[16px]">
                    <button
                      type="button"
                      aria-label="Random model icon"
                      onClick={() => {
                        const nextVariant = Math.floor(Math.random() * 10_000);
                        setModelIconInput(generateModelIconDataUrl(modelNameInput, nextVariant));
                      }}
                      className="ui-button-secondary h-[28px] w-[28px] min-h-[28px] min-w-[28px] rounded-[var(--radius-sm)] p-0"
                    >
                      <SparklesIcon />
                    </button>
                  </div>
                </div>
                <div className="text-[12px] text-[var(--text-muted)]">
                  {modelIconUploading ? '图标上传中...' : '支持上传 png、jpeg、gif、jpg 格式图片，限制 200kb 内'}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[12px] leading-[18px] text-[#2E3440]">{'访问URL'}</p>
                <input
                  data-testid="models-create-model-url-input"
                  name="cc_model_base_url"
                  value={modelUrlInput}
                  onChange={(event) => setModelUrlInput(event.target.value)}
                  placeholder={'请输入访问URL'}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="ui-form-focus w-full rounded-[6px] border border-[rgb(194,194,194)] px-3 py-[5px] text-sm"
                  style={{ height: '28px' }}
                  required
                />
              </div>
              <div className="space-y-1">
                <p className="text-[12px] leading-[18px] text-[#2E3440]">{'API Key'}</p>
                <input
                  data-testid="models-create-model-api-key-input"
                  name="cc_model_api_key"
                  type="password"
                  value={modelApiKeyInput}
                  onChange={(event) => setModelApiKeyInput(event.target.value)}
                  placeholder={'请输入API Key'}
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="ui-form-focus w-full rounded-[6px] border border-[rgb(194,194,194)] px-3 py-[5px] text-sm"
                  style={{ height: '28px' }}
                  required
                />
              </div>
              <div className="space-y-1">
                <p className="text-[12px] leading-[18px] text-[#2E3440]">{'请求头（可选）'}</p>
                <textarea
                  data-testid="models-create-model-headers-textarea"
                  value={modelHeadersInput}
                  onChange={(event) => setModelHeadersInput(event.target.value)}
                  rows={4}
                  placeholder={'可选请求头(JSON)，如 {"X-App-Id":"cat-cafe"}'}
                  className="ui-form-focus w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
                />
              </div>
              {createModelError ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-500">{createModelError}</p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateModelModal}
                className="ui-button-secondary"
              >
                {CREATE_MODEL_CANCEL_LABEL}
              </button>
              <button
                type="button"
                disabled={!canConfirmCreateModel || createModelBusy || modelIconUploading || editModelBusy}
                onClick={handleCreateModel}
                data-testid="models-create-model-confirm"
                className="ui-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createModelBusy ? '创建中...' : CREATE_MODEL_CONFIRM_LABEL}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModelModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          data-testid="models-add-model-modal"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#2E3440]">{ADD_MODEL}</h3>
              <button
                type="button"
                onClick={() => {
                  setCreateError(null);
                  setShowAddModelModal(false);
                }}
                className="rounded-lg border border-[#DCE1E8] px-3 py-1.5 text-xs font-medium text-[#5F6775] transition-colors hover:bg-[#F7F8FA]"
              >
                关闭
              </button>
            </div>
            <ModelsCreateModelConfigSource
              projectPath={currentProjectPath && currentProjectPath !== 'default' ? currentProjectPath : null}
              error={createError}
              onError={setCreateError}
              onCreated={async () => {
                setCreateError(null);
                await fetchModels();
                setShowAddModelModal(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function parseHeadersJson(value: string): Record<string, string> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Headers 必须是 JSON 对象');
  }
  const entries = Object.entries(parsed).map(([key, rawValue]) => {
    const normalizedKey = key.trim();
    const normalizedValue = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!normalizedKey || !normalizedValue) {
      throw new Error('Headers 的 key 和 value 都必须是非空字符串');
    }
    return [normalizedKey, normalizedValue] as const;
  });
  return Object.fromEntries(entries);
}

function generateModelConfigSourceId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (typeof uuid === 'string' && uuid.trim()) {
    return uuid.replace(/-/g, '').slice(0, 8);
  }
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
}

function ModelsCreateModelConfigSource({
  projectPath,
  error,
  onError,
  onCreated,
}: {
  projectPath: string | null;
  error: string | null;
  onError: (value: string | null) => void;
  onCreated: () => Promise<void>;
}) {
  const [sourceId, setSourceId] = useState(() => generateModelConfigSourceId());
  const [displayName, setDisplayName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const canCreate =
    displayName.trim().length > 0 && baseUrl.trim().length > 0 && apiKey.trim().length > 0 && models.length > 0;

  const reset = () => {
    setSourceId(generateModelConfigSourceId());
    setDisplayName('');
    setBaseUrl('');
    setApiKey('');
    setHeadersText('');
    setModels([]);
  };

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-500">{error}</p> : null}
      <select
        value="openai"
        disabled
        aria-label="协议"
        className="w-full rounded border border-[#DCE2EB] bg-[#F7F8FA] px-3 py-2 text-sm text-[#5F6775]"
      >
        <option value="openai">OpenAI</option>
      </select>
      <input
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder="显示名称，如 My OpenAI Proxy"
        autoComplete="off"
        className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
      />
      <input
        value={baseUrl}
        onChange={(event) => setBaseUrl(event.target.value)}
        placeholder="Base URL，如 https://api.example.com/v1"
        autoComplete="off"
        className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
      />
      <input
        type="password"
        autoComplete="off"
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
        placeholder="API Key"
        className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
      />
      <textarea
        value={headersText}
        onChange={(event) => setHeadersText(event.target.value)}
        rows={4}
        placeholder={'可选请求头(JSON)，如 {"X-App-Id":"cat-cafe"}'}
        className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
      />
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[#6E7785]">可用模型 *</p>
        <TagEditor
          tags={models}
          tone="purple"
          addLabel="+ 添加模型"
          placeholder="输入模型名，如 gpt-4o-mini"
          emptyLabel="(至少添加 1 个模型)"
          onChange={setModels}
          minCount={0}
        />
      </div>
      <button
        type="button"
        disabled={busy || !canCreate}
        onClick={async () => {
          onError(null);
          setBusy(true);
          try {
            const headers = parseHeadersJson(headersText);
            const res = await apiFetch('/api/model-config-profiles', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                ...(projectPath ? { projectPath } : {}),
                sourceId: sourceId.trim(),
                displayName: displayName.trim(),
                baseUrl: baseUrl.trim(),
                apiKey: apiKey.trim(),
                ...(headers ? { headers } : {}),
                models,
              }),
            });
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
              throw new Error(body.error ?? `请求失败 (${res.status})`);
            }
            reset();
            await onCreated();
          } catch (createError) {
            onError(createError instanceof Error ? createError.message : String(createError));
          } finally {
            setBusy(false);
          }
        }}
        className="rounded bg-[#111418] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2A3038] disabled:opacity-50"
      >
        {busy ? '创建中...' : '创建'}
      </button>
    </div>
  );
}
