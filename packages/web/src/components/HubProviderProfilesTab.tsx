'use client';

import { HubAcpModelProfilesSection } from './HubAcpModelProfilesSection';
import { HubProviderProfileItem } from './HubProviderProfileItem';
import { CreateAcpModelProfileSection, CreateApiKeyProfileSection, ProviderProfilesSummaryCard } from './hub-provider-profiles.sections';
import { resolveAccountActionId } from './hub-provider-profiles.view';
import { useProviderProfilesState } from './useProviderProfilesState';

export function HubProviderProfilesTab() {
  const {
    loading,
    error,
    data,
    busyId,
    displayCards,
    acpModelProfiles,
    isProfileBusy,
    providerCreateSectionProps,
    acpModelCreateSectionProps,
    saveProfile,
    deleteProfile,
    testProfile,
    saveAcpModelProfile,
    deleteAcpModelProfile,
  } = useProviderProfilesState();

  if (loading) return <p className="text-sm text-gray-400">{'\u52a0\u8f7d\u4e2d...'}</p>;
  if (!data) return <p className="text-sm text-gray-400">{'\u6682\u65e0\u6570\u636e'}</p>;

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-500">{error}</p> : null}

      <ProviderProfilesSummaryCard />

      <div role="group" aria-label="Provider Profile List" className="space-y-4">
        <div className="grid grid-cols-1 gap-3">
          {displayCards.map((profile) => (
            <HubProviderProfileItem
              key={profile.id}
              profile={profile}
              acpModelProfiles={acpModelProfiles}
              busy={isProfileBusy(profile)}
              onSave={(payload) => saveProfile(resolveAccountActionId(profile), payload)}
              onDelete={() => deleteProfile(resolveAccountActionId(profile))}
              onTest={() => testProfile(resolveAccountActionId(profile))}
            />
          ))}
        </div>
      </div>

      <CreateApiKeyProfileSection {...providerCreateSectionProps} />

      <HubAcpModelProfilesSection
        profiles={acpModelProfiles}
        busyId={busyId}
        onSave={saveAcpModelProfile}
        onDelete={deleteAcpModelProfile}
      />

      <CreateAcpModelProfileSection {...acpModelCreateSectionProps} />

      <p className="text-xs leading-5 text-[#B59A88]">
        secrets are stored in `.cat-cafe/provider-profiles.secrets.local.json` and
        `.cat-cafe/acp-model-profiles.secrets.local.json`.
      </p>
    </div>
  );
}

