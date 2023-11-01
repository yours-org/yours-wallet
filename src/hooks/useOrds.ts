import { useEffect, useState } from 'react';
import { FEE_PER_BYTE, GP_BASE_URL, GP_TESTNET_BASE_URL, O_LOCK_PREFIX, O_LOCK_SUFFIX } from '../utils/constants';
import { useKeys } from './useKeys';
import { UTXO, useWhatsOnChain } from './useWhatsOnChain';
import { sendOrdinal } from 'js-1sat-ord-web';
import { P2PKHAddress, PrivateKey, Script, SigHash, Transaction, TxIn, TxOut } from 'bsv-wasm-web';
import { useBsvWasm } from './useBsvWasm';
import { NetWork } from '../utils/network';
import { useNetwork } from './useNetwork';
import { useGorillaPool } from './useGorillaPool';

import { OrdinalResponse, OrdinalTxo } from './ordTypes';
import { createTransferP2PKH, createTransferV2P2PKH, getAmtv1, getAmtv2, isBSV20v2 } from '../utils/ordi';
import { useTokens } from './useTokens';
import { storage } from '../utils/storage';

export class InscriptionData {
  type?: string = '';
  data?: Buffer = Buffer.alloc(0);
}

export type OrdOperationResponse = {
  txid?: string;
  error?: string;
};

export type BuildAndBroadcastResponse = {
  txid: string;
  rawTx: string;
};

export type GPArcResponse = {
  blockHash: string;
  blockHeight: number;
  extraInfo: string;
  status: number;
  timestamp: string;
  title: string;
  txStatus: string;
  txid: string;
};

export interface BSV20 {
  tick: string;
  dec: number;
  all: Balance;
  listed: Balance;
}

export interface Balance {
  confirmed: bigint;
  pending: bigint;
}

export type Web3TransferOrdinalRequest = {
  address: string;
  origin: string;
  outpoint: string;
};

export type ListOrdinal = {
  outpoint: string;
  price: number;
  password: string;
};

export const useOrds = () => {
  const { ordAddress, retrieveKeys, verifyPassword, ordPubKey, bsvAddress } = useKeys();

  const [ordinals, setOrdinals] = useState<OrdinalResponse>([]);
  const [bsv20s, setBSV20s] = useState<Array<BSV20>>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { bsvWasmInitialized } = useBsvWasm();
  const { network } = useNetwork();
  const { cacheTokenInfos } = useTokens();
  const { getUtxos, getRawTxById, getSuitableUtxo } = useWhatsOnChain();
  const { getOrdUtxos, broadcastWithGorillaPool, getUtxoByOutpoint, getMarketData, getBsv20Balances, getBSV20Utxos } =
    useGorillaPool();
  const getOrdinalsBaseUrl = () => {
    return network === NetWork.Mainnet ? GP_BASE_URL : GP_TESTNET_BASE_URL;
  };

  const getOrdinals = async () => {
    try {
      //   setIsProcessing(true); // TODO: set this to true if call is taking more than a second
      //TODO: Implement infinite scroll to handle instances where user has more than 100 items.

      const ordList = await getOrdUtxos(ordAddress);
      setOrdinals(ordList);

      const bsv20List: Array<BSV20> = await getBsv20Balances(ordAddress);

      await cacheTokenInfos(bsv20List.map((bsv20) => bsv20.tick));

      setBSV20s(bsv20List.filter((o) => o.all.confirmed > 0n));
    } catch (error) {
      console.error('getOrdinals failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!ordAddress) return;
    getOrdinals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordAddress]);

  const transferOrdinal = async (
    destinationAddress: string,
    outpoint: string,
    password: string,
  ): Promise<OrdOperationResponse> => {
    try {
      if (!bsvWasmInitialized) throw Error('bsv-wasm not initialized!');
      setIsProcessing(true);

      const isAuthenticated = await verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }

      const keys = await retrieveKeys(password);
      if (!keys?.ordAddress || !keys.ordWif || !keys.walletAddress || !keys.walletWif) {
        throw Error('No keys');
      }
      const ordinalAddress = keys.ordAddress;
      const ordWifPk = keys.ordWif;
      const fundingAndChangeAddress = keys.walletAddress;
      const payWifPk = keys.walletWif;

      const fundingUtxos = await getUtxos(fundingAndChangeAddress);

      if (!fundingUtxos || fundingUtxos.length === 0) {
        return { error: 'insufficient-funds' };
      }

      const ordUtxos = await getOrdinalUtxos(ordinalAddress);
      if (!ordUtxos) throw Error('No ord utxos!');
      const ordUtxo = ordUtxos.find((o) => o.outpoint.toString() === outpoint);

      if (!ordUtxo) {
        return { error: 'no-ord-utxo' };
      }

      if (!ordUtxo.script) {
        const ordRawTx = await getRawTxById(ordUtxo.txid);
        if (!ordRawTx) throw Error('Could not get raw tx');
        const tx = Transaction.from_hex(ordRawTx);
        const out = tx.get_output(ordUtxo.vout);
        const script = out?.get_script_pub_key();
        if (script) {
          ordUtxo.script = script.to_asm_string();
        }
      }

      const fundingUtxo = getSuitableUtxo(fundingUtxos, 50);

      if (!fundingUtxo?.script) {
        const fundingRawTx = await getRawTxById(fundingUtxo.txid);
        if (!fundingRawTx) throw Error('Could not get raw tx');
        const tx = Transaction.from_hex(fundingRawTx);
        const out = tx.get_output(ordUtxo.vout);
        const script = out?.get_script_pub_key();
        if (script) {
          fundingUtxo.script = script.to_asm_string();
        }
      }

      if (!fundingUtxo.script || !ordUtxo.script) throw Error('Missing scripts!');

      const payPrivateKey = PrivateKey.from_wif(payWifPk);
      const ordPrivateKey = PrivateKey.from_wif(ordWifPk);

      const formattedOrdUtxo: UTXO = {
        satoshis: ordUtxo.satoshis,
        script: ordUtxo.script,
        txid: ordUtxo.txid,
        vout: ordUtxo.vout,
      };

      const broadcastResponse = await buildAndBroadcastOrdinalTx(
        fundingUtxo,
        formattedOrdUtxo,
        payPrivateKey,
        fundingAndChangeAddress,
        ordPrivateKey,
        destinationAddress,
      );

      if (broadcastResponse?.txid) {
        storage.set({ paymentUtxos: fundingUtxos.filter((u) => u.txid !== fundingUtxo.txid) }); // remove the spent utxo and update local storage
        return { txid: broadcastResponse.txid };
      }

      return { error: 'broadcast-failed' };
    } catch (error) {
      console.error('transferOrdinal failed:', error);
      return { error: JSON.stringify(error) };
    } finally {
      setIsProcessing(false);
    }
  };

  const buildAndBroadcastOrdinalTx = async (
    fundingUtxo: UTXO,
    ordUtxo: UTXO,
    payPrivateKey: PrivateKey,
    fundingAndChangeAddress: string,
    ordPrivateKey: PrivateKey,
    destination: string,
  ): Promise<BuildAndBroadcastResponse | undefined> => {
    const sendRes = await sendOrdinal(
      fundingUtxo,
      ordUtxo,
      payPrivateKey,
      fundingAndChangeAddress,
      FEE_PER_BYTE,
      ordPrivateKey,
      destination,
    );

    const rawTx = sendRes.to_hex();
    const { txid } = await broadcastWithGorillaPool(rawTx);

    if (txid) {
      return { txid, rawTx };
    }
  };

  const getOrdinalUtxos = async (address: string): Promise<OrdinalTxo[] | undefined> => {
    try {
      if (!address) {
        return [];
      }
      const utxos = await getOrdUtxos(ordAddress);

      return utxos;
    } catch (error) {
      console.error('getOrdinalUtxos failed:', error);
    }
  };

  const sendBSV20 = async (tick: string, destinationAddress: string, amount: bigint, password: string) => {
    try {
      if (!bsvWasmInitialized) throw Error('bsv-wasm not initialized!');
      setIsProcessing(true);

      const isAuthenticated = await verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }

      const keys = await retrieveKeys(password);
      if (!keys?.ordAddress || !keys.ordWif || !keys.walletAddress || !keys.walletWif) {
        throw Error('No keys');
      }
      const ordinalAddress = keys.ordAddress;
      const ordWifPk = keys.ordWif;
      const fundingAndChangeAddress = keys.walletAddress;
      const payWifPk = keys.walletWif;

      const paymentPk = PrivateKey.from_wif(payWifPk);
      const ordPk = PrivateKey.from_wif(ordWifPk);

      const fundingUtxos = await getUtxos(fundingAndChangeAddress);

      if (!fundingUtxos || fundingUtxos.length === 0) {
        return { error: 'insufficient-funds' };
      }

      const fundingUtxo = getSuitableUtxo(fundingUtxos, 50);

      const bsv20Utxos = await getBSV20Utxos(tick, ordinalAddress);

      if (!bsv20Utxos || bsv20Utxos.length === 0) throw Error('no-bsv20-utxo');

      const isV2 = isBSV20v2(tick);

      const tokenTotalAmt = bsv20Utxos.reduce((a, item) => {
        return a + (isV2 ? getAmtv2(Script.from_hex(item.script!)) : getAmtv1(Script.from_hex(item.script!)));
      }, 0n);

      const tokenChangeAmt = tokenTotalAmt - amount;

      const tx = new Transaction(1, 0);
      tx.add_output(
        new TxOut(
          1n,
          isV2
            ? createTransferV2P2PKH(destinationAddress, tick, amount)
            : createTransferP2PKH(destinationAddress, tick, amount),
        ),
      );

      if (tokenChangeAmt > 0n) {
        tx.add_output(
          new TxOut(
            1n,
            isV2
              ? createTransferV2P2PKH(ordinalAddress, tick, tokenChangeAmt)
              : createTransferP2PKH(ordinalAddress, tick, tokenChangeAmt),
          ),
        );
      }

      const totalInputSats = fundingUtxo.satoshis;
      const feeSats = 30;
      const change = totalInputSats - 1 - feeSats;

      if (change > 0) {
        tx.add_output(
          new TxOut(BigInt(change), P2PKHAddress.from_string(fundingAndChangeAddress).get_locking_script()),
        );
      }

      let idx = 0;
      for (let u of bsv20Utxos || []) {
        const inTx = new TxIn(Buffer.from(u.txid, 'hex'), u.vout, Script.from_asm_string(''));
        inTx.set_satoshis(BigInt(u.satoshis));
        inTx.set_locking_script(Script.from_hex(u.script!));
        tx.add_input(inTx);

        const sig = tx.sign(ordPk, SigHash.InputOutputs, idx, Script.from_hex(u.script!), BigInt(u.satoshis));

        inTx.set_unlocking_script(Script.from_asm_string(`${sig.to_hex()} ${ordPk.to_public_key().to_hex()}`));

        tx.set_input(idx, inTx);
        idx++;
      }

      const inTx = new TxIn(Buffer.from(fundingUtxo.txid, 'hex'), fundingUtxo.vout, Script.from_asm_string(''));
      inTx.set_satoshis(BigInt(fundingUtxo.satoshis));
      inTx.set_locking_script(Script.from_asm_string(fundingUtxo.script));
      tx.add_input(inTx);

      const sig = tx.sign(
        paymentPk,
        SigHash.InputOutputs,
        idx,
        Script.from_asm_string(fundingUtxo.script),
        BigInt(fundingUtxo.satoshis),
      );

      inTx.set_unlocking_script(Script.from_asm_string(`${sig.to_hex()} ${paymentPk.to_public_key().to_hex()}`));
      tx.set_input(idx, inTx);

      // Fee checker
      const finalSatsIn = tx.satoshis_in() ?? 0n;
      const finalSatsOut = tx.satoshis_out() ?? 0n;
      if (finalSatsIn - finalSatsOut > 500) {
        return { error: 'fee-to-high' };
      }

      const txhex = tx.to_hex();
      const { txid } = await broadcastWithGorillaPool(txhex);
      if (!txid) return { error: 'broadcast-transaction-failed' };
      storage.set({ paymentUtxos: fundingUtxos.filter((u) => u.txid !== fundingUtxo.txid) }); // remove the spent utxo and update local storage
      return { txid };
    } catch (error: any) {
      console.error('sendBSV20 failed:', error);
      return { error: error.message ?? 'unknown' };
    } finally {
      setIsProcessing(false);
    }
  };

  const listOrdinalOnGlobalOrderbook = async (listing: ListOrdinal): Promise<OrdOperationResponse> => {
    try {
      const { outpoint, price, password } = listing;

      if (!bsvWasmInitialized) throw Error('bsv-wasm not initialized!');
      setIsProcessing(true);

      const isAuthenticated = await verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }
      const keys = await retrieveKeys(password);

      if (!keys.walletWif || !keys.ordWif) return { error: 'no-keys' };

      const fundingAndChangeAddress = bsvAddress;
      const paymentPk = PrivateKey.from_wif(keys.walletWif);
      const ordPk = PrivateKey.from_wif(keys.ordWif);

      const paymentUtxos = await getUtxos(fundingAndChangeAddress);

      if (!paymentUtxos.length) {
        throw new Error('Could not retrieve paymentUtxos');
      }

      const totalSats = paymentUtxos.reduce((a: number, utxo: UTXO) => a + utxo.satoshis, 0);

      if (totalSats < 50) {
        return { error: 'insufficient-funds' };
      }

      const paymentUtxo = getSuitableUtxo(paymentUtxos, 50);

      const ordUtxo = await getUtxoByOutpoint(outpoint);

      if (!ordUtxo) return { error: 'no-ord-utxo' };

      const rawTx = await listOrdinal(
        paymentUtxo,
        ordUtxo,
        paymentPk,
        fundingAndChangeAddress,
        ordPk,
        ordAddress,
        fundingAndChangeAddress,
        Number(price),
      );

      const { txid } = await broadcastWithGorillaPool(rawTx);
      if (!txid) return { error: 'broadcast-error' };
      storage.set({ paymentUtxos: paymentUtxos.filter((u) => u.txid !== paymentUtxo.txid) }); // remove the spent utxo and update local storage
      return { txid };
    } catch (error) {
      console.log(error);
      return { error: JSON.stringify(error) };
    } finally {
      setIsProcessing(false);
    }
  };

  const createChangeOutput = (tx: Transaction, changeAddress: string, paymentSatoshis: number) => {
    const SAT_FEE_PER_BYTE = 0.065;
    const changeaddr = P2PKHAddress.from_string(changeAddress);
    const changeScript = changeaddr.get_locking_script();
    const emptyOut = new TxOut(BigInt(1), changeScript);
    const fee = Math.ceil(SAT_FEE_PER_BYTE * (tx.get_size() + emptyOut.to_bytes().byteLength));
    const change = paymentSatoshis - fee;
    const changeOut = new TxOut(BigInt(change), changeScript);
    return changeOut;
  };

  const listOrdinal = async (
    paymentUtxo: UTXO,
    ordinal: OrdinalTxo,
    paymentPk: PrivateKey,
    changeAddress: string,
    ordPk: PrivateKey,
    ordAddress: string,
    payoutAddress: string,
    satoshisPayout: number,
  ) => {
    const tx = new Transaction(1, 0);
    const t = ordinal.txid;
    const txBuf = Buffer.from(t, 'hex');
    const ordIn = new TxIn(txBuf, ordinal.vout, Script.from_asm_string(''));
    tx.add_input(ordIn);

    let utxoIn = new TxIn(Buffer.from(paymentUtxo.txid, 'hex'), paymentUtxo.vout, Script.from_asm_string(''));

    tx.add_input(utxoIn);

    const payoutDestinationAddress = P2PKHAddress.from_string(payoutAddress);
    const payOutput = new TxOut(BigInt(satoshisPayout), payoutDestinationAddress.get_locking_script());

    const destinationAddress = P2PKHAddress.from_string(ordAddress);
    const addressHex = destinationAddress.get_locking_script().to_asm_string().split(' ')[2];

    const ordLockScript = `${Script.from_hex(
      O_LOCK_PREFIX,
    ).to_asm_string()} ${addressHex} ${payOutput.to_hex()} ${Script.from_hex(O_LOCK_SUFFIX).to_asm_string()}`;

    const satOut = new TxOut(BigInt(1), Script.from_asm_string(ordLockScript));
    tx.add_output(satOut);

    const changeOut = createChangeOutput(tx, changeAddress, paymentUtxo.satoshis);
    tx.add_output(changeOut);

    if (!ordinal.script) {
      const ordRawTxHex = await getRawTxById(ordinal.txid);
      if (!ordRawTxHex) throw new Error('Could not get raw hex');
      const tx = Transaction.from_hex(ordRawTxHex);
      const out = tx.get_output(ordinal.vout);
      ordinal.satoshis = Number(out?.get_satoshis());

      const script = out?.get_script_pub_key();
      if (script) {
        ordinal.script = script.to_hex();
      }
    }

    if (!ordinal.script) throw new Error('Script not found');

    const sig = tx.sign(
      ordPk,
      SigHash.ALL | SigHash.FORKID,
      0,
      Script.from_hex(ordinal.script),
      BigInt(ordinal.satoshis),
    );

    ordIn.set_unlocking_script(Script.from_asm_string(`${sig.to_hex()} ${ordPk.to_public_key().to_hex()}`));

    tx.set_input(0, ordIn);

    const sig2 = tx.sign(
      paymentPk,
      SigHash.ALL | SigHash.FORKID,
      1,
      Script.from_asm_string(P2PKHAddress.from_string(payoutAddress).get_locking_script().to_asm_string()),
      BigInt(paymentUtxo.satoshis),
    );

    utxoIn.set_unlocking_script(Script.from_asm_string(`${sig2.to_hex()} ${paymentPk.to_public_key().to_hex()}`));
    tx.set_input(1, utxoIn);
    return tx.to_hex();
  };

  const cancelGlobalOrderbookListing = async (outpoint: string, password: string): Promise<OrdOperationResponse> => {
    try {
      if (!bsvWasmInitialized) throw Error('bsv-wasm not initialized!');
      setIsProcessing(true);

      const isAuthenticated = await verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }
      const keys = await retrieveKeys(password);

      if (!keys.walletWif || !keys.ordWif) return { error: 'no-keys' };
      const fundingAndChangeAddress = bsvAddress;

      const paymentUtxos = await getUtxos(fundingAndChangeAddress);

      if (!paymentUtxos.length) {
        throw new Error('Could not retrieve paymentUtxos');
      }

      const paymentUtxo = getSuitableUtxo(paymentUtxos, 50);

      const paymentPk = PrivateKey.from_wif(keys.walletWif);
      const ordinalPk = PrivateKey.from_wif(keys.ordWif);

      const listingTxid = outpoint.split('_')[0];
      if (!listingTxid) {
        throw new Error('No listing txid');
      }

      const cancelTx = new Transaction(1, 0);

      const { script } = await getMarketData(outpoint);

      const ordIn = new TxIn(Buffer.from(listingTxid, 'hex'), 0, Script.from_asm_string(''));
      cancelTx.add_input(ordIn);

      let utxoIn = new TxIn(Buffer.from(paymentUtxo.txid, 'hex'), paymentUtxo.vout, Script.from_asm_string(''));
      cancelTx.add_input(utxoIn);

      const destinationAddress = P2PKHAddress.from_string(ordAddress);
      const satOut = new TxOut(BigInt(1), destinationAddress.get_locking_script());
      cancelTx.add_output(satOut);

      const changeOut = createChangeOutput(cancelTx, fundingAndChangeAddress, paymentUtxo.satoshis);
      cancelTx.add_output(changeOut);

      // sign listing to cancel
      const sig = cancelTx.sign(
        ordinalPk,
        SigHash.SINGLE | SigHash.ANYONECANPAY | SigHash.FORKID,
        0,
        Script.from_bytes(Buffer.from(script, 'base64')),
        BigInt(1),
      );

      ordIn.set_unlocking_script(Script.from_asm_string(`${sig.to_hex()} ${ordinalPk.to_public_key().to_hex()} OP_1`));

      cancelTx.set_input(0, ordIn);

      const sig2 = cancelTx.sign(
        paymentPk,
        SigHash.ALL | SigHash.FORKID,
        1,
        Script.from_asm_string(P2PKHAddress.from_string(fundingAndChangeAddress).get_locking_script().to_asm_string()),
        BigInt(paymentUtxo.satoshis),
      );

      utxoIn.set_unlocking_script(Script.from_asm_string(`${sig2.to_hex()} ${paymentPk.to_public_key().to_hex()}`));

      cancelTx.set_input(1, utxoIn);
      const rawTx = cancelTx.to_hex();

      const { txid } = await broadcastWithGorillaPool(rawTx);
      if (!txid) return { error: 'broadcast-error' };
      storage.set({ paymentUtxos: paymentUtxos.filter((item) => item.txid !== paymentUtxo.txid) }); // remove the spent utxo and update local storage
      return { txid };
    } catch (error) {
      console.log(error);
      return { error: JSON.stringify(error) };
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    bsv20s,
    ordinals,
    ordAddress,
    ordPubKey,
    getOrdinals,
    isProcessing,
    transferOrdinal,
    setIsProcessing,
    getOrdinalsBaseUrl,
    sendBSV20,
    listOrdinalOnGlobalOrderbook,
    cancelGlobalOrderbookListing,
  };
};
