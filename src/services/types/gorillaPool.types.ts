export type GorillaPoolErrorMessage = {
  message: string;
};

export type GorillaPoolBroadcastResponse = {
  txid?: string;
  message?: string;
};

export type Token = {
  txid: string;
  vout: number;
  height: number;
  idx: number;
  tick: string;
  id: string;
  sym: string;
  icon: string;
  max: string;
  lim: string;
  dec: number;
  amt: string;
  supply: string;
  status: number;
  available: string;
  pctMinted: number;
  accounts: number;
  pending: number;
  included: boolean;
  fundAddress: string;
  fundTotal: number;
  fundUsed: number;
  fundBalance: number;
};

export type MarketResponse = {
  txid: string;
  vout: number;
  outpoint: string;
  owner: string;
  script: string;
  spend: string;
  spendHeight: number;
  spendIdx: number;
  height: number;
  idx: number;
  op: string;
  tick: string;
  id: string;
  sym: string;
  dec: number;
  icon: string;
  amt: string;
  status: number;
  reason: string;
  listing: boolean;
  price: number;
  pricePer: number;
  payout: string;
  sale: boolean;
};
