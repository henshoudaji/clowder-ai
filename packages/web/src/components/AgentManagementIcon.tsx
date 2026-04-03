'use client';

type AgentManagementIconName =
  | 'persona'
  | 'collab'
  | 'skills'
  | 'template'
  | 'edit'
  | 'close'
  | 'check'
  | 'more'
  | 'delete';

const ICON_PATHS: Record<AgentManagementIconName, string> = {
  persona: '/images/agent-management-icons/agent-persona.svg',
  collab: '/images/agent-management-icons/agent-collab.svg',
  skills: '/images/agent-management-icons/agent-skills.svg',
  template: '/images/agent-management-icons/agent-template.svg',
  edit: '/images/agent-management-icons/agent-edit.svg',
  close: '/images/agent-management-icons/agent-close.svg',
  check: '/images/agent-management-icons/agent-check.svg',
  more: '/images/agent-management-icons/agent-more.svg',
  delete: '/images/agent-management-icons/agent-delete.svg',
};

export function AgentManagementIcon({
  name,
  className,
}: {
  name: AgentManagementIconName;
  className?: string;
}) {
  return <img src={ICON_PATHS[name]} alt="" aria-hidden="true" className={className} />;
}
