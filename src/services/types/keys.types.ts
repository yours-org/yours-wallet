export type WifKeys = {
  payPk: string;
  ordPk: string;
  mnemonic?: string;
  identityPk?: string;
};

export type SupportedWalletImports = 'relayx' | 'twetch' | 'panda' | 'other' | 'yours' | 'wif' | 'master'; // panda and yours are the same
