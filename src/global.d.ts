import { YoursProviderType } from 'yours-wallet-provider';
import { Theme } from './theme.types';

declare global {
  interface Window {
    yours: YoursProviderType;
    panda: YoursProviderType;
  }
}

declare module 'styled-components' {
  export interface DefaultTheme extends Theme {}
}

export {};
