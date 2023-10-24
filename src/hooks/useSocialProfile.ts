import { useEffect, useState } from "react";
import { HOSTED_PANDA_IMAGE } from "../utils/constants";
import { storage } from "../utils/storage";

export type SocialProfile = {
  displayName: string;
  avatar: string;
};

export const useSocialProfile = () => {
  const [socialProfile, setSocialProfile] = useState<SocialProfile>({
    displayName: "Panda Wallet",
    avatar: HOSTED_PANDA_IMAGE,
  });

  useEffect(() => {
    storage.get("appState", (result) => {
      const { appState } = result;
      if (appState?.socialProfile) {
        setSocialProfile(appState.socialProfile);
      }
    });
  }, []);

  useEffect(() => {
    if (!socialProfile) return;
    storage.get("appState", (result) => {
      const { appState } = result;
      if (appState && !window.location.href.includes("localhost")) {
        appState.socialProfile.displayName = socialProfile.displayName;
        appState.socialProfile.avatar = socialProfile.avatar;
        storage.set({ appState });
      }
    });
  }, [socialProfile]);

  return {
    socialProfile,
    setSocialProfile,
  };
};
