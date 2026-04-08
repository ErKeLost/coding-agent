"use client";

import {
  DEFAULT_AVATAR_PROFILE_ID,
  getAvatarProfileById,
  getDefaultAvatarProfiles,
  normalizeAvatarProfiles,
  removeAvatarProfile,
  type AvatarProfile,
} from "@/lib/avatar/models";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const DEFAULT_MODEL_ID = "openrouter/openai/gpt-5.4";
const LEGACY_DEFAULT_MODEL_IDS = new Set([
  "openrouter/qwen/qwen3.6-plus:free",
  "openrouter/z-ai/glm-5v-turbo",
  "openrouter/openai/gpt-5.4-mini",
  "openrouter/openai/gpt-5.4-nano",
]);

type ReasoningOpenState = Record<string, boolean>;
type ReasoningStateUpdater =
  | ReasoningOpenState
  | ((previous: ReasoningOpenState) => ReasoningOpenState);

type WorkspaceShellStore = {
  model: string;
  modelByThread: Record<string, string>;
  avatarProfileId: string;
  avatarProfiles: AvatarProfile[];
  modelDialogOpen: boolean;
  gitDialogOpen: boolean;
  terminalExpanded: boolean;
  reasoningOpenState: ReasoningOpenState;
  setModel: (model: string) => void;
  setThreadModel: (threadId: string, model: string) => void;
  setAvatarProfileId: (profileId: string) => void;
  upsertAvatarProfile: (profile: AvatarProfile) => void;
  removeAvatarProfile: (profileId: string) => void;
  syncThreadModel: (threadId: string, fallbackModel?: string) => void;
  setModelDialogOpen: (open: boolean) => void;
  setGitDialogOpen: (open: boolean) => void;
  setTerminalExpanded: (
    expanded: boolean | ((current: boolean) => boolean),
  ) => void;
  setReasoningOpenState: (updater: ReasoningStateUpdater) => void;
  resetReasoningOpenState: () => void;
};

const normalizeModelSelection = (value: string | undefined) => {
  if (!value?.trim()) return DEFAULT_MODEL_ID;
  return LEGACY_DEFAULT_MODEL_IDS.has(value) ? DEFAULT_MODEL_ID : value;
};

const normalizeAvatarProfileSelection = (
  profiles: AvatarProfile[],
  value: string | undefined,
) => getAvatarProfileById(profiles, value)?.id ?? DEFAULT_AVATAR_PROFILE_ID;

export const useWorkspaceShellStore = create<WorkspaceShellStore>()(
  persist(
    (set) => ({
      model: DEFAULT_MODEL_ID,
      modelByThread: {},
      avatarProfileId: DEFAULT_AVATAR_PROFILE_ID,
      avatarProfiles: getDefaultAvatarProfiles(),
      modelDialogOpen: false,
      gitDialogOpen: false,
      terminalExpanded: false,
      reasoningOpenState: {},
      setModel: (model) => set({ model }),
      setThreadModel: (threadId, model) =>
        set((state) => ({
          model,
          modelByThread: threadId
            ? {
                ...state.modelByThread,
                [threadId]: model,
              }
            : state.modelByThread,
        })),
      setAvatarProfileId: (avatarProfileId) =>
        set((state) => ({
          avatarProfileId: normalizeAvatarProfileSelection(
            state.avatarProfiles,
            avatarProfileId,
          ),
        })),
      upsertAvatarProfile: (profile) =>
        set((state) => {
          const nextProfiles = normalizeAvatarProfiles([
            ...state.avatarProfiles.filter((entry) => entry.id !== profile.id),
            profile,
          ]);
          return {
            avatarProfiles: nextProfiles,
            avatarProfileId: normalizeAvatarProfileSelection(
              nextProfiles,
              profile.id,
            ),
          };
        }),
      removeAvatarProfile: (profileId) =>
        set((state) => {
          const nextProfiles = removeAvatarProfile(state.avatarProfiles, profileId);
          return {
            avatarProfiles: nextProfiles,
            avatarProfileId: normalizeAvatarProfileSelection(
              nextProfiles,
              state.avatarProfileId === profileId
                ? DEFAULT_AVATAR_PROFILE_ID
                : state.avatarProfileId,
            ),
          };
        }),
      syncThreadModel: (threadId, fallbackModel) =>
        set((state) => {
          if (!threadId) {
            return {
              model: normalizeModelSelection(fallbackModel ?? state.model),
            };
          }
          const normalizedFallback = normalizeModelSelection(
            fallbackModel ?? state.model,
          );
          const existing = state.modelByThread[threadId];
          if (existing) {
            return {
              model: normalizeModelSelection(existing),
            };
          }
          return {
            model: normalizedFallback,
            modelByThread: {
              ...state.modelByThread,
              [threadId]: normalizedFallback,
            },
          };
        }),
      setModelDialogOpen: (modelDialogOpen) => set({ modelDialogOpen }),
      setGitDialogOpen: (gitDialogOpen) => set({ gitDialogOpen }),
      setTerminalExpanded: (terminalExpanded) =>
        set((state) => ({
          terminalExpanded:
            typeof terminalExpanded === "function"
              ? terminalExpanded(state.terminalExpanded)
              : terminalExpanded,
        })),
      setReasoningOpenState: (updater) =>
        set((state) => ({
          reasoningOpenState:
            typeof updater === "function"
              ? updater(state.reasoningOpenState)
              : updater,
        })),
      resetReasoningOpenState: () => set({ reasoningOpenState: {} }),
    }),
    {
      name: "rovix-workspace-shell",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        model: state.model,
        modelByThread: state.modelByThread,
        avatarProfileId: state.avatarProfileId,
        avatarProfiles: state.avatarProfiles,
      }),
      merge: (persistedState, currentState) => {
        const persisted =
          (persistedState as Partial<WorkspaceShellStore> | undefined) ?? {};
        const normalizedAvatarProfiles = normalizeAvatarProfiles(
          persisted.avatarProfiles,
        );
        return {
          ...currentState,
          ...persisted,
          model: normalizeModelSelection(
            typeof persisted.model === "string"
              ? persisted.model
              : currentState.model,
          ),
          modelByThread: Object.fromEntries(
            Object.entries(persisted.modelByThread ?? {}).map(([threadId, value]) => [
              threadId,
              normalizeModelSelection(typeof value === "string" ? value : DEFAULT_MODEL_ID),
            ]),
          ),
          avatarProfiles: normalizedAvatarProfiles,
          avatarProfileId: normalizeAvatarProfileSelection(
            normalizedAvatarProfiles,
            typeof persisted.avatarProfileId === "string"
              ? persisted.avatarProfileId
              : currentState.avatarProfileId,
          ),
        };
      },
    },
  ),
);
