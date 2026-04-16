import { createContext } from 'react';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import { KeysService } from '../services/Keys.service';
import type { OneSatContext } from '@1sat/actions';
import type { Transaction } from '@bsv/sdk';
import type { ParseContext, Txo, Outpoint } from '@1sat/wallet-browser';

/**
 * Structural type describing the subset of the legacy OneSatWallet used across
 * the UI — ingestTransaction (faucet flow), parseTransaction (tx approval),
 * parseOutput (lock listing), listOutputs (CWI passthrough) and close (sign-out).
 *
 * Current BRC-100 / CWI setups do NOT wire this up, which is why the field is
 * optional and every caller uses `wallet?.…`. Keeping a structural shape lets
 * TypeScript still catch typos while reflecting runtime reality.
 */
export interface LegacyWallet {
  close?: () => Promise<void> | void;
  ingestTransaction?: (
    tx: Transaction,
    source: string,
  ) => Promise<{ parseContext?: { txid?: string }; txid?: string } | undefined>;
  parseTransaction?: (tx: Transaction | string, isBroadcasted?: boolean) => Promise<ParseContext>;
  parseOutput?: (output: { lockingScript: unknown; satoshis: number }, outpoint: Outpoint) => Promise<Txo>;
  listOutputs?: (args: {
    basket?: string;
    includeTags?: boolean;
    limit?: number;
  }) => Promise<{ outputs: Array<{ outpoint: string; satoshis: number; lockingScript?: string; tags?: string[] }> }>;
}

export interface ServiceContextProps {
  chromeStorageService: ChromeStorageService;
  keysService: KeysService;
  isLocked: boolean;
  isReady: boolean;
  setIsLocked: (isLocked: boolean) => void;
  lockWallet: () => Promise<void>;
  /** API context for calling 1Sat actions - uses ChromeCWI to communicate with service worker */
  apiContext: OneSatContext;
  /** Legacy wallet interface. Optional because current BRC-100 setups don't wire it. */
  wallet?: LegacyWallet;
}

export const ServiceContext = createContext<ServiceContextProps | undefined>(undefined);
