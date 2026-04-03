'use client';

import { HubConnectorConfigTab } from './HubConnectorConfigTab';

export function ChannelsPanel() {
  return (
    <div className="ui-page-shell">
      <div className="ui-page-header">
        <h1 className="ui-page-title">渠道</h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <HubConnectorConfigTab />
      </div>
    </div>
  );
}
