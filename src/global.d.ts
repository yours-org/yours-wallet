import { YoursProviderType } from 'yours-wallet-provider';

declare global {
  interface Window {
    yours: YoursProviderType;
    panda: YoursProviderType;
  }
}

export {};
