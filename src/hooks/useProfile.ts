import { useEffect, useState } from "react";
import { HOSTED_PANDA_IMAGE } from "../utils/constants";
import { storage } from "../utils/storage";

export type UserProfile = {
  displayName: string;
  avatar: string;
};

export const useProfile = () => {
  const [profile, setProfile] = useState<UserProfile>({
    displayName: "Panda Wallet",
    avatar: HOSTED_PANDA_IMAGE,
  });

  useEffect(() => {
    storage.get("appState", (result) => {
      const { appState } = result;
      if (appState?.profile) {
        setProfile(appState.profile);
      }
    });
  }, []);

  useEffect(() => {
    if (!profile) return;
    storage.get("appState", (result) => {
      const { appState } = result;
      if (appState && !window.location.href.includes("localhost")) {
        appState.profile.displayName = profile.displayName;
        appState.profile.avatar = profile.avatar;
        storage.set({ appState });
      }
    });
  }, [profile]);

  return {
    profile,
    setProfile,
  };
};
