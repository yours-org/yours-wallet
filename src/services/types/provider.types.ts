/**
 * Types previously imported from yours-wallet-provider.
 * Defined locally to remove the external dependency.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type PubKeys = {
  bsvPubKey: string;
  ordPubKey: string;
  identityPubKey: string;
};

export type Addresses = {
  bsvAddress: string;
  ordAddress: string;
  identityAddress: string;
};

export type Balance = {
  bsv: number;
  satoshis: number;
  usdInCents: number;
};

export type MNEEBalance = {
  amount: number;
  decimalAmount: number;
};

export type SocialProfile = {
  displayName: string;
  avatar: string;
};

export enum NetWork {
  Mainnet = 'mainnet',
}

export type SendMNEE = {
  address: string;
  amount: number;
};

export type TransactionFormat = 'tx' | 'beef' | 'ef';

export type Broadcast = {
  rawtx: string;
  format?: TransactionFormat;
  fund?: boolean;
};

export type SendBsv = {
  address?: string;
  paymail?: string;
  satoshis: number;
  data?: string[];
  script?: string;
  inscription?: RawInscription;
};

export type RawInscription = {
  base64Data: string;
  mimeType: string;
  map?: { app: string; type: string; [prop: string]: string };
};

export type LockRequest = {
  address: string;
  blockHeight: number;
  sats: number;
};

export type InternalYoursTags =
  | { label: 'panda'; id: 'bsv'; domain: ''; meta: Record<string, never> }
  | { label: 'panda'; id: 'ord'; domain: ''; meta: Record<string, never> }
  | { label: 'panda'; id: 'identity'; domain: ''; meta: Record<string, never> }
  | { label: 'yours'; id: 'bsv'; domain: ''; meta: Record<string, never> }
  | { label: 'yours'; id: 'ord'; domain: ''; meta: Record<string, never> }
  | { label: 'yours'; id: 'identity'; domain: ''; meta: Record<string, never> };

export type DerivationTag =
  | InternalYoursTags
  | {
      label: string;
      id: string;
      domain: string;
      meta?: { [key: string]: any };
    };

export type TaggedDerivationResponse = {
  address: string;
  pubKey: string;
  tag: DerivationTag;
};

export type OrdinalData = {
  types?: string[];
  insc?: {
    file: { type: string; size: number; hash: string; text?: string; json?: any };
    fields?: any;
    parent?: string;
  };
  map?: { [key: string]: any };
  b?: { type: string; size: number; hash: string; text?: string; json?: any };
  sigma?: { algorithm: string; address: string; signature: string; vin: number }[];
  list?: { price: number; payout: string };
  bsv20?: any;
  lock?: { until: number };
};

export type Origin = {
  outpoint: string;
  nonce?: number;
  data?: OrdinalData;
  num?: string;
  map?: { [key: string]: any };
};

export type Ordinal = {
  txid: string;
  vout: number;
  outpoint: string;
  satoshis: number;
  owner?: string;
  script?: string;
  spend?: string;
  origin?: Origin;
  height: number;
  idx: number;
  data: OrdinalData;
};
