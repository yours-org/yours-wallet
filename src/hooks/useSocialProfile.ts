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
    storage.get(["socialProfile"], (result) => {
      if (result?.socialProfile) {
        setSocialProfile(result.socialProfile);
      }
    });
  }, []);

  useEffect(() => {
    if (!socialProfile) return;
    storage.get(["socialProfile"], (result) => {
      if (
        result?.socialProfile &&
        !window.location.href.includes("localhost")
      ) {
        const sp = result.socialProfile;
        sp.displayName = socialProfile.displayName;
        sp.avatar = socialProfile.avatar;
        storage.set({ socialProfile: sp });
      }
    });
  }, [socialProfile]);

  return {
    socialProfile,
    setSocialProfile,
  };
};
