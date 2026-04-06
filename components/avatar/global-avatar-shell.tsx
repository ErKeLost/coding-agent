"use client";

import { AvatarCornerWidget } from "@/components/avatar/avatar-corner-widget";
import { useWorkspaceShellStore } from "@/app/[id]/_stores/workspace-shell-store";
import { getAvatarProfileById } from "@/lib/avatar/models";
import { useAvatarShellStore } from "@/lib/avatar/avatar-shell-store";

export function GlobalAvatarShell() {
  const avatarProfileId = useWorkspaceShellStore((state) => state.avatarProfileId);
  const avatarProfiles = useWorkspaceShellStore((state) => state.avatarProfiles);
  const directive = useAvatarShellStore((state) => state.directive);

  const selectedAvatarProfile = getAvatarProfileById(
    avatarProfiles,
    avatarProfileId,
  );

  return (
    <AvatarCornerWidget
      directive={directive}
      modelPath={selectedAvatarProfile?.modelPath}
    />
  );
}
