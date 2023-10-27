import { useEffect, useState } from "react";
import {
  FEE_PER_BYTE,
  GP_BASE_URL,
  GP_TESTNET_BASE_URL,
} from "../utils/constants";
import { useKeys } from "./useKeys";
import { UTXO, WocUtxo, useWhatsOnChain } from "./useWhatsOnChain";
import { sendOrdinal } from "js-1sat-ord-web";
import { P2PKHAddress, PrivateKey, Transaction } from "bsv-wasm-web";
import { useBsvWasm } from "./useBsvWasm";
import { Outpoint } from "../utils/outpoint";
import { NetWork } from "../utils/network";
import { useNetwork } from "./useNetwork";
import { useGorillaPool } from "./useGorillaPool";
export class InscriptionData {
  type?: string = "";
  data?: Buffer = Buffer.alloc(0);
}

export interface Claim {
  sub: string;
  type: string;
  value: string;
}

export interface Sigma {
  algorithm: string;
  address: string;
  signature: string;
  vin: number;
}

export class Origin {
  outpoint: Outpoint = new Outpoint();
  data?: TxoData;
  num?: number;
  map?: { [key: string]: any };
  claims?: Claim[];
}

export enum Bsv20Status {
  Invalid = -1,
  Pending = 0,
  Valid = 1,
}

export type InscData = {
  file: {
    hash: string;
    size: number;
    type: string;
  };
  text: string;
  json: any;
};

export class TxoData {
  types?: string[];
  insc?: InscData;
  map?: { [key: string]: any };
  b?: File;
  sigma?: Sigma[];
  list?: {
    price: number;
    payout: string;
  };
  bsv20?: {
    id?: Outpoint;
    p: string;
    op: string;
    tick?: string;
    amt: string;
    status?: Bsv20Status;
  };
}

export interface Inscription {
  json?: any;
  text?: string;
  words?: string[];
  file: File;
}
export class OrdinalTxo {
  txid: string = "";
  vout: number = 0;
  outpoint: Outpoint = new Outpoint();
  satoshis: number = 0;
  accSats: number = 0;
  owner?: string;
  script?: string;
  spend?: string;
  origin?: Origin;
  height: number = 0;
  idx: number = 0;
  data?: TxoData;
}

export type OrdinalResponse = OrdinalTxo[];

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

  const [ordinals, setOrdinals] = useState<OrdinalResponse>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { bsvWasmInitialized } = useBsvWasm();
  const { network } = useNetwork();
  const { getUtxos, getRawTxById } = useWhatsOnChain();
  const { getOrdUtxos, broadcastWithGorillaPool } = useGorillaPool();
  const getOrdinalsBaseUrl = () => {
    return network === NetWork.Mainnet ? GP_BASE_URL : GP_TESTNET_BASE_URL;
  };

  const getOrdinals = async () => {
    try {
      //   setIsProcessing(true); // TODO: set this to true if call is taking more than a second
      //TODO: Implement infinite scroll to handle instances where user has more than 100 items.
      const ordList = await getOrdUtxos(ordAddress);
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

    console.log(rawTx);
    const { txid } = await broadcastWithGorillaPool(rawTx);

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
      const utxos = await getOrdUtxos(ordAddress);

      const oUtxos: OrdUtxo[] = [];
      for (const a of utxos) {
        oUtxos.push({
          satoshis: 1, // all ord utxos currently 1 satoshi
          txid: a.txid,
          vout: a.vout,
          origin: a.origin?.outpoint.toString(),
          outpoint: a.outpoint.toString(),
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
    getOrdinalsBaseUrl,
  };
};
