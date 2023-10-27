import { Outpoint } from "../utils/outpoint";
import { UTXO } from "./useWhatsOnChain";


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
}

export interface Inscription {
    json?: any;
    text?: string;
    words?: string[];
    file: File;
}
export class OrdinalTxo {
    txid: string = "";
    vout: number = 0;
    outpoint: Outpoint = new Outpoint();
    satoshis: number = 0;
    accSats: number = 0;
    owner?: string;
    script?: string;
    spend?: string;
    origin?: Origin;
    height: number = 0;
    idx: number = 0;
    data?: TxoData;
}

export type OrdinalResponse = OrdinalTxo[];


export type MapSubType = "collection" | "collectionItem";


export interface OrdSchema {
    app: string;
    type: string;
    name: string;
    subType?: MapSubType;
    subTypeData?: any;
    royalties?: string;
    previewUrl?: string;
}

type GPFile = {
    hash: string;
    size: number;
    type: string;
    url: string;
};

export interface OrdUtxo extends UTXO {
    type: string;
    origin: string;
    outpoint: string;
    listing: boolean;
    num: number;
    file: GPFile;
    map: OrdSchema;
}

export interface Inscription {
    json?: any;
    text?: string;
    words?: string[];
    file: File;
}