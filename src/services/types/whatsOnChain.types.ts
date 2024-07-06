export type WocUtxo = {
  height: number;
  tx_pos: number;
  tx_hash: string;
  value: number;
};

export type ChainInfo = {
  chain: string;
  blocks: number;
  headers: number;
  bestblockhash: string;
  difficulty: number;
  mediantime: number;
  verificationprogress: number;
  pruned: boolean;
  chainwork: string;
};
