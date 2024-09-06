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

export interface Theme {
  darkAccent: string;
  mainBackground: string;
  lightAccent: string;
  primaryButton: string;
  white: string;
  black: string;
  gray: string;
  errorRed: string;
  warning: string;
  settings: ThemeSettings;
}

export type ColorThemeProps = {
  theme: Theme;
};

// YOURS THEME
// {
//   darkAccent: '#17191E',
//   mainBackground: '#010101',
//   lightAccent: '#A1FF8B',
//   primaryButton: '#34D399',
//   white: '#FFFFFF',
//   black: '#000000',
//   gray: '#98A2B3',
//   errorRed: '#FF4646',
//   warning: '#F79009',
//   settings: {
//     walletName: 'Yours',
//     repo: 'https://github.com/yours-org/yours-wallet',
//     services: {
//       locks: true,
//       ordinals: true,
//       bsv20: true,
//       apps: true,
//     },
//   }
// }

// BSV ASSOCIATION THEME
// {
//   "darkAccent": "#E4E4E4",
//   "mainBackground": "#FFFFFF",
//   "lightAccent": "#0094d4",
//   "primaryButton": "#0020A0",
//   "white": "#000000",
//   "black": "#FFFFFF",
//   "gray": "#030303",
//   "errorRed": "#FF0000",
//   "warning": "#0020A0",
//   "settings": {
//     "walletName": "SPV",
//     "repo": "https://github.com/bitcoin-sv",
//     "services": {
//       "locks": false,
//       "ordinals": false,
//       "bsv20": false,
//       "apps": false
//     }
//   }
// }
