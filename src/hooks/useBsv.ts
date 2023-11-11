import init, {
  BSM,
  ChainParams,
  P2PKHAddress,
  PrivateKey,
  PublicKey,
  Script,
  SigHash,
  Signature,
  Transaction,
  TxIn,
  TxOut,
} from 'bsv-wasm-web';
import { useEffect, useState } from 'react';
import { SignMessageResponse } from '../pages/requests/SignMessageRequest';
import { BSV_DECIMAL_CONVERSION } from '../utils/constants';
import { DerivationTags, Keys } from '../utils/keys';
import { NetWork } from '../utils/network';
import { storage } from '../utils/storage';
import { useGorillaPool } from './useGorillaPool';
import { useKeys } from './useKeys';
import { useNetwork } from './useNetwork';
import { useWhatsOnChain } from './useWhatsOnChain';

export type UTXO = {
  satoshis: number;
  vout: number;
  txid: string;
  script: string;
};

type SendBsvResponse = {
  txid?: string;
  rawtx?: string;
  error?: string;
};

export type Web3SendBsvRequest = {
  satoshis: number;
  address?: string;
  data?: string[]; // hex string array
  script?: string; // hex string
}[];

export type Web3BroadcastRequest = {
  rawtx: string;
};

export type Web3SignMessageRequest = {
  message: string;
  encoding?: 'utf8' | 'hex' | 'base64';
};

export const useBsv = () => {
  const [bsvBalance, setBsvBalance] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const { retrieveKeys, bsvAddress, verifyPassword, bsvPubKey, identityAddress, identityPubKey } = useKeys();
  const { network } = useNetwork();
  const { broadcastWithGorillaPool } = useGorillaPool();
  const { getUtxos, getBsvBalance, getExchangeRate, getInputs } = useWhatsOnChain();

  const getChainParams = (network: NetWork): ChainParams => {
    return network === NetWork.Mainnet ? ChainParams.mainnet() : ChainParams.testnet();
  };

  useEffect(() => {
    if (!bsvAddress) return;
    getUtxos(bsvAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bsvAddress]);

  const sendBsv = async (
    request: Web3SendBsvRequest,
    password: string,
    noApprovalLimit?: number,
  ): Promise<SendBsvResponse> => {
    try {
      setIsProcessing(true);
      await init();
      const requestSats = request.reduce((a: number, item: { satoshis: number }) => a + item.satoshis, 0);
      const bsvSendAmount = requestSats / BSV_DECIMAL_CONVERSION;

      if (bsvSendAmount > Number(noApprovalLimit)) {
        const isAuthenticated = await verifyPassword(password);
        if (!isAuthenticated) {
          return { error: 'invalid-password' };
        }
      }

      const feeSats = 20;
      const isBelowNoApprovalLimit = Number(bsvSendAmount) <= Number(noApprovalLimit);
      const keys = await retrieveKeys(password, isBelowNoApprovalLimit);
      if (!keys?.walletWif || !keys.walletPubKey) throw Error('Undefined key');
      const paymentPk = PrivateKey.from_wif(keys.walletWif);
      const pubKey = paymentPk.to_public_key();
      const fromAddress = pubKey.to_address().set_chain_params(getChainParams(network)).to_string();
      const amount = request.reduce((a, r) => a + r.satoshis, 0);

      // Format in and outs
      const utxos = await getUtxos(fromAddress, true);

      const script = P2PKHAddress.from_string(fromAddress).get_locking_script().to_asm_string();

      const fundingUtxos = utxos
        .map((utxo: UTXO) => {
          return {
            satoshis: utxo.satoshis,
            vout: utxo.vout,
            txid: utxo.txid,
            script,
          };
        })
        .sort((a: UTXO, b: UTXO) => (a.satoshis > b.satoshis ? -1 : 1));

      if (!fundingUtxos) throw Error('No Utxos!');
      const totalSats = fundingUtxos.reduce((a: number, item: UTXO) => a + item.satoshis, 0);

      if (totalSats < amount) {
        return { error: 'insufficient-funds' };
      }

      const sendAll = totalSats === amount;
      const satsOut = sendAll ? totalSats - feeSats : amount;
      const inputs = getInputs(fundingUtxos, satsOut, sendAll);

      const totalInputSats = inputs.reduce((a, item) => a + item.satoshis, 0);

      // Build tx
      const tx = new Transaction(1, 0);

      request.forEach((req) => {
        let outScript: Script;
        if (req.address) {
          outScript = P2PKHAddress.from_string(req.address).get_locking_script();
        } else if (req.script) {
          outScript = Script.from_hex(req.script);
        } else if ((req.data || []).length > 0) {
          let asm = `OP_0 OP_RETURN ${req.data?.join(' ')}`;
          try {
            outScript = Script.from_asm_string(asm);
          } catch (e) {
            throw Error('Invalid data');
          }
        } else {
          throw Error('Invalid request');
        }
        tx.add_output(new TxOut(BigInt(satsOut), outScript));
      });

      if (!sendAll) {
        const change = totalInputSats - satsOut - feeSats;
        tx.add_output(new TxOut(BigInt(change), P2PKHAddress.from_string(fromAddress).get_locking_script()));
      }

      // build txins from our inputs
      let idx = 0;
      for (let u of inputs || []) {
        const inTx = new TxIn(Buffer.from(u.txid, 'hex'), u.vout, Script.from_hex(''));

        inTx.set_satoshis(BigInt(u.satoshis));
        tx.add_input(inTx);

        const sig = tx.sign(paymentPk, SigHash.InputOutputs, idx, Script.from_hex(u.script), BigInt(u.satoshis));

        inTx.set_unlocking_script(Script.from_asm_string(`${sig.to_hex()} ${paymentPk.to_public_key().to_hex()}`));
        tx.set_input(idx, inTx);
        idx++;
      }

      // Fee checker
      const finalSatsIn = tx.satoshis_in() ?? 0n;
      const finalSatsOut = tx.satoshis_out() ?? 0n;
      if (finalSatsIn - finalSatsOut > 500) {
        return { error: 'fee-to-high' };
      }

      const rawtx = tx.to_hex();
      let { txid } = await broadcastWithGorillaPool(rawtx);
      if (txid) {
        storage.set({ paymentUtxos: utxos.filter((item) => !inputs.includes(item)) }); // remove the spent utxos and update local storage

        if (isBelowNoApprovalLimit) {
          storage.get(['noApprovalLimit'], ({ noApprovalLimit }) => {
            storage.set({
              noApprovalLimit: noApprovalLimit
                ? Number((noApprovalLimit - amount / BSV_DECIMAL_CONVERSION).toFixed(8))
                : 0,
            });
          });
        }
      }
      return { txid, rawtx };
    } catch (error: any) {
      console.log(error);
      return { error: error.message ?? 'unknown' };
    } finally {
      setIsProcessing(false);
    }
  };

  const getRequestedWif = (keys: Keys, keyType: DerivationTags) => {
    let wif = keys.walletWif;
    if (keyType) {
      if (
        (keyType !== 'identity' && keyType !== 'ord' && keyType !== 'wallet') ||
        (keyType === 'identity' && !keys.identityWif) ||
        (keyType === 'ord' && !keys.ordWif) ||
        (keyType === 'wallet' && !keys.walletWif)
      ) {
        return { error: 'key-type' };
      }

      wif = (keyType === 'ord' ? keys.ordWif : keyType === 'identity' ? keys.identityWif : keys.walletWif) as string; // safely cast here with above if checks
    }
    return { wif };
  };

  const signMessage = async (
    messageToSign: Web3SignMessageRequest,
    password: string,
  ): Promise<SignMessageResponse | undefined> => {
    const { message, encoding } = messageToSign;
    const isAuthenticated = await verifyPassword(password);
    if (!isAuthenticated) {
      return { error: 'invalid-password' };
    }
    try {
      const keys = (await retrieveKeys(password)) as Keys;
      const res = getRequestedWif(keys, 'identity');
      if (res.error || !res.wif) {
        return res;
      }
      const privateKey = PrivateKey.from_wif(res.wif);
      const publicKey = privateKey.to_public_key();
      const address = publicKey.to_address().set_chain_params(getChainParams(network)).to_string();

      const msgBuf = Buffer.from(message, encoding);
      const signature = BSM.sign_message(privateKey, msgBuf);
      // const signature = privateKey.sign_message(msgBuf);
      return {
        address,
        pubKey: publicKey.to_hex(),
        message: message,
        sig: signature.to_compact_hex(),
        keyType: 'identity',
      };
    } catch (error) {
      console.log(error);
    }
  };

  const verifyMessage = (
    message: string,
    signatureHex: string,
    publicKeyHex: string,
    encoding: 'utf8' | 'hex' | 'base64' = 'utf8',
  ) => {
    try {
      const msgBuf = Buffer.from(message, encoding);
      const publicKey = PublicKey.from_hex(publicKeyHex);
      const signature = Signature.from_compact_bytes(Buffer.from(signatureHex, 'hex'));
      const address = publicKey.to_address().set_chain_params(getChainParams(network));

      return address.verify_bitcoin_message(msgBuf, signature);
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  const updateBsvBalance = async (pullFresh?: boolean) => {
    const total = await getBsvBalance(bsvAddress, pullFresh);
    setBsvBalance(total ?? 0);
  };

  const rate = async () => {
    const r = await getExchangeRate();
    setExchangeRate(r ?? 0);
  };

  useEffect(() => {
    if (!bsvAddress) return;
    updateBsvBalance();
    rate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bsvAddress]);

  return {
    bsvBalance,
    bsvAddress,
    bsvPubKey,
    identityAddress,
    identityPubKey,
    isProcessing,
    sendBsv,
    setIsProcessing,
    updateBsvBalance,
    exchangeRate,
    signMessage,
    verifyMessage,
  };
};
