import { BootcampIcon } from './icons/BootcampIcon';

interface ChatEmptyStateProps {
  bootcampCount: number;
  isCurrentBootcampThread: boolean;
  onOpenBootcampList: () => void;
  onAgentsClick?: () => void;
  onChannelsClick?: () => void;
}

interface EmptyStateCard {
  id: 'agents' | 'channels';
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
}

const SHOW_BOOTCAMP_ENTRY = false;

const heroCards: EmptyStateCard[] = [
  {
    id: 'agents',
    title: '智能体配置',
    description: '设置智能体人设及记忆，让 OfficeClaw 更了解你。',
    imageSrc: '/images/chat-empty-agent.svg',
    imageAlt: '智能体配置',
  },
  {
    id: 'channels',
    title: '一键接入 IM',
    description: '一键接入飞书、微信、钉钉、小艺渠道，无缝推进办公流程。',
    imageSrc: '/images/chat-empty-im.svg',
    imageAlt: '一键接入 IM',
  },
];

export function ChatEmptyState({
  bootcampCount,
  isCurrentBootcampThread,
  onOpenBootcampList,
  onAgentsClick,
  onChannelsClick,
}: ChatEmptyStateProps) {
  const shouldShowBootcampEntry = SHOW_BOOTCAMP_ENTRY && !isCurrentBootcampThread;

  const handleCardClick = (cardId: EmptyStateCard['id']) => {
    if (cardId === 'agents') {
      onAgentsClick?.();
      return;
    }

    onChannelsClick?.();
  };

  return (
    <section className="min-h-full px-4 py-10 sm:px-6" data-testid="chat-empty-state">
      <div className="mx-auto flex min-h-[calc(100vh-21rem)] max-w-4xl items-center justify-center">
        <div className="w-full text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-[34px] font-semibold leading-tight tracking-[-0.03em] text-[#1F1F24] sm:text-[36px]">
              <span className="text-[#4D6BFF]">OfficeClaw</span>
              <span className="text-[#4D6BFF]">，</span>
              <span>制定目标自动规划执行</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[#8E8E98] sm:text-[15px]">
              即刻部署专属 AI 专家，成为 7x24 小时在线的超级助手。
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
            {heroCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => handleCardClick(card.id)}
                className="rounded-[16px] border border-[#EEF0F5] bg-white px-6 py-6 text-left transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF] focus-visible:ring-offset-2"
                data-testid={`chat-empty-card-${card.id}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white">
                    <img src={card.imageSrc} alt={card.imageAlt} className="h-14 w-14 object-contain" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-[#202127]">{card.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#8E8E98]">{card.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {shouldShowBootcampEntry &&
            (bootcampCount > 0 ? (
              <button
                type="button"
                onClick={onOpenBootcampList}
                className="mt-8 inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
                data-testid="empty-state-bootcamp-list"
              >
                <BootcampIcon className="h-4 w-4" />
                我的训练营（{bootcampCount}）
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenBootcampList}
                className="mt-8 inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
                data-testid="empty-state-bootcamp"
              >
                <BootcampIcon className="h-4 w-4" />
                第一次来？开始猫猫训练营
              </button>
            ))}
        </div>
      </div>
    </section>
  );
}
