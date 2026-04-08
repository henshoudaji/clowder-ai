/**
 * F087: Predefined Interactive Rich Block configurations for bootcamp phases.
 * These are used by the bootcamp-guide skill to present selection UIs.
 */

export interface BootcampInteractiveBlock {
  id: string;
  kind: 'interactive';
  v: 1;
  interactiveType: 'card-grid' | 'select' | 'confirm';
  title: string;
  description?: string;
  options: Array<{
    id: string;
    label: string;
    emoji?: string;
    icon?: string;
    description?: string;
    level?: number;
    group?: string;
  }>;
  allowRandom?: boolean;
  messageTemplate?: string;
}

/** Phase 0: Cat selection — user picks their lead guide cat */
export const catSelectionBlock: BootcampInteractiveBlock = {
  id: 'bootcamp-cat-select',
  kind: 'interactive',
  v: 1,
  interactiveType: 'card-grid',
  title: '选一个智能体当你的主引导！',
  description: '其他智能体也会在需要时协助',
  options: [
    {
      id: 'opus',
      icon: 'bot',
      label: '小九 (办公智能体)',
      description: '办公专家，结构化输出',
      group: '选择你的引导智能体',
    },
    {
      id: 'codex',
      icon: 'bot',
      label: '小理 (通用智能体)',
      description: '个人助理，耐心细致',
      group: '选择你的引导智能体',
    },
    {
      id: 'gemini',
      icon: 'bot',
      label: '小码 (编码智能体)',
      description: '任务编排，高效协作',
      group: '选择你的引导智能体',
    },
  ],
  allowRandom: true,
  messageTemplate: '我选 {selection} 当我的引导！',
};

/** Phase 4: Task selection — user picks a bootcamp project */
export const taskSelectionBlock: BootcampInteractiveBlock = {
  id: 'bootcamp-task-select',
  kind: 'interactive',
  v: 1,
  interactiveType: 'card-grid',
  title: '选一个你感兴趣的项目，我们一起做！',
  description: '按难度分层，选适合你的，或者让命运来决定',
  allowRandom: true,
  options: [
    // Lv.1 — 好玩上手
    { id: 'Q1', icon: 'dice', label: '盲盒惊喜', description: '每日惊喜 ~30min', level: 1, group: 'Lv.1 好玩上手' },
    { id: 'Q2', icon: 'star', label: '星座运势', description: '多视角解运势 ~30min', level: 1, group: 'Lv.1 好玩上手' },
    {
      id: 'Q3',
      icon: 'search',
      label: '侦探社',
      description: '游戏化 debug ~1h',
      level: 1,
      group: 'Lv.1 好玩上手',
    },
    { id: 'Q4', icon: 'chat', label: '心情墙', description: '情绪价值拉满 ~1h', level: 1, group: 'Lv.1 好玩上手' },
    { id: 'Q5', icon: 'palette', label: 'Emoji 工坊', description: '协作创作 ~1h', level: 1, group: 'Lv.1 好玩上手' },
    { id: 'Q6', icon: 'coffee', label: '拿铁配方', description: '咖啡馆配方 ~1h', level: 1, group: 'Lv.1 好玩上手' },
    {
      id: 'Q7',
      icon: 'utensils',
      label: '智能点餐',
      description: '全栈点餐系统 ~2h',
      level: 1,
      group: 'Lv.1 好玩上手',
    },
    { id: 'Q8', icon: 'game', label: '像素世界', description: '像素互动场景 ~2h', level: 1, group: 'Lv.1 好玩上手' },
    { id: 'Q9', icon: 'chart', label: '3D 能力看板', description: '能力雷达图 ~2h', level: 1, group: 'Lv.1 好玩上手' },
    {
      id: 'Q10',
      icon: 'heart',
      label: '互动玩具',
      description: '趣味互动 ~1h',
      level: 1,
      group: 'Lv.1 好玩上手',
    },
    // Lv.2 — 有深度
    { id: 'Q11', icon: 'sun', label: '天气站', description: 'API + 多方播报 ~2h', level: 2, group: 'Lv.2 有深度' },
    { id: 'Q12', icon: 'test', label: 'Standup 面板', description: '协作可观测性 ~2h', level: 2, group: 'Lv.2 有深度' },
    { id: 'Q13', icon: 'trophy', label: '成就博物馆', description: 'Git 数据挖掘 ~3h', level: 2, group: 'Lv.2 有深度' },
    { id: 'Q14', icon: 'globe', label: '翻译官', description: '多风格翻译 ~2h', level: 2, group: 'Lv.2 有深度' },
    // Lv.3 — 进阶挑战
    { id: 'Q15', icon: 'scale', label: '决策室', description: '多方辩论赛 ~3h', level: 3, group: 'Lv.3 进阶挑战' },
    { id: 'Q16', icon: 'shuffle', label: '代码接力', description: '全流程协作 ~4h', level: 3, group: 'Lv.3 进阶挑战' },
  ],
  messageTemplate: '我选了 {selection}！',
};

/** Get all bootcamp block definitions by ID */
export const BOOTCAMP_BLOCKS: Record<string, BootcampInteractiveBlock> = {
  'bootcamp-cat-select': catSelectionBlock,
  'bootcamp-task-select': taskSelectionBlock,
};
