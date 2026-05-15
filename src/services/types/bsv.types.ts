export interface UTXO {
  satoshis: number;
  vout: number;
  txid: string;
  script: string;
}

export interface StoredUtxo extends UTXO {
  spent: boolean;
  spentUnixTime: number;
}
