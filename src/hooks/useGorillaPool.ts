import axios from 'axios';
import init, { ChainParams, P2PKHAddress, PrivateKey, Transaction, TxOut } from 'bsv-wasm-web';
import { TaggedDerivationResponse } from '../pages/requests/GenerateTaggedKeysRequest';
import { GP_BASE_URL, GP_TESTNET_BASE_URL, JUNGLE_BUS_URL } from '../utils/constants';
import { decryptUsingPrivKey } from '../utils/crypto';
import { chunkedStringArray } from '../utils/format';
import { DerivationTag, getTaggedDerivationKeys, Keys } from '../utils/keys';
import { NetWork } from '../utils/network';
import { isBSV20v2 } from '../utils/ordi';
import { storage } from '../utils/storage';
import { getCurrentUtcTimestamp } from '../utils/tools';
import { OrdinalResponse, OrdinalTxo } from './ordTypes';
import { StoredUtxo } from './useBsv';
import { useNetwork } from './useNetwork';
import { BSV20 } from './useOrds';

type GorillaPoolErrorMessage = {
  message: string;
};

export type GorillaPoolBroadcastResponse = {
  txid?: string;
  message?: string;
};

export const useGorillaPool = () => {
  const { network, isAddressOnRightNetwork } = useNetwork();

  const getOrdinalsBaseUrl = () => {
    return network === NetWork.Mainnet ? GP_BASE_URL : GP_TESTNET_BASE_URL;
  };

  const getChainParams = (network: NetWork): ChainParams => {
    return network === NetWork.Mainnet ? ChainParams.mainnet() : ChainParams.testnet();
  };

  const getOrdUtxos = async (ordAddress: string): Promise<OrdinalResponse> => {
    try {
      if (!isAddressOnRightNetwork(ordAddress)) return [];
      const { data } = await axios.get<OrdinalTxo[]>(
        `${getOrdinalsBaseUrl()}/api/txos/address/${ordAddress}/unspent?limit=1000&offset=0`,
      );
      return data;
    } catch (error) {
      console.log(error);
      return [];
    }
  };

  const broadcastWithGorillaPool = async (txhex: string): Promise<GorillaPoolBroadcastResponse> => {
    try {
      const encoded = Buffer.from(txhex, 'hex').toString('base64');
      const res = await axios.post<string | GorillaPoolErrorMessage>(`${getOrdinalsBaseUrl()}/api/tx`, {
        rawtx: encoded,
      });
      if (res.status === 200 && typeof res.data === 'string') {
        await updateStoredPaymentUtxos(txhex);
        return { txid: res.data };
      } else {
        return res.data as GorillaPoolErrorMessage;
      }
    } catch (error: any) {
      console.log(error);
      return { message: JSON.stringify(error.response.data ?? 'Unknown error while broadcasting tx') };
    }
  };

  const submitTx = async (txid: string) => {
    try {
      let res = await axios.post(`${getOrdinalsBaseUrl()}/api/tx/${txid}/submit`);

      if (res.status !== 0) {
        console.error('submitTx failed: ', txid);
      }
    } catch (error) {
      console.error('submitTx failed: ', txid, error);
    }
  };

  const getUtxoByOutpoint = async (outpoint: string): Promise<OrdinalTxo> => {
    try {
      const { data } = await axios.get(`${getOrdinalsBaseUrl()}/api/txos/${outpoint}?script=true`);
      const ordUtxo: OrdinalTxo = data;
      if (!ordUtxo.script) throw Error('No script when fetching by outpoint');
      ordUtxo.script = Buffer.from(ordUtxo.script, 'base64').toString('hex');
      return ordUtxo;
    } catch (e) {
      throw new Error(JSON.stringify(e));
    }
  };

  const getMarketData = async (outpoint: string) => {
    try {
      const res = await axios.get(`${getOrdinalsBaseUrl()}/api/inscriptions/${outpoint}?script=true`);
      const data = res.data as OrdinalTxo;
      if (!data?.script || !data.origin?.outpoint.toString()) throw new Error('Could not get listing script');
      return { script: data.script, origin: data.origin.outpoint.toString() };
    } catch (error) {
      throw new Error(`Error getting market data: ${JSON.stringify(error)}`);
    }
  };

  const getBsv20Balances = async (ordAddress: string) => {
    if (!isAddressOnRightNetwork(ordAddress)) return [];
    const res = await axios.get(`${getOrdinalsBaseUrl()}/api/bsv20/${ordAddress}/balance`);

    const bsv20List: Array<BSV20> = res.data.map(
      (b: {
        all: {
          confirmed: string;
          pending: string;
        };
        listed: {
          confirmed: string;
          pending: string;
        };
        tick?: string;
        sym?: string;
        id?: string;
        icon?: string;
        dec: number;
      }) => {
        const id = (b.tick || b.id) as string;
        return {
          id: id,
          tick: b.tick,
          sym: b.sym || null,
          icon: b.icon || null,
          dec: b.dec,
          all: {
            confirmed: BigInt(b.all.confirmed),
            pending: BigInt(b.all.pending),
          },
          listed: {
            confirmed: BigInt(b.all.confirmed),
            pending: BigInt(b.all.pending),
          },
        };
      },
    );

    return bsv20List;
  };

  const getBSV20Utxos = async (tick: string, address: string): Promise<OrdinalTxo[] | undefined> => {
    try {
      if (!address) {
        return [];
      }

      const url = isBSV20v2(tick)
        ? `${getOrdinalsBaseUrl()}/api/bsv20/${address}/id/${tick}`
        : `${getOrdinalsBaseUrl()}/api/bsv20/${address}/tick/${tick}`;

      const r = await axios.get(url);

      if (!Array.isArray(r.data)) {
        return [];
      }

      const utxos = await Promise.all(
        r.data
          .map((utxo: any) => {
            return getUtxoByOutpoint(utxo.outpoint);
          })
          .filter((u) => u !== null),
      );

      return utxos as OrdinalTxo[];
    } catch (error) {
      console.error('getBSV20Utxos', error);
      return [];
    }
  };

  const getLockedUtxos = async (address: string) => {
    try {
      if (!isAddressOnRightNetwork(address)) return [];
      //TODO: use this instead of test endpoint - `${getOrdinalsBaseUrl()}/api/locks/address/${address}/unspent?limit=100&offset=0`
      const { data } = await axios.get(
        `https://locks.gorillapool.io/api/locks/address/${address}/unspent?limit=100&offset=0`,
      );
      const lockedUtxos: OrdinalTxo[] = data;
      return lockedUtxos;
    } catch (e) {
      throw new Error(JSON.stringify(e));
    }
  };

  const getSpentTxids = async (outpoints: string[]): Promise<Map<string, string>> => {
    try {
      const chunks = chunkedStringArray(outpoints, 50);
      let spentTxids = new Map<string, string>();
      for (const chunk of chunks) {
        try {
          //TODO: updata url to be dynamic for testnet
          const res = await axios.post(`https://locks.gorillapool.io/api/spends`, chunk);
          const txids = res.data as string[];
          txids.forEach((txid, i) => {
            spentTxids.set(chunk[i], txid);
          });
        } catch (error) {}
      }
      return spentTxids;
    } catch (error) {
      console.log(error);
      return new Map();
    }
  };

  const getOrdContentByOriginOutpoint = async (originOutpoint: string) => {
    try {
      const res = await axios.get(`https://v3.ordinals.gorillapool.io/content/${originOutpoint}?fuzzy=false`, {
        responseType: 'arraybuffer',
      });
      return Buffer.from(res.data);
    } catch (error) {
      console.log(error);
    }
  };

  const setDerivationTags = async (identityAddress: string, keys: Keys) => {
    const taggedOrds = await getOrdUtxos(identityAddress);
    let tags: TaggedDerivationResponse[] = [];
    for (const ord of taggedOrds) {
      try {
        if (!ord.origin?.outpoint || ord.origin.data?.insc?.file.type !== 'panda/tag') continue;
        const contentBuffer = await getOrdContentByOriginOutpoint(ord.origin.outpoint.toString());
        if (!contentBuffer || contentBuffer.length === 0) continue;

        const derivationTag = decryptUsingPrivKey(
          [Buffer.from(contentBuffer).toString('base64')],
          PrivateKey.from_wif(keys.identityWif),
        );

        const parsedTag: DerivationTag = JSON.parse(Buffer.from(derivationTag[0], 'base64').toString('utf8'));
        const taggedKeys = getTaggedDerivationKeys(parsedTag, keys.mnemonic);

        const taggedAddress = P2PKHAddress.from_string(taggedKeys.address)
          .set_chain_params(getChainParams(network))
          .to_string();

        tags.push({ tag: parsedTag, address: taggedAddress, pubKey: taggedKeys.pubKey.to_hex() });
      } catch (error) {
        console.log(error);
      }
    }

    storage.set({ derivationTags: tags });
  };

  const getTxOut = async (txid: string, vout: number) => {
    try {
      await init();
      const { data } = await axios.get(`${JUNGLE_BUS_URL}/v1/txo/get/${txid}_${vout}`, { responseType: 'arraybuffer' });
      return TxOut.from_hex(Buffer.from(data).toString('hex'));
    } catch (error) {
      console.log(error);
    }
  };

  const updateStoredPaymentUtxos = async (rawtx: string) => {
    await init();
    const localStorage = await new Promise<{
      paymentUtxos: StoredUtxo[];
      appState: { addresses: { bsvAddress: string } };
    }>((resolve) => {
      storage.get(['paymentUtxos', 'appState'], (result) => resolve(result));
    });

    const { paymentUtxos, appState } = localStorage;
    const { addresses } = appState;
    const { bsvAddress } = addresses;

    const tx = Transaction.from_hex(rawtx);
    let inputCount = tx.get_ninputs();
    let outputCount = tx.get_noutputs();
    const spends: string[] = [];

    for (let i = 0; i < inputCount; i++) {
      const txIn = tx.get_input(i);
      spends.push(`${txIn!.get_prev_tx_id_hex()}_${txIn!.get_vout()}`);
    }
    paymentUtxos.forEach((utxo) => {
      if (spends.includes(`${utxo.txid}_${utxo.vout}`)) {
        utxo.spent = true;
        utxo.spentUnixTime = getCurrentUtcTimestamp();
      }
    });

    const fundingScript = P2PKHAddress.from_string(bsvAddress!).get_locking_script().to_hex();
    const txid = tx.get_id_hex();

    for (let i = 0; i < outputCount; i++) {
      const txOut = tx.get_output(i);
      const outScript = txOut?.get_script_pub_key_hex();
      if (outScript === fundingScript) {
        paymentUtxos.push({
          satoshis: Number(txOut!.get_satoshis()),
          script: fundingScript,
          txid,
          vout: i,
          spent: false,
          spentUnixTime: 0,
        });
      }
    }
    storage.set({ paymentUtxos });
    return paymentUtxos;
  };

  return {
    getOrdUtxos,
    broadcastWithGorillaPool,
    getUtxoByOutpoint,
    getMarketData,
    getBsv20Balances,
    getBSV20Utxos,
    getLockedUtxos,
    getSpentTxids,
    submitTx,
    getOrdContentByOriginOutpoint,
    setDerivationTags,
    getTxOut,
  };
};
