import { useEffect, useState } from "react";
import { storage } from "../utils/storage";
import { HOSTED_PANDA_IMAGE } from "../utils/constants";

export type SocialProfile = {
  displayName: string;
  avatar: string;
};

export const useSocialProfile = () => {
  const [socialProfile, setSocialProfile] = useState<
    SocialProfile | undefined
  >();

  useEffect(() => {
    storage.get(["socialProfile"], (result) => {
      if (
        result?.socialProfile &&
        !window.location.href.includes("localhost")
      ) {
        setSocialProfile(result.socialProfile);
      }
    });
  }, []);

  useEffect(() => {
    storage.set({
      socialProfile: {
        displayName: socialProfile?.displayName
          ? socialProfile.displayName
          : "Panda Wallet",
        avatar: socialProfile?.avatar
          ? socialProfile.avatar
          : HOSTED_PANDA_IMAGE,
      },
    });
  }, [socialProfile]);

  return {
    socialProfile,
    setSocialProfile,
  };
};
