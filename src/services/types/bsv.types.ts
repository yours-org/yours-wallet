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

export type SendBsvResponse = {
  txid?: string;
  rawtx?: string;
  error?: string;
};

export type FundRawTxResponse = { rawtx?: string; error?: string };

export type MimeTypes =
  | 'text/plain'
  | 'text/html'
  | 'text/css'
  | 'application/javascript'
  | 'application/json'
  | 'application/xml'
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/svg+xml'
  | 'audio/mpeg'
  | 'audio/wav'
  | 'audio/wave'
  | 'video/mp4'
  | 'application/pdf'
  | 'application/msword'
  | 'application/vnd.ms-excel'
  | 'application/vnd.ms-powerpoint'
  | 'application/zip'
  | 'application/x-7z-compressed'
  | 'application/x-gzip'
  | 'application/x-tar'
  | 'application/x-bzip2';

export type MAP = { app: string; type: string; [prop: string]: string };

export type RawInscription = {
  base64Data: string;
  mimeType: MimeTypes;
  map?: MAP;
};

export type LockData = {
  totalLocked: number;
  unlockable: number;
  nextUnlock: number;
};
