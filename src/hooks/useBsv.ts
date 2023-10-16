import { useEffect, useState } from "react";
import { useKeys } from "./useKeys";
import {
  ChainParams,
  ECDSA,
  Hash,
  P2PKHAddress,
  PrivateKey,
  PublicKey,
  Script,
  SigHash,
  Signature,
  Transaction,
  TxIn,
  TxOut,
} from "bsv-wasm-web";
import { UTXO, WocUtxo, useWhatsOnChain } from "./useWhatsOnChain";
import { SignMessageResponse } from "../pages/requests/SignMessageRequest";
import { useBsvWasm } from "./useBsvWasm";
import { NetWork } from "../utils/network";
import { useNetwork } from "./useNetwork";

type SendBsvResponse = {
  txid?: string;
  error?: string;
};

type SignTransactionResponse = {
  signatureHex?: string;
  error?: string;
};

export type Web3SignTransactionRequest = {
  rawtx: string;
  vin: number;
  sigHashTypeNumber: number;
  keyType: "bsv" | "ord";
  outputScript: string;
  outputSats: bigint;
};

export type Web3SendBsvRequest = {
  satAmount: number;
  address: string;
}[];

export type Web3BroadcastRequest = {
  rawtx: string;
};

export const useBsv = () => {
  const [bsvBalance, setBsvBalance] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const { retrieveKeys, bsvAddress, verifyPassword, bsvPubKey } = useKeys();
  const { bsvWasmInitialized } = useBsvWasm();
  const { network } = useNetwork();
  const { getUtxos, getBsvBalance, getExchangeRate, broadcastRawTx } =
  useWhatsOnChain();
  useEffect(() => { }, []);

  const getChainParams = (network: NetWork): ChainParams => {
    return network === NetWork.Mainnet ? ChainParams.mainnet() : ChainParams.testnet();
  }

  const sendBsv = async (
    request: Web3SendBsvRequest,
    password: string
  ): Promise<SendBsvResponse> => {
    try {
      if (!bsvWasmInitialized) throw Error("bsv-wasm not initialized!");
      // Gather keys for tx
      setIsProcessing(true);
      const isAuthenticated = await verifyPassword(password);
      if (!isAuthenticated) {
        return { error: "invalid-password" };
      }

      const feeSats = 20;
      const keys = await retrieveKeys(password);
      if (!keys?.walletWif || !keys.walletPubKey) throw Error("Undefined key");
      const paymentPk = PrivateKey.from_wif(keys.walletWif);
      const pubKey = paymentPk.to_public_key();
      const fromAddress = pubKey.to_address().set_chain_params(getChainParams(network)).to_string();
      const amount = request.reduce((a, r) => a + r.satAmount, 0);

      // Format in and outs
      const utxos: WocUtxo[] = await getUtxos(fromAddress);

      const script = P2PKHAddress.from_string(fromAddress)
        .get_locking_script()
        .to_asm_string();

      const fundingUtxos = utxos
        .map((utxo: WocUtxo) => {
          return {
            satoshis: utxo.value,
            vout: utxo.tx_pos,
            txid: utxo.tx_hash,
            script,
          };
        })
        .sort((a: UTXO, b: UTXO) => (a.satoshis > b.satoshis ? -1 : 1));

      if (!fundingUtxos) throw Error("No Utxos!");
      const totalSats = fundingUtxos.reduce(
        (a: number, item: UTXO) => a + item.satoshis,
        0
      );

      if (totalSats < amount) {
        return { error: "insufficient-funds" };
      }

      const sendAll = totalSats === amount;
      const satsOut = sendAll ? totalSats - feeSats : amount;
      const inputs = getInputs(fundingUtxos, satsOut, sendAll);

      const totalInputSats = inputs.reduce((a, item) => a + item.satoshis, 0);

      // Build tx
      const tx = new Transaction(1, 0);

      request.forEach((req) => {
        tx.add_output(
          new TxOut(
            BigInt(satsOut),
            P2PKHAddress.from_string(req.address).get_locking_script()
          )
        );
      });

      if (!sendAll) {
        const change = totalInputSats - satsOut - feeSats;
        tx.add_output(
          new TxOut(
            BigInt(change),
            P2PKHAddress.from_string(fromAddress).get_locking_script()
          )
        );
      }

      // build txins from our inputs
      let idx = 0;
      for (let u of inputs || []) {
        const inTx = new TxIn(
          Buffer.from(u.txid, "hex"),
          u.vout,
          Script.from_asm_string("")
        );

        inTx.set_satoshis(BigInt(u.satoshis));
        tx.add_input(inTx);

        const sig = tx.sign(
          paymentPk,
          SigHash.InputOutputs,
          idx,
          Script.from_asm_string(u.script),
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

      return { txid };
    } catch (error: any) {
      return { error: error.message ?? "unknown" };
    } finally {
      setIsProcessing(false);
    }
  };

  const signTransaction = async (
    password: string,
    request: Web3SignTransactionRequest
  ): Promise<SignTransactionResponse> => {
    const { keyType, outputSats, outputScript, rawtx, sigHashTypeNumber, vin } =
      request;

    const isAuthenticated = await verifyPassword(password);
    if (!isAuthenticated) {
      return { error: "invalid-password" };
    }
    try {
      const transaction = Transaction.from_hex(rawtx);
      const keys = await retrieveKeys(password);
      if (!keys?.walletWif || !keys.ordWif) throw Error("Undefined key");
      const privateKey = PrivateKey.from_wif(
        keyType === "bsv" ? keys.walletWif : keys.ordWif
      );
      const script = Script.from_hex(outputScript);
      const sig = transaction.sign(
        privateKey,
        sigHashTypeNumber,
        vin,
        script,
        BigInt(outputSats)
      );
      return { signatureHex: sig.to_hex() };
    } catch (error) {
      console.error("Error signing the transaction: ", error);
      throw error;
    }
  };

  const signMessage = async (
    message: string,
    password: string
  ): Promise<SignMessageResponse | undefined> => {
    const isAuthenticated = await verifyPassword(password);
    if (!isAuthenticated) {
      return { error: "invalid-password" };
    }
    try {
      const keys = await retrieveKeys(password);
      if (!keys?.walletWif) throw Error("Undefined key");
      const hash = Hash.sha_256(Buffer.from(message)).to_hex();
      const privateKey = PrivateKey.from_wif(keys.walletWif);
      const publicKey = privateKey.to_public_key();
      const address = publicKey.to_address().set_chain_params(getChainParams(network)).to_string();
      const encoder = new TextEncoder();
      const encodedMessage = encoder.encode(hash);
      const signature = privateKey.sign_message(encodedMessage);

      return {
        address,
        pubKeyHex: publicKey.to_hex(),
        signedMessage: message,
        signatureHex: signature.to_hex(),
      };
    } catch (error) {
      console.log(error);
    }
  };

  const verifyMessage = (
    message: string,
    signatureHex: string,
    publicKeyHex: string
  ) => {
    try {
      const hash = Hash.sha_256(Buffer.from(message)).to_hex();
      const signature = Signature.from_der(Buffer.from(signatureHex, "hex"));
      const publicKey = PublicKey.from_hex(publicKeyHex);
      const encoder = new TextEncoder();
      const encodedMessage = encoder.encode(hash);
      const verified = ECDSA.verify_digest(
        encodedMessage,
        publicKey,
        signature,
        0
      );
      return verified;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  const getInputs = (utxos: UTXO[], satsOut: number, isSendAll: boolean) => {
    if (isSendAll) return utxos;
    let sum = 0;
    let index = 0;
    let inputs: UTXO[] = [];

    while (sum <= satsOut) {
      const utxo = utxos[index];
      sum += utxo.satoshis;
      inputs.push(utxo);
      index++;
    }
    return inputs;
  };

  const balance = async () => {
    const total = await getBsvBalance(bsvAddress);
    setBsvBalance(total ?? 0);
  };

  const rate = async () => {
    const r = await getExchangeRate();
    setExchangeRate(r ?? 0);
  };

  useEffect(() => {
    if (!bsvAddress) return;
    balance();
    rate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bsvAddress]);

  return {
    bsvBalance,
    bsvAddress,
    bsvPubKey,
    isProcessing,
    sendBsv,
    setIsProcessing,
    getBsvBalance,
    exchangeRate,
    signMessage,
    verifyMessage,
    signTransaction,
  };
};
