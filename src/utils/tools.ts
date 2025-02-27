import { LockRequest, NetWork, SendBsv, TransactionFormat } from 'yours-wallet-provider';
import { Script, Transaction, Utils } from '@bsv/sdk';
import { LOCKUP_PREFIX, LOCKUP_SUFFIX, MAINNET_ADDRESS_PREFIX, TESTNET_ADDRESS_PREFIX } from './constants';

export const getCurrentUtcTimestamp = (): number => {
  const currentDate = new Date();
  const utcTimestamp = currentDate.getTime();
  return Math.floor(utcTimestamp);
};

export const isAddressOnRightNetwork = (network: NetWork, address: string) => {
  switch (network) {
    case NetWork.Mainnet:
      return address.startsWith('1');
    case NetWork.Testnet:
      return !address.startsWith('1');
  }
};

export const convertAddressToTestnet = (address: string) => {
  return Utils.toBase58Check(Utils.fromBase58Check(address).data as number[], [TESTNET_ADDRESS_PREFIX]);
};

export const convertAddressToMainnet = (address: string) => {
  return Utils.toBase58Check(Utils.fromBase58Check(address).data as number[], [MAINNET_ADDRESS_PREFIX]);
};

export const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const getTxFromRawTxFormat = (rawTx: string | number[], format: TransactionFormat) => {
  const tx =
    format === 'tx'
      ? Transaction.fromHex(rawTx as string)
      : format === 'beef'
        ? Transaction.fromAtomicBEEF(rawTx as number[])
        : Transaction.fromEF(rawTx as number[]);
  return tx;
};

export const getErrorMessage = (error: string | undefined) => {
  switch (error) {
    case 'invalid-password':
      return 'Invalid Password!';

    case 'no-keys':
      return 'No keys were found!';

    case 'insufficient-funds':
      return 'Insufficient Funds!';

    case 'fee-too-high':
      return 'Miner fee too high!';

    case 'no-bsv20-utxo':
      return 'No bsv20 token found!';

    case 'token-details':
      return 'Could not gather token details!';

    case 'no-ord-utxo':
      return 'Could not locate the ordinal!';

    case 'broadcast-error':
      return 'There was an error broadcasting the tx!';

    case 'source-tx-not-found':
      return 'Source transaction not found!';

    case 'no-account':
      return 'No account found!';

    case 'no-wallet-address':
      return 'No wallet address found!';

    case 'invalid-data':
      return 'Invalid data!';

    case 'invalid-request':
      return 'Invalid request!';

    case 'no-tag-inscription-txid':
      return 'Error creating tag inscription';

    case 'unknown-address':
      return 'Unknown Address!';

    case 'key-type':
      return 'Key type does not exist!';

    default:
      return 'An unknown error has occurred! Try again.';
  }
};

export const decimalToHex = (d: number) => {
  // helper function to convert integer to hex
  const h = d.toString(16);
  return h.length % 2 ? '0' + h : h;
};

export const changeEndianness = (string: string) => {
  // change endianess of hex value before placing into ASM script
  const result = [];
  let len = string.length - 2;
  while (len >= 0) {
    result.push(string.substr(len, 2));
    len -= 2;
  }
  return result.join('');
};

export const int2Hex = (int: number) => {
  const unreversedHex = decimalToHex(int);
  return changeEndianness(unreversedHex);
};

export const convertLockReqToSendBsvReq = (lockData: LockRequest[]) => {
  return lockData.map((d) => {
    const addressHex = Utils.fromBase58Check(d.address, 'hex').data as string;
    const nLockTimeHexHeight = int2Hex(d.blockHeight);
    const scriptTemplate = `${LOCKUP_PREFIX} ${addressHex} ${nLockTimeHexHeight} ${LOCKUP_SUFFIX}`;
    const lockingScript = Script.fromASM(scriptTemplate);
    return {
      satoshis: d.sats,
      script: lockingScript.toHex(),
    } as SendBsv;
  });
};
