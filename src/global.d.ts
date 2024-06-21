import { YoursProvider } from './inject';

declare global {
  interface Window {
    yours: YoursProvider;
    panda: YoursProvider;
  }
}

export {};
