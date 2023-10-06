import axios from "axios";
import { useEffect, useState } from "react";
import { FEE_PER_BYTE, GP_BASE_URL } from "../utils/constants";
import { useKeys } from "./useKeys";
import { UTXO, useWhatsOnChain } from "./useWhatsOnChain";
import { Transaction, Script, PrivateKey } from "bsv";
import { sendOrdinal } from "../utils/js-1sat-ord";
import { Keys } from "../utils/keys";

type OrdinalResponse = {
  id: number;
  num: number;
  txid: string;
  vout: number;
  outpoint: string;
  file: {
    hash: string;
    size: number;
    type: string;
  };
  origin: string;
  height: number;
  idx: number;
  lock: string;
  spend: string;
  MAP: {
    [key: string]: string;
  };
  B: {
    hash: string;
    size: number;
    type: string;
  };
  SIGMA: any[];
  listing: boolean;
  price: number;
  payout: string;
  script: string;
  bsv20: boolean;
}[];

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

type GPInscription = {
  num: number;
  txid: string;
  vout: number;
  file: GPFile;
  origin: string;
  outpoint: string;
  listing: boolean;
  ordinal?: number;
  height: number;
  idx: number;
  lock: string;
  MAP: any;
};

export type Web3TransferOrdinalRequest = {
  address: string;
  origin: string;
  outpoint: string;
};

export const useOrds = () => {
  const { ordAddress, retrieveKeys, verifyPassword, ordPubKey } = useKeys();
  const { getUxos, getRawTxById, broadcastRawTx } = useWhatsOnChain();
  const [ordinals, setOrdinals] = useState<OrdinalResponse>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const getOrdinals = async () => {
    try {
      //   setIsProcessing(true); // TODO: set this to true if call is taking more than a second
      //TODO: Implement infinite scroll to handle instances where user has more than 100 items.
      const res = await axios.get(
        `${GP_BASE_URL}/utxos/address/${ordAddress}/inscriptions?limit=100&offset=0&excludeBsv20=true`
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
      setIsProcessing(true);

      const isAuthenticated = await verifyPassword(password);
      if (!isAuthenticated) {
        return { error: "invalid-password" };
      }

      const keys = (await retrieveKeys(password)) as Keys;
      const ordinalAddress = keys.ordAddress;
      const ordWifPk = keys.ordWif;
      const fundingAndChangeAddress = keys.walletAddress;
      const payWifPk = keys.walletWif;

      const fundingUtxos = await getUxos(fundingAndChangeAddress);

      if (!fundingUtxos || fundingUtxos.length === 0) {
        return { error: "insufficient-funds" };
      }

      const ordUtxos = await getOrdinalUtxos(ordinalAddress);

      const ordUtxo = ordUtxos.find((o) => o.outpoint === outpoint);

      if (!ordUtxo) {
        return { error: "no-ord-utxo" };
      }

      if (!ordUtxo.script) {
        const ordRawTx = await getRawTxById(ordUtxo.txid);
        const tx = new Transaction(ordRawTx);
        const out = tx.outputs[ordUtxo.vout];
        const script = out?.script.toHex();

        if (script) {
          const scriptObj = new Script(out.script);
          ordUtxo.script = scriptObj.toASM();
        }
      }
      const fundingUtxo = fundingUtxos[0];
      if (fundingUtxo && !fundingUtxo.script) {
        const ordRawTx = await getRawTxById(fundingUtxo.txid);
        const tx = new Transaction(ordRawTx);
        const out = tx.outputs[ordUtxo.vout];
        const script = out?.script.toHex();
        if (script) {
          const scriptObj = new Script(out.script);
          fundingUtxo.script = scriptObj.toASM();
        }
      }

      const payPrivateKey = PrivateKey.fromWIF(payWifPk);
      const ordPrivateKey = PrivateKey.fromWIF(ordWifPk);

      const formattedOrdUtxo: UTXO = {
        satoshis: ordUtxo.satoshis,
        script: Script.fromASM(ordUtxo.script).toHex(),
        txid: ordUtxo.txid,
        vout: ordUtxo.vout,
      };

      const broadcastResult = await buildAndBroadcastOrdinalTx(
        fundingUtxo,
        formattedOrdUtxo,
        payPrivateKey,
        fundingAndChangeAddress,
        ordPrivateKey,
        destinationAddress
      );

      if (broadcastResult?.txid) {
        return { txid: broadcastResult.txid };
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
    payPrivateKey: Buffer,
    fundingAndChangeAddress: string,
    ordPrivateKey: Buffer,
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

    const rawTx = sendRes.tx.toString();

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

  const getOrdinalUtxos = async (address: string): Promise<OrdUtxo[]> => {
    try {
      const r = await axios.get(
        `${GP_BASE_URL}/utxos/address/${address}/inscriptions?limit=100&offset=0&excludeBsv20=false`
      );

      const utxos = (await r.data) as GPInscription[];

      const oUtxos: OrdUtxo[] = [];
      for (const a of utxos) {
        const parts = a.origin.split("_");
        const imageUrl = `${GP_BASE_URL}/files/inscriptions/${a.origin}`;
        a.file.url = imageUrl;

        oUtxos.push({
          satoshis: 1, // all ord utxos currently 1 satoshi
          txid: a.txid,
          vout: parseInt(parts[1]),
          origin: a.origin,
          num: a.num,
          file: a.file,
          listing: a.listing,
          outpoint: a.outpoint,
          map: a.MAP,
          type: a.file.type,
        } as OrdUtxo);
      }

      return oUtxos;
    } catch (e) {
      console.log(e);
      return [];
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
