import { LockRequest, SendBsv, TransactionFormat } from 'yours-wallet-provider';
import { Script, Transaction, Utils } from '@bsv/sdk';
import {
  Bsv21Indexer,
  FundIndexer,
  InscriptionIndexer,
  LockIndexer,
  MapIndexer,
  OpNSIndexer,
  OrdLockIndexer,
  OriginIndexer,
  Outpoint,
  SigmaIndexer,
  type Indexer,
  type ParseContext,
  type Txo,
} from '@1sat/wallet-browser';
import type { OneSatContext } from '@1sat/actions';
import { LOCKUP_PREFIX, LOCKUP_SUFFIX } from './constants';

export const getCurrentUtcTimestamp = (): number => {
  const currentDate = new Date();
  const utcTimestamp = currentDate.getTime();
  return Math.floor(utcTimestamp);
};

export const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const getTxFromRawTxFormat = (rawTx: string | number[], format: TransactionFormat) => {
  switch (format) {
    case 'beef':
      return Transaction.fromAtomicBEEF(rawTx as number[]);
    case 'ef':
      return Transaction.fromEF(rawTx as number[]);
    default:
      return Transaction.fromHex(rawTx as string);
  }
};

/**
 * Parse a raw BSV transaction through all 1Sat indexers and return a ParseContext
 * suitable for rendering with TxPreview. Mirrors OneSatWallet.parseTransaction() —
 * it hydrates source transactions via services.beef, runs every indexer's parse()
 * on inputs and outputs, then runs summarize() for the transaction-level view.
 *
 * This replaces the old spv-store `oneSatSPV.parseTx(tx)` used on main.
 */
export const parseRawTransaction = async (tx: Transaction, apiContext: OneSatContext): Promise<ParseContext> => {
  const services = apiContext.services;
  if (!services) throw new Error('services unavailable');
  const network = 'mainnet' as const;

  // Hydrate source transactions (needed so inputs can be decoded into spends)
  for (const input of tx.inputs) {
    if (!input.sourceTransaction && input.sourceTXID) {
      try {
        const rawTx = await services.beef.getRawTx(input.sourceTXID);
        input.sourceTransaction = Transaction.fromBinary(Array.from(rawTx));
      } catch (err) {
        console.warn(`Could not load source tx ${input.sourceTXID}:`, err);
      }
    }
  }

  const emptyOwners = new Set<string>();
  // `services` is typed against a nested copy of @1sat/client, so we cast when
  // passing to indexers that come from the top-level @1sat/wallet-browser.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = services as any;
  const indexers: Indexer[] = [
    new FundIndexer(emptyOwners, network),
    new InscriptionIndexer(emptyOwners, network),
    new OriginIndexer(emptyOwners, network, svc),
    new Bsv21Indexer(emptyOwners, network, svc),
    new LockIndexer(emptyOwners, network),
    new MapIndexer(emptyOwners, network),
    new OrdLockIndexer(emptyOwners, network),
    new SigmaIndexer(emptyOwners, network),
    new OpNSIndexer(emptyOwners, network),
  ];

  const runIndexers = async (txo: Txo) => {
    for (const indexer of indexers) {
      try {
        const result = await indexer.parse(txo);
        if (!result) continue;
        txo.data[indexer.tag] = {
          data: result.data,
          tags: result.tags,
          content: result.content,
        };
        if (result.owner && !txo.owner) txo.owner = result.owner;
        if (result.basket && !txo.basket) txo.basket = result.basket;
      } catch (err) {
        console.warn(`Indexer ${indexer.tag} failed on ${txo.outpoint.toString()}:`, err);
      }
    }
  };

  const txid = tx.id('hex');
  const ctx: ParseContext = {
    tx,
    txid,
    txos: [],
    spends: [],
    summary: {},
    indexers,
  };

  // Parse inputs (as spends of their source outputs)
  for (let vin = 0; vin < tx.inputs.length; vin++) {
    const input = tx.inputs[vin];
    if (!input.sourceTransaction) continue;
    const sourceTxid = input.sourceTransaction.id('hex');
    const spend: Txo = {
      output: input.sourceTransaction.outputs[input.sourceOutputIndex],
      outpoint: new Outpoint(sourceTxid, input.sourceOutputIndex),
      data: {},
    };
    await runIndexers(spend);
    ctx.spends.push(spend);
  }

  // Parse outputs
  for (let vout = 0; vout < tx.outputs.length; vout++) {
    const txo: Txo = {
      output: tx.outputs[vout],
      outpoint: new Outpoint(txid, vout),
      data: {},
    };
    await runIndexers(txo);
    ctx.txos.push(txo);
  }

  // Transaction-level summaries (e.g. bsv21 totals, fund balance deltas)
  for (const indexer of indexers) {
    try {
      const summary = await indexer.summarize(ctx, true);
      if (summary) ctx.summary[indexer.tag] = summary;
    } catch (err) {
      console.warn(`Indexer ${indexer.tag} summarize failed:`, err);
    }
  }

  return ctx;
};

export const getErrorMessage = (error: string | unknown | undefined) => {
  // Check for StoragePaymentError by code (works without importing the class)
  if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'storage-payment-failed') {
    return 'Your remote storage requires a payment that could not be completed. Please ensure you have enough BSV in your wallet.';
  }
  // Check for StoragePaymentError message pattern when the error was stringified
  if (typeof error === 'string' && error.includes('storage-payment-failed')) {
    return 'Your remote storage requires a payment that could not be completed. Please ensure you have enough BSV in your wallet.';
  }
  switch (error) {
    case 'invalid-password':
      return 'Invalid Password!';

    case 'no-keys':
      return 'No keys were found!';

    case 'insufficient-funds':
      return 'Insufficient Funds!';

    case 'fee-too-high':
      return 'Miner fee too high!';

    case 'no-bsv21-utxo':
      return 'No BSV21 token found!';

    case 'token-details':
      return 'Could not gather token details!';

    case 'no-ord-utxo':
      return 'Could not locate the ordinal!';

    case 'broadcast-error':
      return 'There was an error broadcasting the tx!';

    case 'insufficient-tokens':
      return 'Insufficient token balance!';

    case 'overlay-validation-failed':
      return 'Could not validate tokens against the overlay!';

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

    case 'storage-payment-failed':
      return 'Your remote storage requires a payment that could not be completed. Please ensure you have enough BSV in your wallet.';

    default:
      return 'An unknown error has occurred! Try again.';
  }
};

/** Check if an error is a storage payment failure (code-based, no import needed) */
export const isStoragePaymentError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'storage-payment-failed';

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
