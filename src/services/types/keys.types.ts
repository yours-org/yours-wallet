export type KeyStorage = {
  encryptedKeys: string; // stringified Keys object (hint: search for "Keys" type)
  passKey: string;
  salt: string;
};

export type WifKeys = {
  payPk: string;
  ordPk: string;
  mnemonic?: string;
  identityPk?: string;
};

export type SupportedWalletImports = 'relayx' | 'twetch' | 'panda' | 'yours' | 'wif'; // panda and yours are the same
