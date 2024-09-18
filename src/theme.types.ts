export type ThemeServices = {
  locks: boolean;
  ordinals: boolean;
  bsv20: boolean;
  apps: boolean;
};

export type ThemeSettings = {
  walletName: string;
  repo: string;
  services: ThemeServices;
};

type GlobalColors = {
  primaryTheme: 'light' | 'dark';
  row: string;
  walletBackground: string;
  white: string;
  black: string;
  gray: string;
};

type ComponentColors = {
  bottomMenuBackground: string;
  bottomMenuText: string;
  ordinalSelectedBorder: string;
  ordinalTypeUnsupported: string;
  ordinalTypePlainText: string;
  ordinalTypeJson: string;
  pageLoaderSpinner: string;
  pageLoaderSpinnerBorder: string;
  pageLoaderText: string;
  primaryButtonLeftGradient: string;
  primaryButtonRightGradient: string;
  primaryButtonText: string;
  progressBar: string;
  progressBarTrack: string;
  queueBannerSyncing: string;
  queueBannerSyncingText: string;
  queueBannerSynced: string;
  queueBannerSyncedText: string;
  secondaryOutlineButtonGradientLeft: string;
  secondaryOutlineButtonGradientRight: string;
  secondaryOutlineButtonText: string;
  snackbarError: string;
  snackbarSuccess: string;
  snackbarWarning: string;
  snackbarWarningText: string;
  snackbarErrorText: string;
  snackbarSuccessText: string;
  tabSelectedLeftGradient: string;
  tabSelectedRightGradient: string;
  tabSelectedText: string;
  tabUnselected: string;
  tabUnselectedText: string;
  toggleSwitchOn: string;
  warningButton: string;
  warningButtonText: string;
};

export type ThemeColors = {
  global: GlobalColors;
  component: ComponentColors;
};

export interface Theme {
  color: ThemeColors;
  settings: ThemeSettings;
}

export type WhiteLabelTheme = {
  theme: Theme;
};
