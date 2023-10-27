import axios from "axios";
import { useEffect, useState } from "react";
import {
  FEE_PER_BYTE,
  GP_BASE_URL,
  GP_TESTNET_BASE_URL,
} from "../utils/constants";
import { useKeys } from "./useKeys";
import { UTXO, WocUtxo, useWhatsOnChain } from "./useWhatsOnChain";
import { sendOrdinal } from "js-1sat-ord-web";
import { useBsvWasm } from "./useBsvWasm";
import { NetWork } from "../utils/network";
import { useNetwork } from "./useNetwork";

import { OrdUtxo, OrdinalResponse } from "./ordTypes";
import { P2PKHAddress, Transaction, TxIn, Script, TxOut, PrivateKey, SigHash } from "bsv-wasm-web";
import { createTransferP2PKH, createTransferV2P2PKH, getAmtv1, getAmtv2, isBSV20v2 } from "../utils/ordi";
import { useTokens } from "./useTokens";


type TransferOrdinalResponse = {
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

export const useOrds = () => {
  const { ordAddress, retrieveKeys, verifyPassword, ordPubKey } = useKeys();

  const [ordinals, setOrdinals] = useState<OrdinalResponse>([]);
  const [bsv20s, setBSV20s] = useState<Array<BSV20>>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { bsvWasmInitialized } = useBsvWasm();
  const { network } = useNetwork();
  const { getUtxos, broadcastRawTx, getRawTxById } = useWhatsOnChain();
  const { cacheTokenInfos, getTokenDecimals } = useTokens();
  const getOrdinalsBaseUrl = () => {
    return network === NetWork.Mainnet ? GP_BASE_URL : GP_TESTNET_BASE_URL;
  };

  const getOrdinals = async () => {
    try {
      //   setIsProcessing(true); // TODO: set this to true if call is taking more than a second
      //TODO: Implement infinite scroll to handle instances where user has more than 100 items.
      let res = await axios.get(
        `${getOrdinalsBaseUrl()}/api/txos/address/${ordAddress}/unspent?limit=100&offset=0`
      );

      const ordList: OrdinalResponse = res.data;
      setOrdinals(ordList);

      res = await axios.get(
        `${getOrdinalsBaseUrl()}/api/bsv20/${ordAddress}/balance`
      );

      const bsv20List: Array<BSV20> = res.data.map((b: {
        "all": {
          "confirmed": string,
          "pending": string
        },
        "listed": {
          "confirmed": string,
          "pending": string
        },
        "tick": string,
      }) => {
        return {
          tick: b.tick,
          dec: getTokenDecimals(b.tick),
          all: {
            confirmed: BigInt(b.all.confirmed),
            pending: BigInt(b.all.pending),
          },
          listed: {
            confirmed: BigInt(b.all.confirmed),
            pending: BigInt(b.all.pending),
          }
        }
      });

      await cacheTokenInfos(bsv20List.map(bsv20 => bsv20.tick));

      setBSV20s(bsv20List.filter(o => o.all.confirmed > 0n));

    } catch (error) {
      console.error("getOrdinals failed:", error);
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
      console.error("transferOrdinal failed:", error);
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
        `${getOrdinalsBaseUrl()}/api/txos/address/${ordAddress}/unspent?limit=100&offset=0`
      );

      const utxos = r.data as OrdinalResponse;

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
      console.error("getOrdinalUtxos failed:", error);
    }
  };


  const fetchUTXOByOutpoint = (outpoint: string): Promise<UTXO | null> => {
    return axios
      .get(`${getOrdinalsBaseUrl()}/api/txos/${outpoint}?script=true`)
      .then(function (response) {
        // handle success
        const script = Buffer.from(
          response.data.script,
          'base64'
        ).toString('hex')
        return {
          txid: response.data.txid,
          vout: response.data.vout,
          satoshis: 1,
          script,
        }
      })
      .catch(function (error) {
        console.error("fetchUTXOByOutpoint failed:", error);
        return null
      })
  }

  const getBSV20Utxos = async (
    tick: string,
    address: string
  ): Promise<UTXO[] | undefined> => {
    try {
      if (!address) {
        return [];
      }

      const url = isBSV20v2(tick) ?
        `${getOrdinalsBaseUrl()}/api/bsv20/${address}/id/${tick}` :
        `${getOrdinalsBaseUrl()}/api/bsv20/${address}/tick/${tick}`

      const r = await axios.get(url);

      if (!Array.isArray(r.data)) {
        return [];
      }

      const utxos = await Promise.all(
        r.data.map((utxo: any) => {
          return fetchUTXOByOutpoint(utxo.outpoint)
        }).filter(u => u !== null)
      )

      return utxos as Array<UTXO>

    } catch (error) {
      console.error("getBSV20Utxos", error);
      return [];
    }
  };

  const sendBSV20 = async (tick: string,
    destinationAddress: string,
    amount: bigint,
    password: string) => {
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

      const paymentPk = PrivateKey.from_wif(payWifPk);
      const ordPk = PrivateKey.from_wif(ordWifPk);

      const utxos = await getUtxos(fundingAndChangeAddress);

      const fundingUtxos: UTXO[] = utxos
        .map((utxo: WocUtxo) => {
          return {
            satoshis: utxo.value,
            vout: utxo.tx_pos,
            txid: utxo.tx_hash,
            script: P2PKHAddress.from_string(fundingAndChangeAddress)
              .get_locking_script()
              .to_hex(),
          } as UTXO;
        })
        .sort((a: UTXO, b: UTXO) => (a.satoshis > b.satoshis ? -1 : 1));

      if (!fundingUtxos || fundingUtxos.length === 0) {
        return { error: "insufficient-funds" };
      }

      const bsv20Utxos = await getBSV20Utxos(tick, ordinalAddress);

      if (!bsv20Utxos || bsv20Utxos.length === 0) throw Error("no-bsv20-utxo");

      const isV2 = isBSV20v2(tick);

      const tokenTotalAmt = bsv20Utxos.reduce((a, item) => {
        return a + (isV2 ? getAmtv2(Script.from_hex(item.script)) : getAmtv1(Script.from_hex(item.script)))
      }, 0n);

      const tokenChangeAmt = tokenTotalAmt - amount;

      const tx = new Transaction(1, 0);
      tx.add_output(new TxOut(1n,
        isV2 ? createTransferV2P2PKH(destinationAddress, tick, amount)
          : createTransferP2PKH(destinationAddress, tick, amount)))


      if (tokenChangeAmt > 0n) {
        tx.add_output(new TxOut(1n,
          isV2 ? createTransferV2P2PKH(ordinalAddress, tick, tokenChangeAmt)
            : createTransferP2PKH(ordinalAddress, tick, tokenChangeAmt)))
      }

      const totalInputSats = fundingUtxos.reduce((a, item) => a + item.satoshis, 0);
      const feeSats = 30;
      const change = totalInputSats - 1 - feeSats;

      if (change > 0) {
        tx.add_output(
          new TxOut(
            BigInt(change),
            P2PKHAddress.from_string(fundingAndChangeAddress).get_locking_script()
          )
        );
      }
      let idx = 0;
      for (let u of bsv20Utxos || []) {
        const inTx = new TxIn(
          Buffer.from(u.txid, "hex"),
          u.vout,
          Script.from_asm_string("")
        );
        inTx.set_satoshis(BigInt(u.satoshis));
        inTx.set_locking_script(Script.from_hex(u.script))
        tx.add_input(inTx)

        const sig = tx.sign(
          ordPk,
          SigHash.InputOutputs,
          idx,
          Script.from_hex(u.script),
          BigInt(u.satoshis)
        );

        inTx.set_unlocking_script(
          Script.from_asm_string(
            `${sig.to_hex()} ${ordPk.to_public_key().to_hex()}`
          )
        );

        tx.set_input(idx, inTx);
        idx++;
      }

      for (let u of fundingUtxos || []) {
        const inTx = new TxIn(
          Buffer.from(u.txid, "hex"),
          u.vout,
          Script.from_asm_string("")
        );
        inTx.set_satoshis(BigInt(u.satoshis));
        inTx.set_locking_script(Script.from_hex(u.script))
        tx.add_input(inTx)

        const sig = tx.sign(
          paymentPk,
          SigHash.InputOutputs,
          idx,
          Script.from_hex(u.script),
          BigInt(u.satoshis)
        );

        inTx.set_unlocking_script(
          Script.from_asm_string(
            `${sig.to_hex()} ${paymentPk.to_public_key().to_hex()}`
          )
        );

        tx.set_input(idx, inTx);
        idx++;
      }

      // Fee checker
      const finalSatsIn = tx.satoshis_in() ?? 0n;
      const finalSatsOut = tx.satoshis_out() ?? 0n;
      if (finalSatsIn - finalSatsOut > 500) {
        return { error: "fee-to-high" };
      }

      const txhex = tx.to_hex();
      const txid = await broadcastRawTx(txhex);

      if (txid) {
        return { txid };
      }
      return { error: "broadcast-transaction-failed" };
    } catch (error: any) {
      console.error("sendBSV20 failed:", error);
      return { error: error.message ?? "unknown" };
    } finally {
      setIsProcessing(false);
    }
  }



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
  };
};
