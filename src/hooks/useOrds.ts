import axios from "axios";
import { useEffect, useState } from "react";
import { FEE_PER_BYTE, GP_BASE_URL } from "../utils/constants";
import { useKeys } from "./useKeys";
import { UTXO, WocUtxo, useWhatsOnChain } from "./useWhatsOnChain";
import { sendOrdinal } from "js-1sat-ord-web";
import { P2PKHAddress, PrivateKey, Transaction } from "bsv-wasm-web";
import { useBsvWasm } from "./useBsvWasm";


export interface Ordinal {
  txid:     string;
  vout:     number;
  outpoint: string;
  satoshis: number;
  accSats:  string;
  height:   number;
  idx:      string;
  owner:    string;
  spend:    string;
  origin:   Origin;
  data:     Data;
}

export interface Data {
  insc:  Insc;
  types: string[];
}

export interface Insc {
  file: File;
  json: JSON;
}

export interface File {
  hash: string;
  size: number;
  type: string;
}

export interface JSON {
  p:    string;
  op:   string;
  amt:  string;
  tick: string;
}

export interface Origin {
  outpoint: string;
  data:     Data;
  num:      number;
}



type OrdinalResponse = Ordinal[];

type TransferOrdinalResponse = {
  txid?: string;
  error?: string;
};

export type BuildAndBroadcastResponse = {
  txid: string;
  rawTx: string;
};

export type MapSubType = "collection" | "collectionItem";

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

export type Web3TransferOrdinalRequest = {
  address: string;
  origin: string;
  outpoint: string;
};

export const useOrds = () => {
  const { ordAddress, retrieveKeys, verifyPassword, ordPubKey } = useKeys();
  const { getUtxos, broadcastRawTx, getRawTxById } = useWhatsOnChain();
  const [ordinals, setOrdinals] = useState<OrdinalResponse>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { bsvWasmInitialized } = useBsvWasm();

  const getOrdinals = async () => {
    try {
      //   setIsProcessing(true); // TODO: set this to true if call is taking more than a second
      //TODO: Implement infinite scroll to handle instances where user has more than 100 items.
      const res = await axios.get(
        `${GP_BASE_URL}/txos/address/${ordAddress}/unspent?limit=100&offset=0&bsv20=false`
      );

      const ordList: OrdinalResponse = res.data;
      setOrdinals(ordList);
    } catch (error) {
      console.log(error);
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
    password: string
  ): Promise<TransferOrdinalResponse> => {
    try {
      if (!bsvWasmInitialized) throw Error("bsv-wasm not initialized!");
      setIsProcessing(true);

      const isAuthenticated = await verifyPassword(password);
      if (!isAuthenticated) {
        return { error: "invalid-password" };
      }

      const keys = await retrieveKeys(password);
      if (
        !keys?.ordAddress ||
        !keys.ordWif ||
        !keys.walletAddress ||
        !keys.walletWif
      ) {
        throw Error("No keys");
      }
      const ordinalAddress = keys.ordAddress;
      const ordWifPk = keys.ordWif;
      const fundingAndChangeAddress = keys.walletAddress;
      const payWifPk = keys.walletWif;

      const utxos = await getUtxos(fundingAndChangeAddress);

      const fundingUtxos: UTXO[] = utxos
        .map((utxo: WocUtxo) => {
          return {
            satoshis: utxo.value,
            vout: utxo.tx_pos,
            txid: utxo.tx_hash,
            script: P2PKHAddress.from_string(fundingAndChangeAddress)
              .get_locking_script()
              .to_asm_string(),
          } as UTXO;
        })
        .sort((a: UTXO, b: UTXO) => (a.satoshis > b.satoshis ? -1 : 1));

      if (!fundingUtxos || fundingUtxos.length === 0) {
        return { error: "insufficient-funds" };
      }

      const ordUtxos = await getOrdinalUtxos(ordinalAddress);
      if (!ordUtxos) throw Error("No ord utxos!");
      const ordUtxo = ordUtxos.find((o) => o.outpoint === outpoint);

      if (!ordUtxo) {
        return { error: "no-ord-utxo" };
      }

      if (!ordUtxo.script) {
        const ordRawTx = await getRawTxById(ordUtxo.txid);
        if (!ordRawTx) throw Error("Could not get raw tx");
        const tx = Transaction.from_hex(ordRawTx);
        const out = tx.get_output(ordUtxo.vout);
        const script = out?.get_script_pub_key();
        if (script) {
          ordUtxo.script = script.to_asm_string();
        }
      }

      const fundingUtxo = fundingUtxos[0];

      if (fundingUtxo && !fundingUtxo.script) {
        const ordRawTx = await getRawTxById(fundingUtxo.txid);
        if (!ordRawTx) throw Error("Could not get raw tx");
        const tx = Transaction.from_hex(ordRawTx);
        const out = tx.get_output(ordUtxo.vout);
        const script = out?.get_script_pub_key();
        if (script) {
          fundingUtxo.script = script.to_asm_string();
        }
      }

      const payPrivateKey = PrivateKey.from_wif(payWifPk);
      const ordPrivateKey = PrivateKey.from_wif(ordWifPk);

      const broadcastResponse = await buildAndBroadcastOrdinalTx(
        fundingUtxo,
        ordUtxo,
        payPrivateKey,
        fundingAndChangeAddress,
        ordPrivateKey,
        destinationAddress
      );

      if (broadcastResponse?.txid) {
        return { txid: broadcastResponse.txid };
      }

      return { error: "broadcast-failed" };
    } catch (error) {
      console.log(error);
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
    destination: string
  ): Promise<BuildAndBroadcastResponse | undefined> => {
    const sendRes = await sendOrdinal(
      fundingUtxo,
      ordUtxo,
      payPrivateKey,
      fundingAndChangeAddress,
      FEE_PER_BYTE,
      ordPrivateKey,
      destination
    );

    const rawTx = sendRes.to_hex();

    // Broadcasting with WOC for now. Ideally we broadcast with whatever the 1sat indexer is most likely to see first. David Case mentioned an endpoint specifically for the indexer. Should use this when ready.
    const txid = await broadcastRawTx(rawTx);

    // const { data } = await axios.post(`${GORILLA_POOL_ARC_URL}/tx`, {
    //   rawTx,
    // });

    // const { txid } = data as GPArcResponse;
    if (txid) {
      return { txid, rawTx };
    }
  };
  const getOrdinalUtxos = async (
    address: string
  ): Promise<OrdUtxo[] | undefined> => {
    try {
      if (!address) {
        return [];
      }
      const r = await axios.get(
        `${GP_BASE_URL}/txos/address/${address}/unspent?limit=100&offset=0&bsv20=true`
      );

      const utxos = r.data as OrdinalResponse;

      const oUtxos: OrdUtxo[] = [];
      for (const a of utxos) {

        oUtxos.push({
          satoshis: 1, // all ord utxos currently 1 satoshi
          txid: a.txid,
          vout: a.vout,
          origin: a.origin.outpoint,
          outpoint: a.outpoint,
        } as OrdUtxo);
      }

      return oUtxos;
    } catch (error) {
      console.log(error);
    }
  };

  return {
    ordinals,
    ordAddress,
    ordPubKey,
    getOrdinals,
    isProcessing,
    transferOrdinal,
    setIsProcessing,
  };
};
