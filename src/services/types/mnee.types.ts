type MNEEFee = {
  min: number;
  max: number;
  fee: number;
};

export type MNEEBalance = {
  atomicAmount: number;
  decimalAmount: number;
};

export type MNEEConfig = {
  approver: string;
  feeAddress: string;
  burnAddress: string;
  mintAddress: string;
  fees: MNEEFee[];
  decimals: number;
  tokenId: string;
};

export type MNEEOperation = 'transfer' | 'burn' | 'deploy+mint';

export type MNEEUtxo = {
  data: {
    bsv21: {
      amt: number;
      dec: number;
      icon: string;
      id: string;
      op: string;
      sym: string;
    };
    cosign: {
      address: string;
      cosigner: string;
    };
  };
  height: number;
  idx: number;
  outpoint: string;
  owners: string[];
  satoshis: number;
  score: number;
  script: string;
  txid: string;
  vout: number;
};
