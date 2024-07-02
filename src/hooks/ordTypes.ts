import { Outpoint } from '../utils/outpoint';

export interface Claim {
  sub: string;
  type: string;
  value: string;
}

export interface Sigma {
  algorithm: string;
  address: string;
  signature: string;
  vin: number;
}

export class Origin {
  outpoint: Outpoint = new Outpoint();
  data?: TxoData;
  num?: number;
  map?: { [key: string]: any };
  claims?: Claim[];
}

export enum Bsv20Status {
  Invalid = -1,
  Pending = 0,
  Valid = 1,
}

export type InscData = {
  file: {
    hash: string;
    size: number;
    type: string;
  };
  text: string;
  json: any;
};

export class TxoData {
  types?: string[];
  insc?: InscData;
  map?: { [key: string]: any };
  b?: File;
  sigma?: Sigma[];
  list?: {
    price: number;
    payout: string;
  };
  bsv20?: {
    id?: Outpoint;
    p: string;
    op: string;
    tick?: string;
    amt: string;
    status?: Bsv20Status;
  };
  lock?: {
    address: string;
    until: number;
  };
}

export interface Inscription {
  json?: any;
  text?: string;
  words?: string[];
  file: File;
}
export class OrdinalTxo {
  txid = '';
  vout = 0;
  outpoint = new Outpoint();
  satoshis = 0;
  accSats = 0;
  owner?: string;
  script?: string;
  spend?: string;
  origin?: Origin;
  height = 0;
  idx = 0;
  data?: TxoData;
}

export class BSV20Txo {
  txid = '';
  vout = 0;
  outpoint = '';
  owner?: string;
  script?: string;
  spend?: string;
  height = 0;
  idx = 0;
  op? = '';
  tick?: string;
  id?: string;
  amt = '';
  status = 0;
  reason? = '';
  listing = false;
  price?: number;
  pricePer?: number;
  payout?: string;
  pricePerUnit?: number;
}

export type OrdinalResponse = OrdinalTxo[];

export type MapSubType = 'collection' | 'collectionItem';

export interface OrdSchema {
  app: string;
  type: string;
  name: string;
  subType?: MapSubType;
  subTypeData?: any;
  royalties?: string;
  previewUrl?: string;
}

export interface Inscription {
  json?: any;
  text?: string;
  words?: string[];
  file: File;
}
