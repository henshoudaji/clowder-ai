'use client';

import { type ChangeEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAvailableClients } from '@/hooks/useAvailableClients';
import type { CatData } from '@/hooks/useCatData';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import { getIsSkipAuth } from '@/utils/userId';
import { AgentManagementIcon } from './AgentManagementIcon';
import { uploadAvatarAsset } from './hub-cat-editor.client';
import {
  type ClientValue,
  CLIENT_OPTIONS as HUB_CLIENT_OPTIONS,
  type HubCatEditorDraft,
  type HubCatEditorFormState,
  initialState,
} from './hub-cat-editor.model';
import { buildCatPayload } from './hub-cat-editor.payload';
import {
  type DraftModelOption,
  type DraftModelOptionGroup,
  ModelSelectDropdownDraft,
  ModelSelectTriggerIcon,
  ModelSelectValueDraft,
} from './ModelSelectDropdownDraft';

interface CreateAgentModalDraftProps {
  open: boolean;
  cat?: CatData | null;
  name?: string;
  description?: string;
  selectedModelId?: string | null;
  models?: DraftModelOption[];
  draft?: HubCatEditorDraft | null;
  title?: string;
  onClose?: () => void;
  onSaved?: () => Promise<void> | void;
}

type ModelGroupId = 'huawei-maas' | 'third-party';

interface CreateModelOption extends DraftModelOption {
  accountRef: string;
  client: ClientValue;
  model: string;
  modelLabel: string;
  groupId: ModelGroupId;
}

interface MaaSModelResponseItem {
  id?: string | number;
  name?: string;
  provider?: string;
  accountRef?: string;
  protocol?: string;
  icon?: string;
  logo?: string;
  image?: string;
  avatar?: string;
  enabled?: boolean;
  kind?: string;
  [key: string]: unknown;
}

interface SelectionHint {
  model: string | null;
  accountRef: string | null;
}

interface ModelMenuPosition {
  top: number;
  left: number;
  width: number;
}

const MODEL_MENU_MAX_HEIGHT = 335;
const MODEL_MENU_OFFSET = 8;
const HUAWEI_GROUP_LABEL = 'Huawei MaaS';
const THIRD_PARTY_GROUP_LABEL = '第三方模型';
const RELAYCLAW_CLIENT: ClientValue = 'relayclaw';
const KNOWN_CLIENT_VALUES = new Set<ClientValue>([
  'anthropic',
  'openai',
  'google',
  'dare',
  'opencode',
  'relayclaw',
  'antigravity',
  'acp',
]);

// 预设头像列表
const PRESET_AVATARS = [
  '/avatars/agent-avatar-1.png',
  '/avatars/agent-avatar-2.png',
  '/avatars/agent-avatar-3.png',
  '/avatars/agent-avatar-4.png',
  '/avatars/agent-avatar-5.png',
  '/avatars/agent-avatar-6.png',
  '/avatars/agent-avatar-7.png',
  '/avatars/agent-avatar-8.png',
  '/avatars/agent-avatar-9.png',
];

function CloseIcon() {
  return <AgentManagementIcon name="close" className="h-4 w-4" />;
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

function autoSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, '')
    .slice(0, 40);
}

function generateRandomCatId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `cat-${timestamp}${random}`.slice(0, 64);
}

/**
 * 从预设头像中随机选择一个
 */
function getRandomPresetAvatar(): string {
  const randomIndex = Math.floor(Math.random() * PRESET_AVATARS.length);
  return PRESET_AVATARS[randomIndex];
}

function buildProjectScopedUrl(path: string, projectPath: string | null | undefined): string {
  if (!projectPath || projectPath === 'default') return path;
  const query = new URLSearchParams({ projectPath });
  return `${path}?${query.toString()}`;
}

function pickStringField(item: Record<string, unknown>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const value = item[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function avatarSeed(name: string): string {
  const normalized = name.trim() || 'BOT';
  let hash = 0;
  for (const char of normalized) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return `hsl(${hash} 72% 62%)`;
}

function buildGeneratedAvatarDataUrl(name: string): string {
  const label = (name.trim().slice(0, 1) || '智').toUpperCase();
  const color = avatarSeed(name);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${color}" />
          <stop offset="100%" stop-color="#8AA4FF" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="48" fill="url(#g)" />
      <circle cx="48" cy="48" r="38" fill="rgba(255,255,255,0.18)" />
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="700" fill="#FFFFFF">${label}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function resolveInitialAvatar(cat: CatData | null): string {
  return cat?.avatar?.trim() ?? '';
}

function parseModelIdSelection(value: string | null): SelectionHint {
  if (!value?.trim()) return { model: null, accountRef: null };
  const trimmed = value.trim();
  const parts = trimmed.split('::');
  if (parts.length >= 2) {
    return {
      accountRef: parts[0]?.trim() || null,
      model: parts.slice(1).join('::').trim() || null,
    };
  }
  return { model: trimmed, accountRef: null };
}

function resolveSelectionHint(
  cat: CatData | null,
  draft: HubCatEditorDraft | null,
  selectedModelId: string | null,
): SelectionHint {
  const parsed = parseModelIdSelection(selectedModelId);
  return {
    model: parsed.model ?? draft?.defaultModel ?? cat?.defaultModel ?? null,
    accountRef:
      parsed.accountRef ??
      draft?.accountRef ??
      draft?.providerProfileId ??
      cat?.accountRef ??
      cat?.providerProfileId ??
      null,
  };
}

function parseAccountRefFromModelItem(item: MaaSModelResponseItem): string | null {
  if (typeof item.accountRef === 'string' && item.accountRef.trim().length > 0) {
    return item.accountRef.trim();
  }
  if (item.provider === HUAWEI_GROUP_LABEL) return 'huawei-maas';
  const rawId = typeof item.id === 'string' ? item.id.trim() : '';
  if (!rawId) return null;
  if (rawId.startsWith('model_config:')) {
    const rest = rawId.slice('model_config:'.length);
    const splitIndex = rest.indexOf(':');
    return splitIndex >= 0 ? rest.slice(0, splitIndex) : null;
  }
  return null;
}

function parseModelNameFromModelItemId(rawId: string, accountRef: string, fallbackName: string): string {
  if (!rawId.startsWith('model_config:')) return fallbackName;
  const prefix = `model_config:${accountRef}:`;
  if (!rawId.startsWith(prefix)) return fallbackName;
  return rawId.slice(prefix.length) || fallbackName;
}

function toModelOption(item: MaaSModelResponseItem): CreateModelOption | null {
  if (item.enabled === false) return null;
  const normalized = item as Record<string, unknown>;
  const modelLabel = pickStringField(normalized, ['name']);
  const accountRef = parseAccountRefFromModelItem(item);
  if (!modelLabel || !accountRef) return null;

  const providerLabel = pickStringField(normalized, ['provider']) ?? THIRD_PARTY_GROUP_LABEL;
  const protocol = pickStringField(normalized, ['protocol']);
  const isHuawei = accountRef === 'huawei-maas' || protocol === 'huawei_maas' || providerLabel === HUAWEI_GROUP_LABEL;
  const groupId: ModelGroupId = isHuawei ? 'huawei-maas' : 'third-party';
  const rawId =
    typeof item.id === 'string' && item.id.trim().length > 0 ? item.id.trim() : `${accountRef}::${modelLabel}`;
  const model = parseModelNameFromModelItemId(rawId, accountRef, modelLabel);

  return {
    id: rawId,
    name: modelLabel,
    icon: pickStringField(normalized, ['icon', 'logo', 'image', 'avatar']),
    providerGroup: providerLabel,
    accountRef,
    client: RELAYCLAW_CLIENT,
    model,
    modelLabel,
    groupId,
  };
}

function buildFallbackSelectedOption(selectionHint: SelectionHint): CreateModelOption | null {
  if (!selectionHint.model || !selectionHint.accountRef) return null;
  const isHuawei = selectionHint.accountRef === 'huawei-maas';
  return {
    id: `${selectionHint.accountRef}::${selectionHint.model}`,
    name: selectionHint.model,
    providerGroup: isHuawei ? HUAWEI_GROUP_LABEL : THIRD_PARTY_GROUP_LABEL,
    accountRef: selectionHint.accountRef,
    client: RELAYCLAW_CLIENT,
    model: selectionHint.model,
    modelLabel: selectionHint.model,
    groupId: isHuawei ? 'huawei-maas' : 'third-party',
  };
}

function groupModelOptions(items: CreateModelOption[]): DraftModelOptionGroup[] {
  const huaweiItems = items.filter((item) => item.groupId === 'huawei-maas');
  const thirdPartyItems = items.filter((item) => item.groupId === 'third-party');
  const groups: DraftModelOptionGroup[] = [];

  if (huaweiItems.length > 0) {
    groups.push({ id: 'huawei-maas', label: HUAWEI_GROUP_LABEL, items: huaweiItems });
  }
  if (thirdPartyItems.length > 0) {
    groups.push({ id: 'third-party', label: THIRD_PARTY_GROUP_LABEL, items: thirdPartyItems });
  }

  return groups;
}

export function buildDefaultCreateForm(
  name: string,
  description: string,
  avatar: string,
  selectedClient: ClientValue,
  selectedModel: CreateModelOption | null,
): HubCatEditorFormState {
  const safeName = name.trim();
  const catId = generateRandomCatId();
  const mentionSeed = autoSlug(safeName) || catId;
  return {
    catId,
    name: safeName,
    displayName: safeName,
    nickname: '',
    avatar,
    colorPrimary: '#9B7EBD',
    colorSecondary: '#E8DFF5',
    mentionPatterns: `@${mentionSeed}`,
    roleDescription: description.trim() || '通用智能体助手',
    personality: '',
    teamStrengths: '',
    caution: '',
    strengths: '',
    client: selectedClient,
    accountRef: selectedModel?.accountRef ?? '',
    defaultModel: selectedModel?.model ?? '',
    commandArgs: '',
    cliConfigArgs: [],
    ocProviderName: '',
    embeddedAcpExecutablePath: '',
    embeddedAcpArgs: '',
    embeddedAcpCwd: '',
    embeddedAcpEnvText: '',
    sessionChain: 'true',
    maxPromptTokens: '',
    maxContextTokens: '',
    maxMessages: '',
    maxContentLengthPerMsg: '',
  };
}

function buildEditForm(
  cat: CatData,
  name: string,
  description: string,
  avatar: string,
  selectedClient: ClientValue,
  selectedModel: CreateModelOption | null,
): HubCatEditorFormState {
  const base = initialState(cat, null);
  const safeName = name.trim() || cat.name || cat.displayName;
  const mentionSeed = autoSlug(safeName) || cat.id;
  return {
    ...base,
    name: safeName,
    displayName: safeName,
    nickname: safeName,
    mentionPatterns: `@${mentionSeed}`,
    avatar,
    roleDescription: description.trim() || base.roleDescription,
    client: selectedClient,
    accountRef: selectedModel?.accountRef ?? base.accountRef,
    defaultModel: selectedModel?.model ?? base.defaultModel,
    ocProviderName: '',
  };
}

export function CreateAgentModalDraft({
  open,
  cat = null,
  name = 'BOT',
  description = '',
  selectedModelId = null,
  draft = null,
  title,
  onClose,
  onSaved,
}: CreateAgentModalDraftProps) {
  const [isSkipAuth, setIsSkipAuth] = useState(false);
  const { clients: detectedClients, clientLabels } = useAvailableClients();
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description);
  const [draftAvatar, setDraftAvatar] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientValue>(RELAYCLAW_CLIENT);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [clientOpenAbove, setClientOpenAbove] = useState(false);
  const [clientMenuPosition, setClientMenuPosition] = useState<ModelMenuPosition | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const [modelMenuPosition, setModelMenuPosition] = useState<ModelMenuPosition | null>(null);
  const [marketplaceModels, setMarketplaceModels] = useState<MaaSModelResponseItem[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const clientMenuRef = useRef<HTMLDivElement | null>(null);
  const clientTriggerRef = useRef<HTMLButtonElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const currentProjectPath = useChatStore((state) => state.currentProjectPath);
  const clientOptions = useMemo(() => {
    const normalized = detectedClients
      .filter((client) => KNOWN_CLIENT_VALUES.has(client.id as ClientValue))
      .map((client) => ({
        value: client.id as ClientValue,
        label: clientLabels[client.id] ?? client.label,
      }));
    return normalized.length > 0 ? normalized : HUB_CLIENT_OPTIONS;
  }, [clientLabels, detectedClients]);

  const selectionHint = useMemo(() => resolveSelectionHint(cat, draft, selectedModelId), [cat, draft, selectedModelId]);

  useEffect(() => {
    setIsSkipAuth(getIsSkipAuth());
  }, []);

  useEffect(() => {
    if (!open) return;
    setDraftName(name || cat?.name || cat?.displayName || 'BOT');
    setDraftDescription(description || cat?.roleDescription || '');
    // 如果是新建智能体且没有头像，则随机选择一个预设头像；否则使用已有头像
    if (cat) {
      setDraftAvatar(resolveInitialAvatar(cat));
    } else {
      setDraftAvatar(getRandomPresetAvatar());
    }
    const incomingClient = (draft?.client ?? cat?.provider ?? RELAYCLAW_CLIENT) as ClientValue;
    if (isSkipAuth) {
      setSelectedClient(RELAYCLAW_CLIENT);
      setSelectedOptionId(null);
      setClientMenuOpen(false);
      setClientOpenAbove(false);
      setClientMenuPosition(null);
      setModelMenuOpen(false);
      setOpenAbove(false);
      setModelMenuPosition(null);
      setError(null);
      return;
    }
    const nextClient = HUB_CLIENT_OPTIONS.some((option) => option.value === incomingClient)
      ? incomingClient
      : RELAYCLAW_CLIENT;
    setSelectedClient(nextClient);
    setSelectedOptionId(null);
    setClientMenuOpen(false);
    setClientOpenAbove(false);
    setClientMenuPosition(null);
    setModelMenuOpen(false);
    setOpenAbove(false);
    setModelMenuPosition(null);
    setError(null);
  }, [cat, description, draft?.client, isSkipAuth, name, open]);

  useEffect(() => {
    if (!open) return;
    if (clientOptions.some((option) => option.value === selectedClient)) return;
    setSelectedClient(clientOptions[0]?.value ?? RELAYCLAW_CLIENT);
  }, [clientOptions, open, selectedClient]);

  useEffect(() => {
    if (!modelMenuOpen && !clientMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (modelMenuRef.current?.contains(target) || modelTriggerRef.current?.contains(target)) return;
      if (clientMenuRef.current?.contains(target) || clientTriggerRef.current?.contains(target)) return;
      setModelMenuOpen(false);
      setClientMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (modelMenuOpen) {
        setModelMenuOpen(false);
        modelTriggerRef.current?.focus();
        return;
      }
      if (clientMenuOpen) {
        setClientMenuOpen(false);
        clientTriggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [clientMenuOpen, modelMenuOpen]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingModels(true);

    void (async () => {
      try {
        const response = await apiFetch(buildProjectScopedUrl('/api/maas-models', currentProjectPath));
        if (!response.ok) {
          throw new Error(`模型广场加载失败 (${response.status})`);
        }
        const body = (await response.json()) as { list?: MaaSModelResponseItem[]; models?: MaaSModelResponseItem[] };
        const source = Array.isArray(body.list) ? body.list : Array.isArray(body.models) ? body.models : [];
        if (!cancelled) {
          setMarketplaceModels(source);
        }
      } catch (err) {
        if (cancelled) return;
        setMarketplaceModels([]);
        setError(err instanceof Error ? err.message : '模型广场加载失败');
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentProjectPath, open]);

  const availableModels = useMemo(() => {
    const items = marketplaceModels
      .map((item) => toModelOption(item))
      .filter((item): item is CreateModelOption => item !== null);

    const deduped = new Map<string, CreateModelOption>();
    for (const item of items) {
      deduped.set(item.id, item);
    }
    return Array.from(deduped.values());
  }, [marketplaceModels]);

  const fallbackSelectedOption = useMemo(() => buildFallbackSelectedOption(selectionHint), [selectionHint]);

  const selectedModel = useMemo(() => {
    if (selectedOptionId) {
      const matchedById = availableModels.find((item) => item.id === selectedOptionId);
      if (matchedById) return matchedById;
    }

    if (selectionHint.accountRef && selectionHint.model) {
      const matchedByPair = availableModels.find(
        (item) => item.accountRef === selectionHint.accountRef && item.model === selectionHint.model,
      );
      if (matchedByPair) return matchedByPair;
    }

    if (selectionHint.model) {
      const matchedByModel = availableModels.find((item) => item.model === selectionHint.model);
      if (matchedByModel) return matchedByModel;
    }

    return fallbackSelectedOption ?? availableModels[0] ?? null;
  }, [availableModels, fallbackSelectedOption, selectedOptionId, selectionHint]);

  useEffect(() => {
    if (!open || !selectedModel) return;
    if (selectedOptionId === selectedModel.id) return;
    setSelectedOptionId(selectedModel.id);
  }, [open, selectedModel, selectedOptionId]);

  const modelGroups = useMemo(() => groupModelOptions(availableModels), [availableModels]);
  const selectedClientLabel = useMemo(
    () => clientOptions.find((option) => option.value === selectedClient)?.label ?? selectedClient,
    [clientOptions, selectedClient],
  );

  const updateClientMenuPosition = useCallback(() => {
    if (!clientMenuOpen || !clientTriggerRef.current) return;
    const rect = clientTriggerRef.current.getBoundingClientRect();
    const estimatedMenuHeight = clientMenuRef.current?.offsetHeight ?? Math.min(Math.max(clientOptions.length, 1) * 34 + 8, 220);
    const spaceBelow = window.innerHeight - rect.bottom;
    const nextOpenAbove = spaceBelow < estimatedMenuHeight + MODEL_MENU_OFFSET;
    setClientOpenAbove(nextOpenAbove);
    setClientMenuPosition({
      top: nextOpenAbove ? rect.top - MODEL_MENU_OFFSET : rect.bottom + MODEL_MENU_OFFSET,
      left: rect.left,
      width: rect.width,
    });
  }, [clientMenuOpen, clientOptions.length]);

  const updateModelMenuPosition = useCallback(() => {
    if (!modelMenuOpen || !modelTriggerRef.current) return;
    const itemCount = modelGroups.reduce((total, group) => total + group.items.length, 0);
    const groupCount = modelGroups.length;
    const rect = modelTriggerRef.current.getBoundingClientRect();
    const estimatedMenuHeight =
      modelMenuRef.current?.offsetHeight ??
      Math.min(Math.max(itemCount, 1) * 36 + groupCount * 22 + 54, MODEL_MENU_MAX_HEIGHT);
    const spaceBelow = window.innerHeight - rect.bottom;
    const nextOpenAbove = spaceBelow < estimatedMenuHeight + MODEL_MENU_OFFSET;
    setOpenAbove(nextOpenAbove);
    setModelMenuPosition({
      top: nextOpenAbove ? rect.top - MODEL_MENU_OFFSET : rect.bottom + MODEL_MENU_OFFSET,
      left: rect.left,
      width: rect.width,
    });
  }, [modelGroups, modelMenuOpen]);

  useLayoutEffect(() => {
    if (!clientMenuOpen) {
      setClientMenuPosition(null);
      return;
    }
    updateClientMenuPosition();
  }, [clientMenuOpen, updateClientMenuPosition]);

  useLayoutEffect(() => {
    if (!modelMenuOpen) {
      setModelMenuPosition(null);
      return;
    }
    updateModelMenuPosition();
  }, [modelMenuOpen, updateModelMenuPosition]);

  useEffect(() => {
    if (!clientMenuOpen) return;

    const handleViewportChange = () => updateClientMenuPosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [clientMenuOpen, updateClientMenuPosition]);

  useEffect(() => {
    if (!modelMenuOpen) return;

    const handleViewportChange = () => updateModelMenuPosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [modelMenuOpen, updateModelMenuPosition]);

  const modalTitle = title ?? (cat ? '编辑智能体' : '创建智能体');
  const primaryButtonText = saving ? (cat ? '保存中...' : '创建中...') : cat ? '保存' : '确定';
  // 优先使用 draftAvatar，如果为空则使用生成的默认头像（用于显示名称首字母）
  const displayAvatar = draftAvatar || buildGeneratedAvatarDataUrl(draftName);

  if (!open) return null;

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    setError(null);
    try {
      setDraftAvatar(await uploadAvatarAsset(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : '头像上传失败');
    } finally {
      setUploadingAvatar(false);
      event.target.value = '';
    }
  };

  const handleSave = async () => {
    const trimmedName = draftName.trim();
    if (!trimmedName) {
      setError('请输入名称');
      return;
    }

    if (!selectedModel) {
      setError('请选择模型');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const formState = cat
        ? buildEditForm(cat, trimmedName, draftDescription, draftAvatar, selectedClient, selectedModel)
        : buildDefaultCreateForm(trimmedName, draftDescription, draftAvatar, selectedClient, selectedModel);
      const payload = buildCatPayload(formState, cat);
      const response = await apiFetch(cat ? `/api/cats/${cat.id}` : '/api/cats', {
        method: cat ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        setError((body.error as string) ?? `${cat ? '保存' : '创建'}失败 (${response.status})`);
        return;
      }

      await onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : cat ? '保存失败' : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6 py-8">
      <div
        className="ui-panel relative flex w-[550px] max-h-[calc(100vh-4rem)] flex-col gap-4 overflow-hidden rounded-[8px] bg-[var(--surface-panel)] p-6 shadow-[0_18px_42px_rgba(0,0,0,0.14)]"
        data-testid="create-agent-modal"
      >
        <div data-testid="create-agent-modal-header" className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-[var(--text-primary)]">{modalTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="flex h-6 w-6 items-center justify-center rounded text-[#5F6775] transition-colors hover:bg-[#F7F8FA]"
          >
            <CloseIcon />
          </button>
        </div>

        <div
          data-testid="create-agent-modal-body"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto text-[12px]"
        >
          <div data-testid="create-agent-modal-form" className="flex flex-col gap-4">
            <div className="space-y-2.5">
              <div className="text-[12px] text-[var(--text-primary)]">名称</div>
              <input
                aria-label="Name"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                className="ui-field h-[28px] w-full rounded-[6px] px-4 text-[12px]"
              />
            </div>

            <div className="space-y-2.5">
              <div className="text-[12px] text-[var(--text-primary)]">描述（可选）</div>
              <div className="ui-field ui-form-focus-within relative bg-[var(--surface-panel)] pl-4 pt-2 pr-1">
                <textarea
                  aria-label="Description"
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  placeholder="请输入描述"
                  maxLength={1000}
                  className="pb-3 h-[60px] min-h-[60px] w-full resize-y border-0 bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                />
                <div className="pointer-events-none absolute bottom-0 right-4 text-[12px] text-[var(--text-muted)]">
                  {draftDescription.length}/1000
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="text-[12px] text-[var(--text-primary)]">图标</div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Upload avatar"
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-transparent transition hover:border-[var(--border-accent)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={displayAvatar} alt="Avatar preview" className="h-full w-full object-cover" />
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 text-[12px] font-semibold text-[#3B82F6] opacity-0 transition group-hover:opacity-100">
                    上传
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  aria-label="Avatar file input"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/jpg"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <div className="h-11 pt-[22px]">
                  <div aria-hidden="true" className="h-[16px] w-px bg-[var(--border-default)]" />
                </div>
                <div  className="h-11 pt-[16px]">
                              <button
                  type="button"
                  aria-label="Random preset avatar"
                  onClick={() => setDraftAvatar(getRandomPresetAvatar())}
                  title="换一换"
                  className="ui-button-secondary h-[28px] w-[28px] min-h-[28px] min-w-[28px] rounded-[var(--radius-sm)] p-0"
                >
                  <SparklesIcon />
                </button>
                </div>
    
              </div>
              <div className="text-[12px] text-[var(--text-muted)]">
                {uploadingAvatar ? '头像上传中...' : '支持上传 png、jpeg、gif、jpg 格式图片，限制 200kb 内'}
              </div>
            </div>

            {true ? (
              <div className="space-y-2.5">
                <div className="text-[12px] text-[var(--text-primary)]">Agent 客户端</div>
                <button
                  ref={clientTriggerRef}
                  type="button"
                  aria-label="Client"
                  aria-haspopup="listbox"
                  aria-expanded={clientMenuOpen}
                  onClick={() => {
                    setModelMenuOpen(false);
                    setClientMenuOpen((current) => !current);
                  }}
                  className="ui-field flex h-[28px] w-full items-center justify-between rounded-[6px] bg-[var(--surface-panel)] px-[10px] text-left text-[12px]"
                >
                  <span className="truncate text-[var(--text-primary)]">{selectedClientLabel}</span>
                  <ModelSelectTriggerIcon />
                </button>

                {clientMenuOpen && clientMenuPosition
                  ? createPortal(
                      <div
                        ref={clientMenuRef}
                        className="fixed z-[70]"
                        style={{
                          top: clientMenuPosition.top,
                          left: clientMenuPosition.left,
                          width: clientMenuPosition.width,
                          transform: clientOpenAbove ? 'translateY(-100%)' : undefined,
                        }}
                      >
                        <div className="ui-panel flex max-h-[220px] w-full flex-col overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-panel)] shadow-[0_10px_24px_rgba(0,0,0,0.09)]">
                          <div role="listbox" className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1">
                            {clientOptions.map((option) => {
                              const isSelected = option.value === selectedClient;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  role="option"
                                  aria-selected={isSelected}
                                  onClick={() => {
                                    setSelectedClient(option.value);
                                    setClientMenuOpen(false);
                                  }}
                                  className={`flex min-h-[32px] w-full items-center px-3 text-left text-[12px] transition-colors ${
                                    isSelected
                                      ? 'bg-[var(--surface-selected)] font-medium text-[var(--text-accent)]'
                                      : 'text-[var(--text-primary)] hover:bg-[rgb(245,245,245)]'
                                  }`}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>,
                      document.body,
                    )
                  : null}
              </div>
            ) : null}

            <div className="relative space-y-2.5">
              <div className="text-[12px] text-[var(--text-primary)]">模型</div>
              {availableModels.length > 0 || selectedModel ? (
                <>
                  <button
                    ref={modelTriggerRef}
                    type="button"
                    aria-label="Model"
                    aria-haspopup="listbox"
                    aria-expanded={modelMenuOpen}
                    onClick={() => setModelMenuOpen((current) => !current)}
                    className="ui-field flex h-[28px] w-full items-center justify-between rounded-[6px] bg-[var(--surface-panel)] px-[10px] text-left text-[12px]"
                  >
                    <ModelSelectValueDraft item={selectedModel} loading={loadingModels} />
                    <ModelSelectTriggerIcon />
                  </button>

                  {modelMenuOpen && modelMenuPosition
                    ? createPortal(
                        <div
                          ref={modelMenuRef}
                          className="fixed z-[70]"
                          style={{
                            top: modelMenuPosition.top,
                            left: modelMenuPosition.left,
                            width: modelMenuPosition.width,
                            transform: openAbove ? 'translateY(-100%)' : undefined,
                          }}
                        >
                          <ModelSelectDropdownDraft
                            groups={modelGroups}
                            selectedId={selectedModel?.id ?? selectedOptionId}
                            onSelect={(item) => {
                              setSelectedOptionId(item.id);
                              setModelMenuOpen(false);
                            }}
                          />
                        </div>,
                        document.body,
                      )
                    : null}
                </>
              ) : (
                <div className="ui-field flex h-[28px] w-full items-center rounded-[6px] px-4 text-[12px] text-[var(--text-muted)]">
                  {loadingModels ? '加载模型中...' : '暂无可用模型'}
                </div>
              )}
            </div>
          </div>
          {error ? (
            <div className="ui-status-error rounded-[var(--radius-md)] px-3 py-2 text-[12px]">{error}</div>
          ) : null}
        </div>

        <div data-testid="create-agent-modal-footer" className="flex shrink-0 justify-end gap-3">
          <button
            type="button"
            aria-label="Cancel"
            onClick={onClose}
            className="ui-button-secondary h-[32px] w-[96px] px-0 text-[14px]"
          >
            取消
          </button>
          <button
            type="button"
            aria-label="Create"
            onClick={handleSave}
            disabled={saving}
            className="ui-button-primary h-[32px] w-[96px] px-0 text-[14px] font-semibold disabled:opacity-50"
          >
            {primaryButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}
