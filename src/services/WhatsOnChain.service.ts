import axios from 'axios';
import { NetWork } from 'yours-wallet-provider';
import { BSV_DECIMAL_CONVERSION, WOC_BASE_URL, WOC_TESTNET_BASE_URL } from '../utils/constants';
import { isAddressOnRightNetwork } from '../utils/tools';
import { ChromeStorageService } from './ChromeStorage.service';
import { StoredUtxo, UTXO } from './types/bsv.types';
import { ChromeStorageObject } from './types/chromeStorage.types';
import { ChainInfo, WocUtxo } from './types/whatsOnChain.types';
import { P2PKH } from '@bsv/sdk';

export class WhatsOnChainService {
  apiKey: string;
  config: { headers: { 'woc-api-key': string } };
  constructor(private readonly chromeStorageService: ChromeStorageService) {
    this.apiKey = process.env.REACT_APP_WOC_API_KEY as string;
    this.config = {
      headers: {
        'woc-api-key': this.apiKey,
      },
    };
  }

  getBaseUrl = (network: NetWork) => {
    return network === NetWork.Mainnet ? WOC_BASE_URL : WOC_TESTNET_BASE_URL;
  };

  getBsvBalance = async (address: string, pullFresh?: boolean): Promise<number | undefined> => {
    const utxos = await this.getAndUpdateUtxoStorage(address, pullFresh);
    if (!utxos) return 0;

    const sats = utxos.reduce((a, item) => a + item.satoshis, 0);
    const bsvTotal = sats / BSV_DECIMAL_CONVERSION;
    return bsvTotal;
  };

  getAndUpdateUtxoStorage = async (fromAddress: string, pullFresh?: boolean): Promise<StoredUtxo[]> => {
    try {
      const network = this.chromeStorageService.getNetwork();
      if (!isAddressOnRightNetwork(network, fromAddress)) return [];
      const { account } = this.chromeStorageService.getCurrentAccountObject();
      if (!account) return [];
      const { paymentUtxos } = account;

      if (!pullFresh && paymentUtxos.length > 0) {
        return paymentUtxos
          .filter((utxo) => !utxo.spent)
          .sort((a: StoredUtxo, b: StoredUtxo) => (a.satoshis > b.satoshis ? -1 : 1));
      }

      const { data } = await axios.get(`${this.getBaseUrl(network)}/address/${fromAddress}/unspent`, this.config);
      const explorerUtxos: StoredUtxo[] = data
        .filter((u: WocUtxo) => u.value !== 1) // Ensure we are never spending 1 sats
        .map((utxo: WocUtxo) => {
          return {
            satoshis: utxo.value,
            vout: utxo.tx_pos,
            txid: utxo.tx_hash,
            script: new P2PKH().lock(fromAddress).toHex(),
            spent: false,
            spentUnixTime: 0,
          } as StoredUtxo;
        });

      const key: keyof ChromeStorageObject = 'accounts';
      const update: Partial<ChromeStorageObject['accounts']> = {
        [account.addresses.identityAddress]: {
          ...account,
          paymentUtxos: explorerUtxos,
        },
      };
      await this.chromeStorageService.updateNested(key, update);

      return explorerUtxos;
    } catch (error) {
      console.log(error);
      return [];
    }
  };

  getExchangeRate = async (): Promise<number | undefined> => {
    const network = this.chromeStorageService.getNetwork();
    const { exchangeRateCache } = this.chromeStorageService.getCurrentAccountObject();
    try {
      if (exchangeRateCache?.rate && Date.now() - exchangeRateCache.timestamp < 5 * 60 * 1000) {
        return Number(exchangeRateCache.rate.toFixed(2));
      } else {
        const res = await axios.get(`${this.getBaseUrl(network)}/exchangerate`, this.config);
        if (!res.data) {
          throw new Error('Could not fetch exchange rate from WOC!');
        }

        const rate = Number(res.data.rate.toFixed(2));
        const currentTime = Date.now();
        await this.chromeStorageService.update({ exchangeRateCache: { rate, timestamp: currentTime } });
        return rate;
      }
    } catch (error) {
      console.log(error);
    }
  };

  getRawTxById = async (txid: string): Promise<string | undefined> => {
    try {
      const network = this.chromeStorageService.getNetwork();
      const { data } = await axios.get(`${this.getBaseUrl(network)}/tx/${txid}/hex`, this.config);
      return data;
    } catch (error) {
      console.log(error);
    }
  };

  broadcastRawTx = async (txhex: string): Promise<string | undefined> => {
    try {
      const network = this.chromeStorageService.getNetwork();
      const { data: txid } = await axios.post(`${this.getBaseUrl(network)}/tx/raw`, { txhex }, this.config);
      return txid;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // Access to config, request, and response
        console.error('broadcast rawtx failed:', error.response.data);
      } else {
        console.error('broadcast rawtx failed:', error);
      }
    }
  };

  getSuitableUtxo = (utxos: UTXO[], minimum: number) => {
    const suitableUtxos = utxos.filter((utxo) => utxo.satoshis > minimum);

    if (suitableUtxos.length === 0) {
      throw new Error('No UTXO large enough for this transaction');
    }
    // Select a random UTXO from the suitable ones
    const randomIndex = Math.floor(Math.random() * suitableUtxos.length);
    return suitableUtxos[randomIndex];
  };

  getInputs = (utxos: UTXO[], satsOut: number, isSendAll: boolean) => {
    if (isSendAll) return utxos;
    let sum = 0;
    let index = 0;
    const inputs: UTXO[] = [];

    while (sum <= satsOut) {
      const utxo = utxos[index];
      sum += utxo.satoshis;
      inputs.push(utxo);
      index++;
    }
    return inputs;
  };

  getChainInfo = async (): Promise<ChainInfo | undefined> => {
    try {
      const network = this.chromeStorageService.getNetwork();
      const { data } = await axios.get(`${this.getBaseUrl(network)}/chain/info`, this.config);
      return data as ChainInfo;
    } catch (error) {
      console.log(error);
    }
  };
}
