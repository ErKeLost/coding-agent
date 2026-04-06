"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  createEmptyBehaviorProfile,
  normalizeBehaviorProfile,
  recordBehaviorEvent,
  summarizeBehaviorProfile,
  type BehaviorEvent,
  type UserBehaviorProfile,
} from "@/lib/user-behavior-profile";

type UserBehaviorStore = {
  profile: UserBehaviorProfile;
  summary: string;
  recordEvent: (event: Omit<BehaviorEvent, "at"> & { at?: number }) => void;
  resetProfile: () => void;
};

const refreshSummary = (profile: UserBehaviorProfile) =>
  summarizeBehaviorProfile(profile);

export const useUserBehaviorStore = create<UserBehaviorStore>()(
  persist(
    (set) => ({
      profile: createEmptyBehaviorProfile(),
      summary: "",
      recordEvent: (event) =>
        set((state) => {
          const nextProfile = recordBehaviorEvent(state.profile, event);
          return {
            profile: nextProfile,
            summary: refreshSummary(nextProfile),
          };
        }),
      resetProfile: () => {
        const nextProfile = createEmptyBehaviorProfile();
        set({
          profile: nextProfile,
          summary: refreshSummary(nextProfile),
        });
      },
    }),
    {
      name: "rovix-user-behavior-profile",
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => {
        const persisted =
          (persistedState as Partial<UserBehaviorStore> | undefined) ?? {};
        const profile = normalizeBehaviorProfile(persisted.profile);
        return {
          ...currentState,
          ...persisted,
          profile,
          summary: refreshSummary(profile),
        };
      },
      partialize: (state) => ({
        profile: state.profile,
      }),
    },
  ),
);
