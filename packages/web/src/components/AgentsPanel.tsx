'use client';

import { type SVGProps, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type CatData, useCatData } from '@/hooks/useCatData';
import { API_URL, apiFetch } from '@/utils/api-client';
import { AgentManagementIcon } from './AgentManagementIcon';
import { ConnectThirdPartyAgentModal } from './ConnectThirdPartyAgentModal';
import { CreateAgentModal } from './CreateAgentModal';
import { MarkdownContent } from './MarkdownContent';
import { PromptSelectionModal } from './PromptSelectionModal';
import { transform } from 'esbuild-wasm';

type AgentTabKey = 'persona' | 'collab' | 'skills';
type EditableTabKey = 'persona' | 'collab';
type PanelMode = 'preview' | 'edit';
type EditableDrafts = Record<EditableTabKey, string>;
type IconProps = { className?: string };
type IconComponent = (props: IconProps) => JSX.Element;
type ActionMenuPosition = { top: number; left: number };
type TemplateBubblePosition = { top: number; left: number; tailLeft: number };

type InspirationTemplate = {
  id: string;
  title: string;
  dexcription: string;
  content: string;
};

type TabDefinition = {
  id: AgentTabKey;
  label: string;
  icon: IconComponent;
  editable: boolean;
};

const EMPTY_EDITABLE_DRAFTS: EditableDrafts = {
  persona: '',
  collab: '',
};

const TEMPLATE_PAGE_SIZE = 4;
const ACTION_MENU_ITEM_CLASS =
  'flex h-8 w-full items-center gap-2 rounded-[6px] px-2.5 text-left text-[12px] font-medium transition text-black';
const ACTION_MENU_VIEWPORT_PADDING = 12;
const ACTION_MENU_OFFSET_Y = 8;
const ACTION_MENU_ALIGN_RIGHT_OFFSET = 24;
const ACTION_MENU_FALLBACK_WIDTH = 136;
const ACTION_MENU_FALLBACK_HEIGHT = 96;

const INSPIRATION_TEMPLATES: InspirationTemplate[] = [
  {
    id: 'customer-service',
    title: '专业客服助手',
    dexcription: '遵循服务规范，礼貌应答、流程引导、问题定位与转接支持，严格遵守业务边界。',
    content: `### 人格定义 (Persona)
- 身份：资深客服顾问，擅长复杂问题拆解与安抚沟通。
- 性格：耐心克制、语气专业、表达清晰。
- 边界：优先给流程和升级路径，不承诺超出权限范围的结果。

### 行为准则 (Behavior)
- 精准识别用户诉求与情绪波动，先安抚再给处理路径。
- 优先提供标准流程与升级建议，避免模糊表述。
- 回复中同步标注下一步动作和责任归属，方便继续跟进。`,
  },
  {
    id: 'content-creation',
    title: '内容创作助手',
    dexcription: '支持文案策写、标题优化、脚本创作与风格适配，结构清晰，表达自然。',
    content: `### 人格定义 (Persona)
- 身份：资深内容创作者，擅长短视频脚本、公众号与朋友圈文案。
- 性格：创意灵活、洞察强，适配多平台风格。
- 边界：只提供创作思路和文案优化，不涉及侵权内容。

### 行为准则 (Behavior)
- 先明确平台、受众、核心卖点与风格，再组织内容结构。
- 快速提供多版初稿，并标注亮点和适用场景。
- 根据反馈迭代修改，同时说明调整重点和原因。`,
  },
  {
    id: 'knowledge-answering',
    title: '知识解答专家',
    dexcription: '以严谨准确为原则，科普概念、拆解原理、解释规则，输出可信且有条理。',
    content: `### 人格定义 (Persona)
- 身份：知识顾问，擅长多源信息整合与严谨解释。
- 性格：理性克制、客观中立、注重依据。
- 边界：不制造未经验证的结论，需要时先补充上下文。

### 行为准则 (Behavior)
- 先确认问题边界和上下文，再给出结构化解释。
- 需要时补充适用范围、风险提醒和可执行建议。
- 输出以结论、依据、行动项三段式为主，便于快速吸收。`,
  },
  {
    id: 'work-efficiency',
    title: '职场效率助手',
    dexcription: '提供沟通话术、汇报提纲、流程梳理与决策辅助，帮助提升交付效率。',
    content: `### 人格定义 (Persona)
- 身份：项目协作教练，擅长流程梳理与任务推进。
- 性格：简洁务实、节奏明确、结果导向。
- 边界：优先提升沟通和推进效率，不替代最终业务判断。

### 行为准则 (Behavior)
- 优先沉淀行动项、责任人和时间节点。
- 必要时给出沟通模板、纪要模板和复盘建议。
- 遇到阻塞时先拆原因，再提供可落地的替代方案。`,
  },
  {
    id: 'project-management',
    title: '项目管理助手',
    dexcription: '帮助拆解目标、制定里程碑、推动协作与风险跟踪，保持推进节奏清晰。',
    content: `### 人格定义 (Persona)
- 身份：项目经理与交付协调者，擅长推进计划落地。
- 性格：稳健清晰、节奏明确、关注依赖关系。
- 边界：聚焦项目推进与协作管理，不替代业务 owner 决策。

### 行为准则 (Behavior)
- 先明确目标与边界，再拆解任务、识别风险并推动闭环。
- 围绕依赖关系和优先级安排里程碑与检查点。
- 产出默认带负责人、时间节点和跟踪建议。`,
  },
  {
    id: 'data-analysis',
    title: '数据分析助手',
    dexcription: '聚焦指标拆解、数据解读、洞察归纳与结论表达，适合业务分析场景。',
    content: `### 人格定义 (Persona)
- 身份：数据分析师，擅长从指标与样本中提炼业务洞察。
- 性格：严谨客观、表达简洁、重视证据。
- 边界：不在样本不足时输出确定性结论，会明确说明口径和限制。

### 行为准则 (Behavior)
- 先确认指标口径与样本范围，再给出分析过程。
- 输出结论时同步说明依据、异常点和建议动作。
- 默认补充图表建议、后续验证方向和数据缺口。`,
  },
];

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PersonaIcon(props: IconProps) {
  return <AgentManagementIcon name="persona" className={props.className} />;
}

function CollaborateIcon(props: IconProps) {
  return <AgentManagementIcon name="collab" className={props.className} />;
}

function TemplateIcon(props: IconProps) {
  return <AgentManagementIcon name="template" className={props.className} />;
}

function EditIcon(props: IconProps) {
  return <AgentManagementIcon name="edit" className={props.className} />;
}

function CloseIcon(props: IconProps) {
  return <AgentManagementIcon name="close" className={props.className} />;
}

function CheckIcon(props: IconProps) {
  return <AgentManagementIcon name="check" className={props.className} />;
}

function MoreVerticalIcon(props: IconProps) {
  return <AgentManagementIcon name="more" className={props.className} />;
}

function TrashIcon(props: IconProps) {
  return <AgentManagementIcon name="delete" className={props.className} />;
}

function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const AGENT_TABS: TabDefinition[] = [
  { id: 'persona', label: '灵魂配置', icon: PersonaIcon, editable: true },
  { id: 'collab', label: '协作配置', icon: CollaborateIcon, editable: true },
];

function isEditableTab(tab: AgentTabKey): tab is EditableTabKey {
  return tab === 'persona' || tab === 'collab';
}

function buildPersonaDraft(cat: CatData | null): string {
  return cat?.personality?.trim() ?? '';
}

function buildCollabDraft(cat: Pick<CatData, 'teamStrengths'> | null): string {
  return cat?.teamStrengths?.trim() ?? '';
}

function buildEditableDrafts(cat: CatData | null): EditableDrafts {
  return {
    persona: buildPersonaDraft(cat),
    collab: buildCollabDraft(cat),
  };
}

function buildEditableSavePayload(tab: EditableTabKey, draft: string): Record<string, string> {
  return tab === 'persona' ? { personality: draft } : { teamStrengths: draft };
}

function buildTemplateMarkdown(template: InspirationTemplate): string {
  return `## ${template.title}\n\n${template.content}`;
}

function formatBudgetLabel(value?: number): string {
  if (!value || Number.isNaN(value)) return '-- KB';
  const kb = Math.max(1, Math.round(value / 1024));
  return `${kb} KB`;
}

function catInitial(name?: string): string {
  if (!name) return '智';
  return name.slice(0, 1).toUpperCase();
}

function renderAvatar(cat: CatData) {
  const avatar = cat.avatar?.trim() ?? '';
  const resolvedAvatar = avatar.startsWith('/uploads/') ? `${API_URL}${avatar}` : avatar;
  const isImageAvatar = /^(https?:\/\/|\/|data:image)/.test(resolvedAvatar);

  if (isImageAvatar) {
    return <img src={resolvedAvatar} alt={cat.displayName} className="h-11 w-11 rounded-full object-cover" />;
  }

  return (
    <div
      className="flex h-11 w-11 items-center justify-center rounded-full text-[13px] font-semibold text-white"
      style={{ backgroundColor: cat.color?.primary ?? '#7AAEFF' }}
    >
      <span>{avatar || catInitial(cat.displayName)}</span>
    </div>
  );
}

function PlaceholderPanel({ title, description, label }: { title: string; description: string; label: string }) {
  return (
    <div className="px-6 pb-6">
      <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-card-muted)] p-6">
        <span className="inline-flex rounded-full bg-[var(--surface-panel)] px-3 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
          {label}
        </span>
        <h3 className="mt-4 text-[18px] font-semibold text-[var(--text-primary)]">{title}</h3>
        <p className="mt-2 max-w-[560px] text-[13px] leading-6 text-[var(--text-secondary)]">{description}</p>
      </div>
    </div>
  );
}

export function AgentsPanel() {
  const { cats = [], refresh } = useCatData();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [pendingSelectedCatId, setPendingSelectedCatId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AgentTabKey>('persona');
  const [mode, setMode] = useState<PanelMode>('preview');
  const [savedDraftsByCatId, setSavedDraftsByCatId] = useState<Record<string, EditableDrafts>>({});
  const [workingDraftsByCatId, setWorkingDraftsByCatId] = useState<Record<string, EditableDrafts>>({});
  const [openActionMenuCatId, setOpenActionMenuCatId] = useState<string | null>(null);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [connectThirdPartyModalOpen, setConnectThirdPartyModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templatePage, setTemplatePage] = useState(0);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [hoveredTemplateId, setHoveredTemplateId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteConfirmModalOpen, setDeleteConfirmModalOpen] = useState(false);
  const [catToDelete, setCatToDelete] = useState<string | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState<ActionMenuPosition | null>(null);
  const [templateBubblePosition, setTemplateBubblePosition] = useState<TemplateBubblePosition | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const actionMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const templateBubbleRef = useRef<HTMLDivElement | null>(null);
  const hoveredTemplateTriggerRef = useRef<HTMLDivElement | null>(null);
  const templateHoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredCats = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return cats;
    return cats.filter((cat) =>
      [cat.displayName, cat.defaultModel, cat.roleDescription, ...(cat.strengths ?? [])]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(normalizedQuery)),
    );
  }, [cats, searchQuery]);

  const currentTab = useMemo(() => AGENT_TABS.find((tab) => tab.id === activeTab) ?? AGENT_TABS[0], [activeTab]);

  const selectedCat = useMemo(
    () => cats.find((cat) => cat.id === selectedCatId) ?? filteredCats[0] ?? cats[0] ?? null,
    [cats, filteredCats, selectedCatId],
  );
  const actionMenuCat = useMemo(
    () => cats.find((cat) => cat.id === openActionMenuCatId) ?? null,
    [cats, openActionMenuCatId],
  );

  const selectedSavedDrafts = selectedCat
    ? (savedDraftsByCatId[selectedCat.id] ?? buildEditableDrafts(selectedCat))
    : EMPTY_EDITABLE_DRAFTS;

  const selectedWorkingDrafts = selectedCat
    ? (workingDraftsByCatId[selectedCat.id] ?? selectedSavedDrafts)
    : EMPTY_EDITABLE_DRAFTS;

  const canEditActiveTab = currentTab.editable && isEditableTab(activeTab);
  const activeSavedDraft = canEditActiveTab ? selectedSavedDrafts[activeTab] : '';
  const activeWorkingDraft = canEditActiveTab ? selectedWorkingDrafts[activeTab] : '';
  const showEmptyPersonaEditor = mode === 'edit' && activeTab === 'persona' && !activeWorkingDraft.trim();

  const editingCat = editingCatId ? (cats.find((cat) => cat.id === editingCatId) ?? null) : null;

  const promptSelectionItems = useMemo(
    () =>
      INSPIRATION_TEMPLATES.map((template) => ({
        id: template.id,
        title: template.title,
        dexcription: template.dexcription,
        content: buildTemplateMarkdown(template),
      })),
    [],
  );

  const templatePageCount = Math.max(1, Math.ceil(INSPIRATION_TEMPLATES.length / TEMPLATE_PAGE_SIZE));
  const visibleTemplates = useMemo(
    () =>
      INSPIRATION_TEMPLATES.slice(
        templatePage * TEMPLATE_PAGE_SIZE,
        templatePage * TEMPLATE_PAGE_SIZE + TEMPLATE_PAGE_SIZE,
      ),
    [templatePage],
  );

  const activeTemplatePreview = useMemo(
    () => visibleTemplates.find((template) => template.id === activeTemplateId) ?? null,
    [activeTemplateId, visibleTemplates],
  );

  const hoveredTemplatePreview = useMemo(
    () => visibleTemplates.find((template) => template.id === hoveredTemplateId) ?? null,
    [hoveredTemplateId, visibleTemplates],
  );

  const scheduleTemplateHoverClear = useCallback(() => {
    if (templateHoverClearTimerRef.current) {
      clearTimeout(templateHoverClearTimerRef.current);
    }
    templateHoverClearTimerRef.current = setTimeout(() => {
      hoveredTemplateTriggerRef.current = null;
      setHoveredTemplateId(null);
      setTemplateBubblePosition(null);
      templateHoverClearTimerRef.current = null;
    }, 90);
  }, []);

  const computeActionMenuPosition = useCallback((triggerRect: DOMRect): ActionMenuPosition => {
    const menuWidth = actionMenuRef.current?.offsetWidth ?? ACTION_MENU_FALLBACK_WIDTH;
    const menuHeight = actionMenuRef.current?.offsetHeight ?? ACTION_MENU_FALLBACK_HEIGHT;

    const minLeft = ACTION_MENU_VIEWPORT_PADDING;
    const maxLeft = Math.max(minLeft, window.innerWidth - menuWidth - ACTION_MENU_VIEWPORT_PADDING);
    const preferredLeft = triggerRect.right - ACTION_MENU_ALIGN_RIGHT_OFFSET;
    const left = Math.min(Math.max(preferredLeft, minLeft), maxLeft);

    const topBelow = triggerRect.bottom + ACTION_MENU_OFFSET_Y;
    const canOpenBelow = topBelow + menuHeight <= window.innerHeight - ACTION_MENU_VIEWPORT_PADDING;
    const preferredTop = canOpenBelow ? topBelow : triggerRect.top - menuHeight - ACTION_MENU_OFFSET_Y;
    const minTop = ACTION_MENU_VIEWPORT_PADDING;
    const maxTop = Math.max(minTop, window.innerHeight - menuHeight - ACTION_MENU_VIEWPORT_PADDING);
    const top = Math.min(Math.max(preferredTop, minTop), maxTop);

    return { top, left };
  }, []);

  const positionTemplateBubble = useCallback(() => {
    const trigger = hoveredTemplateTriggerRef.current;
    const bubble = templateBubbleRef.current;
    if (!trigger || !bubble) return;

    const triggerRect = trigger.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 10;
    const desiredLeft = triggerRect.left + triggerRect.width / 2 - bubbleRect.width / 2;
    const maxLeft = Math.max(viewportPadding, window.innerWidth - bubbleRect.width - viewportPadding);
    const left = Math.min(Math.max(desiredLeft, viewportPadding), maxLeft);
    const top = Math.max(viewportPadding, triggerRect.top - bubbleRect.height - gap);
    const triggerCenterX = triggerRect.left + triggerRect.width / 2;
    const tailLeft = Math.min(Math.max(triggerCenterX - left, 18), Math.max(18, bubbleRect.width - 18));

    setTemplateBubblePosition({ top, left, tailLeft });
  }, []);

  useEffect(() => {
    if (cats.length === 0) {
      setSelectedCatId(null);
      return;
    }

    setSavedDraftsByCatId((current) => {
      let changed = false;
      const next = { ...current };
      for (const cat of cats) {
        if (!next[cat.id]) {
          next[cat.id] = buildEditableDrafts(cat);
          changed = true;
        }
      }
      return changed ? next : current;
    });

    setWorkingDraftsByCatId((current) => {
      let changed = false;
      const next = { ...current };
      for (const cat of cats) {
        if (!next[cat.id]) {
          next[cat.id] = buildEditableDrafts(cat);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [cats]);

  useEffect(() => {
    if (!pendingSelectedCatId) return;
    if (!cats.some((cat) => cat.id === pendingSelectedCatId)) return;

    setSelectedCatId(pendingSelectedCatId);
    setMode('preview');
    setPendingSelectedCatId(null);
  }, [cats, pendingSelectedCatId]);

  useEffect(() => {
    if (filteredCats.length === 0) {
      setSelectedCatId(null);
      return;
    }

    if (!selectedCatId || !filteredCats.some((cat) => cat.id === selectedCatId)) {
      setSelectedCatId(filteredCats[0].id);
      setMode('preview');
    }
  }, [filteredCats, selectedCatId]);

  useEffect(() => {
    if (!visibleTemplates.length) {
      setActiveTemplateId(null);
      setHoveredTemplateId(null);
      return;
    }

    if (activeTemplateId && !visibleTemplates.some((template) => template.id === activeTemplateId)) {
      setActiveTemplateId(null);
    }

    if (hoveredTemplateId && !visibleTemplates.some((template) => template.id === hoveredTemplateId)) {
      setHoveredTemplateId(null);
    }
  }, [activeTemplateId, hoveredTemplateId, visibleTemplates]);

  useEffect(() => {
    if (currentTab.editable) return;
    setMode('preview');
  }, [currentTab.editable]);

  useEffect(() => {
    setSaveError(null);
  }, [activeTab, selectedCat?.id]);

  useEffect(() => {
    if (!templateModalOpen) return;
    if (mode !== 'edit' || activeTab !== 'persona') {
      setTemplateModalOpen(false);
    }
  }, [activeTab, mode, templateModalOpen]);

  useEffect(
    () => () => {
      if (templateHoverClearTimerRef.current) {
        clearTimeout(templateHoverClearTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!openActionMenuCatId) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideMenu = actionMenuRef.current?.contains(target);
      const clickedInsideTrigger = actionMenuTriggerRef.current?.contains(target);
      if (!clickedInsideMenu && !clickedInsideTrigger) {
        setOpenActionMenuCatId(null);
        setActionMenuPosition(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenActionMenuCatId(null);
        setActionMenuPosition(null);
      }
    };

    const updateMenuPosition = () => {
      const trigger = actionMenuTriggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      setActionMenuPosition(computeActionMenuPosition(rect));
    };

    updateMenuPosition();
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', updateMenuPosition);
    document.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', updateMenuPosition);
      document.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [computeActionMenuPosition, openActionMenuCatId]);

  useLayoutEffect(() => {
    if (!hoveredTemplateId) return;

    positionTemplateBubble();

    const handleViewportChange = () => positionTemplateBubble();
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [hoveredTemplateId, positionTemplateBubble]);

  const updateWorkingDraft = useCallback(
    (tab: EditableTabKey, value: string) => {
      if (!selectedCat) return;
      setWorkingDraftsByCatId((current) => ({
        ...current,
        [selectedCat.id]: {
          ...(current[selectedCat.id] ?? selectedSavedDrafts),
          [tab]: value,
        },
      }));
      setSaveError(null);
    },
    [selectedCat, selectedSavedDrafts],
  );

  const openAddMember = useCallback(() => {
    setEditingCatId(null);
    setEditorOpen(true);
  }, []);

  const openEditMember = useCallback((catId: string) => {
    setEditingCatId(catId);
    setEditorOpen(true);
  }, []);

  const handleEditorSaved = useCallback(
    async (savedCatId?: string) => {
      const isCreatingCat = !editingCatId;
      const nextCats = await refresh();

      if (!isCreatingCat || !savedCatId) return;

      setSearchQuery('');
      if (nextCats.some((cat) => cat.id === savedCatId)) {
        setSelectedCatId(savedCatId);
        setMode('preview');
        setPendingSelectedCatId(null);
        return;
      }

      setPendingSelectedCatId(savedCatId);
    },
    [editingCatId, refresh],
  );

  const handleDeleteMember = useCallback(
    async (catId: string) => {
      const cat = cats.find((item) => item.id === catId);
      if (!cat || cat.source !== 'runtime') return;

      setOpenActionMenuCatId(null);
      setActionMenuPosition(null);
      setSaveError(null);

      try {
        const res = await apiFetch(`/api/cats/${cat.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          setSaveError(payload.error ?? `删除失败 (${res.status})`);
          return;
        }

        await refresh();
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : '删除失败');
      }
    },
    [cats, refresh],
  );

  const handleStartEdit = useCallback(() => {
    if (!selectedCat || !canEditActiveTab || !isEditableTab(activeTab)) return;
    setSaveError(null);
    setWorkingDraftsByCatId((current) => ({
      ...current,
      [selectedCat.id]: {
        ...(current[selectedCat.id] ?? selectedSavedDrafts),
        [activeTab]: selectedSavedDrafts[activeTab],
      },
    }));
    setMode('edit');
  }, [activeTab, canEditActiveTab, selectedCat, selectedSavedDrafts]);

  const handleCancelEdit = useCallback(() => {
    if (!selectedCat) return;
    setSaveError(null);
    setWorkingDraftsByCatId((current) => ({
      ...current,
      [selectedCat.id]: {
        ...(current[selectedCat.id] ?? EMPTY_EDITABLE_DRAFTS),
        ...selectedSavedDrafts,
      },
    }));
    setMode('preview');
  }, [selectedCat, selectedSavedDrafts]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedCat || !canEditActiveTab || !isEditableTab(activeTab)) return;
    const draft = selectedWorkingDrafts[activeTab];
    setIsSavingEdit(true);
    setSaveError(null);

    try {
      const res = await apiFetch(`/api/cats/${selectedCat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEditableSavePayload(activeTab, draft)),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setSaveError(payload.error ?? `保存失败 (${res.status})`);
        return;
      }

      setSavedDraftsByCatId((current) => ({
        ...current,
        [selectedCat.id]: {
          ...(current[selectedCat.id] ?? EMPTY_EDITABLE_DRAFTS),
          [activeTab]: draft,
        },
      }));
      setWorkingDraftsByCatId((current) => ({
        ...current,
        [selectedCat.id]: {
          ...(current[selectedCat.id] ?? EMPTY_EDITABLE_DRAFTS),
          [activeTab]: draft,
        },
      }));
      await refresh();
      setMode('preview');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setIsSavingEdit(false);
    }
  }, [activeTab, canEditActiveTab, refresh, selectedCat, selectedWorkingDrafts]);

  const handleApplyTemplate = useCallback(
    (templateId: string) => {
      if (!selectedCat) return;
      const template = INSPIRATION_TEMPLATES.find((item) => item.id === templateId);
      if (!template) return;

      const markdown = buildTemplateMarkdown(template);
      setWorkingDraftsByCatId((current) => {
        const baseDrafts = current[selectedCat.id] ?? selectedSavedDrafts;
        const existing = baseDrafts.persona.trim();
        return {
          ...current,
          [selectedCat.id]: {
            ...baseDrafts,
            persona: existing ? `${existing}\n\n${markdown}` : markdown,
          },
        };
      });
      setSaveError(null);
      setActiveTemplateId(template.id);
      setHoveredTemplateId(null);
      setMode('edit');
      setTemplateModalOpen(false);
    },
    [selectedCat, selectedSavedDrafts],
  );

  const renderPreviewActions = () => (
    <button
      type="button"
      onClick={handleStartEdit}
      disabled={!canEditActiveTab}
      className={`inline-flex items-center gap-1.5 rounded-full h-6 w-20 px-4 py-[3px] text-[12px] font-normal transition ${
        canEditActiveTab
          ? 'bg-[var(--surface-panel)] text-black hover:underline hover:underline-offset-2'
          : 'cursor-not-allowed bg-[var(--surface-card-muted)] text-[var(--text-subtle)]'
      }`}
    >
      <EditIcon className="h-3.5 w-3.5" />
      <span>编辑</span>
    </button>
  );

  const renderEditActions = () => {
    const showTemplateButton = activeTab === 'persona';

    return (
      <div className="flex items-center gap-4">
        {showTemplateButton ? (
          <button
            type="button"
            onClick={() => {
              if (isSavingEdit) return;
              setTemplateModalOpen(true);
            }}
            disabled={isSavingEdit}
            className={`inline-flex items-center justify-center gap-1 text-[12px] font-normal transition w-[44px] h-[18px] ${
              isSavingEdit
                ? 'cursor-not-allowed text-[var(--text-subtle)]'
                : 'text-[var(--text-primary)] hover:underline hover:underline-offset-2'
            }`}
          >
            <TemplateIcon className="h-3.5 w-3.5" />
            <span>模板</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleCancelEdit}
          disabled={isSavingEdit}
          className={`inline-flex items-center justify-center gap-1 text-[12px] font-normal transition w-[44px] h-[18px] ${
            isSavingEdit
              ? 'cursor-not-allowed text-[var(--text-subtle)]'
              : 'text-[var(--text-primary)] hover:underline hover:underline-offset-2'
          }`}
        >
          <CloseIcon className="h-3.5 w-3.5" />
          <span>取消</span>
        </button>
        <button
          type="button"
          onClick={handleSaveEdit}
          disabled={isSavingEdit}
          className={`inline-flex items-center justify-center gap-1 text-[12px] font-normal transition w-[44px] h-[18px] ${
            isSavingEdit
              ? 'cursor-not-allowed text-[var(--text-subtle)]'
              : 'text-[var(--text-primary)] hover:underline hover:underline-offset-2'
          }`}
        >
          <CheckIcon className="h-3.5 w-3.5" />
          <span>{isSavingEdit ? '保存中' : '保存'}</span>
        </button>
      </div>
    );
  };

  const renderEmptyEditablePreview = (message: string) => (
    <div className="px-6 pb-6">
      <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-card-muted)] p-6">
        <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">{currentTab.label}</h3>
        <p className="mt-2 max-w-[560px] text-[13px] leading-6 text-[var(--text-secondary)]">{message}</p>
      </div>
    </div>
  );

  const renderMarkdownPreview = (content: string) => {
    if (!content.trim()) {
      return (
        <div className="flex h-full min-h-0 flex-col items-center justify-center px-8 pb-6">
          <div className="text-center">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">暂无内容</h3>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1" >当前暂无内容，您可以填写后获取数据。</p>
            <button
              type="button"
              onClick={handleStartEdit}
              disabled={!canEditActiveTab}
              className={`mt-4 inline-flex h-7 min-w-[72px] items-center justify-center rounded-full border border-black bg-[var(--surface-panel)] px-6 py-[5px] text-[12px] font-normal text-black transition ${
                !canEditActiveTab ? 'cursor-not-allowed opacity-50' : 'hover:bg-black/5'
              }`}
            >
              编辑
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="px-8 pb-6">
        <div className="h-full overflow-auto">
          <MarkdownContent
            content={content}
            className="text-[14px] leading-7 text-[var(--text-primary)] [&_h2]:mt-0 [&_h2]:mb-4 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-[var(--text-primary)] [&_h3]:mb-3 [&_h3]:text-[16px] [&_h3]:font-semibold [&_h3]:text-[var(--text-primary)] [&_p]:text-[var(--text-primary)] [&_ul]:mb-4 [&_li]:text-[var(--text-primary)]"
            disableCommandPrefix
          />
        </div>
      </div>
    );
  };

  const renderMarkdownEditor = () => (
    <div className="flex h-full min-h-0 flex-col px-8 pb-6">
      <div className="min-h-0 flex-1 overflow-hidden">
        <textarea
          value={activeWorkingDraft}
          onChange={(event) => {
            if (!isEditableTab(activeTab)) return;
            updateWorkingDraft(activeTab, event.target.value);
          }}
          placeholder={
            activeTab === 'persona'
              ? '请输入你的智能体人格、语气、规则描述，或选择下方模板自动生成'
              : '请输入协作配置内容，例如分工方式、交接规则、协作边界等'
          }
          className="ui-textarea ui-textarea-plain h-full w-full resize-none text-[12px] leading-7"
          data-testid="agent-tab-textarea"
        />
      </div>
    </div>
  );

  const renderPersonaEmptyEditor = () => (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="px-8 pb-3">
        <textarea
          value={activeWorkingDraft}
          onChange={(event) => {
            if (!isEditableTab(activeTab)) return;
            updateWorkingDraft(activeTab, event.target.value);
          }}
          placeholder="请输入你的智能体人格、语气、规则描述，或选择下方模板自动生成"
          className="ui-textarea h-[120px] w-full resize-none rounded-[8px] text-[12px] leading-7"
          data-testid="agent-tab-textarea"
        />
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-8 pb-6">
        <div className="mt-auto mx-auto w-full">
          <div className="mb-2 flex items-center justify-between gap-3 text-[12px] text-[var(--text-muted)]">
            <span>灵魂模板</span>
            {templatePageCount > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTemplatePage((current) => Math.max(0, current - 1))}
                  disabled={templatePage === 0}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] transition enabled:hover:bg-[var(--surface-card-muted)] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="上一页模板"
                >
                  <ChevronLeftIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setTemplatePage((current) => Math.min(templatePageCount - 1, current + 1))}
                  disabled={templatePage >= templatePageCount - 1}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] transition enabled:hover:bg-[var(--surface-card-muted)] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="下一页模板"
                >
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {visibleTemplates.map((template) => {
              const isHovered = hoveredTemplatePreview?.id === template.id;
              return (
                <div
                  key={template.id}
                  className="relative"
                  ref={isHovered ? hoveredTemplateTriggerRef : null}
                  onMouseEnter={(event) => {
                    if (templateHoverClearTimerRef.current) {
                      clearTimeout(templateHoverClearTimerRef.current);
                      templateHoverClearTimerRef.current = null;
                    }
                    hoveredTemplateTriggerRef.current = event.currentTarget;
                    setHoveredTemplateId(template.id);
                  }}
                  onMouseLeave={scheduleTemplateHoverClear}
                  onFocus={(event) => {
                    if (templateHoverClearTimerRef.current) {
                      clearTimeout(templateHoverClearTimerRef.current);
                      templateHoverClearTimerRef.current = null;
                    }
                    hoveredTemplateTriggerRef.current = event.currentTarget;
                    setHoveredTemplateId(template.id);
                  }}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      scheduleTemplateHoverClear();
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveTemplateId(template.id)}
                    className="h-[98px] w-full rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-panel)] px-4 py-4 text-left transition hover:shadow-[0_4px_16px_0_rgba(0,0,0,0.08)]"
                  >
                    <div className="text-[14px] font-semibold text-[var(--text-primary)]">{template.title}</div>
                    <div className="mt-2 line-clamp-2 text-[12px] leading-5 text-[var(--text-muted)]">{template.dexcription}</div>
                  </button>
                </div>
              );
            })}
          </div>

          {hoveredTemplatePreview ? (
            <div
              ref={templateBubbleRef}
              className="fixed z-40 w-[400px] h-[300px] flex flex-col shadow-[0_2px_12px_0_rgba(0,0,0,0.16)] rounded-[8px]"
              style={{
                top: templateBubblePosition?.top ?? 0,
                left: templateBubblePosition?.left ?? 0,
                visibility: templateBubblePosition ? 'visible' : 'hidden',
              }}
              onMouseEnter={() => {
                if (templateHoverClearTimerRef.current) {
                  clearTimeout(templateHoverClearTimerRef.current);
                  templateHoverClearTimerRef.current = null;
                }
              }}
              onMouseLeave={scheduleTemplateHoverClear}
            >
              <div className="relative flex flex-col h-full bg-[var(--surface-panel)] rounded-[8px] border border-[var(--border-default)] shadow-[var(--shadow-card-hover)] overflow-hidden p-4">
                {/* 顶部标题 - 固定 */}
                <div className="shrink-0  pb-3">
                  <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                    {hoveredTemplatePreview.title}
                  </h3>
                </div>

                {/* 中间内容 - 可滚动 */}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <MarkdownContent
                    content={buildTemplateMarkdown(hoveredTemplatePreview)}
                    className="text-[12px] leading-[1.55] text-[var(--text-secondary)] [&_h2]:hidden [&_h3]:mb-2 [&_h3]:text-[12px] [&_h3]:font-semibold [&_h3]:text-[var(--text-primary)] [&_ul]:mb-3 [&_ul]:space-y-1.5"
                    disableCommandPrefix
                  />
                </div>

                {/* 底部按钮 - 固定 */}
                <div className="shrink-0 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate(hoveredTemplatePreview.id)}
                    className="ui-button-primary h-[24px] px-4 py-[3px] text-[12px] rounded-[999px] flex items-center justify-center font-normal"
                  >
                    插入模板
                  </button>
                </div>

                {/* 气泡箭头 */}
              </div>
              <div
                className="pointer-events-none absolute top-full h-0 w-0 -translate-x-1/2 border-x-[7px] border-x-transparent border-t-[8px] border-t-[var(--border-default)]"
                style={{ left: templateBubblePosition?.tailLeft ?? 24 }}
              />
              <div
                className="pointer-events-none absolute top-full mt-[-1px] h-0 w-0 -translate-x-1/2 border-x-[6px] border-x-transparent border-t-[7px] border-t-[var(--surface-panel)]"
                style={{ left: templateBubblePosition?.tailLeft ?? 24 }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  const renderSkillsPreview = () => (
    <PlaceholderPanel
      label="占位展示"
      title="技能配置暂未展开"
      description="当前仅保留技能配置入口和页面占位，后续会在这里补充技能包、工具授权和能力标签等真实配置内容。"
    />
  );

  const renderDetailBody = () => {
    if (!selectedCat) {
      return renderEmptyEditablePreview('当前没有可展示的智能体，后续可通过“新建智能体”继续补齐页面内容。');
    }

    if (mode === 'edit' && canEditActiveTab) {
      if (showEmptyPersonaEditor) return renderPersonaEmptyEditor();
      return renderMarkdownEditor();
    }

    if (activeTab === 'persona' || activeTab === 'collab') {
      return renderMarkdownPreview(activeSavedDraft);
    }

    if (activeTab === 'skills') {
      return renderSkillsPreview();
    }

    return renderEmptyEditablePreview('当前页签暂不可编辑。');
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="ui-page-title">智能体管理</h1>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            data-testid="create-agent-button"
            onClick={openAddMember}
            className="ui-button-primary h-[28px] min-h-[28px] px-6 py-[5px] text-[12px] font-normal"
          >
            新建智能体
          </button>
        </div>
      </div>

      <div className="ui-panel min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0">
          <aside className="relative flex h-full w-[322px] shrink-0 flex-col border-r border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-6">
            <label className="mb-3 mr-1 flex h-[28px] min-h-[28px] w-[calc(100%-4px)] items-center gap-2 rounded-[6px] border border-[rgba(194,194,194,1)] bg-[var(--surface-panel)] px-3 text-[var(--text-muted)]">
              <SearchIcon className="h-3.5 w-3.5 shrink-0" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索智能体"
                className="ui-input ui-input-plain min-w-0 flex-1 text-[12px]"
              />
            </label>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {filteredCats.map((cat) => {
                const isSelected = selectedCat?.id === cat.id;
                const modelText = cat.defaultModel || '未配置模型';
                const budgetText = formatBudgetLabel(cat.contextBudget?.maxContextTokens);
                const isPlatformPreset = cat.source !== 'runtime';

                return (
                  <div
                    key={cat.id}
                    data-testid={`agent-card-${cat.id}`}
                    className="relative h-[76px] border px-3 py-2 transition-colors [border-radius:var(--connector-tab-radius)]"
                    style={{
                      borderColor: isSelected
                        ? 'var(--connector-tab-border-selected)'
                        : 'var(--connector-tab-border-default)',
                      backgroundColor: isSelected
                        ? 'var(--connector-tab-bg-selected)'
                        : 'var(--connector-tab-bg-default)',
                    }}
                  >
                    <div className="flex h-full items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCatId(cat.id);
                          setOpenActionMenuCatId(null);
                          setMode('preview');
                        }}
                        className="flex h-full min-w-0 flex-1 items-center gap-3 pr-10 text-left"
                      >
                        <span className="shrink-0">{renderAvatar(cat)}</span>
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-center gap-1">
                            <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">
                              {cat.displayName}
                            </span>
                            {isPlatformPreset ? (
                              <span className="ui-badge-muted inline-flex h-[18px] shrink-0 items-center rounded-[4px] text-[12px] text-[var(--agent-preset-badge-text)] bg-[var(--agent-preset-badge-bg)]">
                                平台预置
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1 block truncate text-[11px] text-[var(--text-muted)]">
                            {modelText} | {budgetText}
                          </span>
                        </span>
                      </button>

                      <div className="absolute bottom-2 right-2">
                        <button
                          data-testid={`agent-card-menu-${cat.id}`}
                          ref={openActionMenuCatId === cat.id ? actionMenuTriggerRef : null}
                          type="button"
                          onClick={(event) => {
                            const nextOpen = openActionMenuCatId !== cat.id;
                            if (!nextOpen) {
                              setOpenActionMenuCatId(null);
                              setActionMenuPosition(null);
                              actionMenuTriggerRef.current = null;
                              return;
                            }

                            const rect = event.currentTarget.getBoundingClientRect();
                            setActionMenuPosition(computeActionMenuPosition(rect));
                            actionMenuTriggerRef.current = event.currentTarget;
                            setOpenActionMenuCatId(cat.id);
                          }}
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-[4px] transition ${
                            openActionMenuCatId === cat.id
                              ? 'bg-[#f5f5f5] text-[var(--text-accent)]'
                              : 'text-[var(--text-muted)] hover:bg-[#f5f5f5] hover:text-[var(--text-accent)]'
                          }`}
                          aria-label={`操作 ${cat.displayName}`}
                          aria-expanded={openActionMenuCatId === cat.id}
                          aria-haspopup="menu"
                        >
                          <MoreVerticalIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredCats.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] px-3 py-4 text-[12px] text-[var(--text-muted)]">
                  没有匹配的智能体
                </div>
              ) : null}
            </div>

            {openActionMenuCatId && actionMenuPosition ? (
              <div
                ref={actionMenuRef}
                role="menu"
                className="fixed z-40 w-[80px] rounded-[6px] border border-[var(--border-default)] bg-[var(--surface-panel)] p-1.5 shadow-[0_2px_12px_0_rgba(0,0,0,0.16)]"
                style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }}
              >
                <button
                  type="button"
                  role="menuitem"
                  data-testid="agent-edit-menu-item"
                  onClick={() => {
                    setSelectedCatId(openActionMenuCatId);
                    setOpenActionMenuCatId(null);
                    setActionMenuPosition(null);
                    openEditMember(openActionMenuCatId);
                  }}
                  className={`${ACTION_MENU_ITEM_CLASS} hover:bg-[var(--surface-card-muted)]`}
                >
                  <EditIcon className="h-3.5 w-3.5 text-[var(--text-primary)]" />
                  <span>编辑</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="agent-delete-menu-item"
                  disabled={actionMenuCat?.source !== 'runtime'}
                  onClick={() => {
                    if (actionMenuCat?.source !== 'runtime') return;
                    setCatToDelete(actionMenuCat.id);
                    setDeleteConfirmModalOpen(true);
                    setOpenActionMenuCatId(null);
                    setActionMenuPosition(null);
                  }}
                  className={`${ACTION_MENU_ITEM_CLASS} ${
                    actionMenuCat?.source === 'runtime'
                      ? 'hover:bg-[var(--surface-card-muted)]'
                      : 'cursor-not-allowed text-[var(--text-subtle)] opacity-60'
                  }`}
                >
                  <TrashIcon
                    className={`h-3.5 w-3.5 ${actionMenuCat?.source === 'runtime' ? 'text-[var(--state-error-text)]' : 'text-[var(--text-subtle)]'}`}
                  />
                  <span>删除</span>
                </button>
              </div>
            ) : null}
          </aside>

          <section className="relative z-0 flex min-w-0 flex-1 flex-col bg-[var(--surface-panel)]">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--border-soft)] px-4 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {AGENT_TABS.map((tab) => {
                  const TabIcon = tab.icon;
                  const isActive = tab.id === activeTab;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        setMode('preview');
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-[8px] border border-transparent px-3 py-1.5 text-[12px] text-[#191919] transition ${
                        isActive ? 'bg-[rgba(230,230,230,1)]' : ' hover:bg-[#F8FAFC]'
                      }`}
                      data-testid={`agent-tab-${tab.id}`}
                    >
                      <TabIcon className="h-3.5 w-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-4 px-8 pb-4 pt-4 h-14">
                <h2 className="text-[16px] h-[22px] font-bold text-[var(--text-primary)]">{currentTab.label}</h2>
                {currentTab.editable
                  ? mode === 'edit' && canEditActiveTab
                    ? renderEditActions()
                    : renderPreviewActions()
                  : null}
              </div>

              {saveError ? (
                <div className="ui-status-error mx-6 mb-3 rounded-[var(--radius-md)] px-3 py-2 text-[12px]">
                  {saveError}
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-hidden">{renderDetailBody()}</div>
            </div>
          </section>
        </div>
      </div>

      <CreateAgentModal
        open={editorOpen}
        cat={editingCat ?? undefined}
        name={editingCat?.name ?? editingCat?.displayName}
        description={editingCat?.roleDescription}
        selectedModelId={
          editingCat?.accountRef && editingCat.defaultModel
            ? `${editingCat.accountRef}::${editingCat.defaultModel}`
            : null
        }
        title={editingCatId ? '编辑智能体' : '创建智能体'}
        onClose={() => {
          setEditorOpen(false);
          setEditingCatId(null);
        }}
        onSaved={handleEditorSaved}
      />

      <ConnectThirdPartyAgentModal
        open={connectThirdPartyModalOpen}
        onClose={() => setConnectThirdPartyModalOpen(false)}
      />

      <PromptSelectionModal
        open={templateModalOpen}
        items={promptSelectionItems}
        title="灵魂模板"
        searchPlaceholder="输入关键字搜索"
        cancelLabel="取消"
        confirmLabel="插入"
        initialSelectedId={activeTemplatePreview?.id ?? promptSelectionItems[0]?.id ?? null}
        onClose={() => setTemplateModalOpen(false)}
        onConfirm={(item) => handleApplyTemplate(item.id)}
      />

      {/* 删除确认弹窗 */}
      {deleteConfirmModalOpen && catToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        >
          <div
            className="w-[400px] rounded-[8px] border border-[#E5EAF0] bg-white p-6 shadow-2xl"
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-[16px] font-bold text-gray-900">确认删除智能体</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmModalOpen(false);
                    setCatToDelete(null);
                  }}
                  aria-label="close"
                  className="flex h-6 w-6 items-center justify-center rounded text-[#5F6775] transition-colors hover:bg-[#F7F8FA]"
                 style={{ transform: 'translate(4px, -4px)' }}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-gray-600">
                  是否确认删除?删除后数据将不可恢复。
                </p>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmModalOpen(false);
                    setCatToDelete(null);
                  }}
                  className="ui-button-default font-normal"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (catToDelete) {
                      await handleDeleteMember(catToDelete);
                    }
                    setDeleteConfirmModalOpen(false);
                    setCatToDelete(null);
                  }}
                  className="ui-button-primary font-normal"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

