import axios from 'axios';
import { NetWork, Ordinal } from 'yours-wallet-provider';
import { GP_BASE_URL, GP_TESTNET_BASE_URL } from '../utils/constants';
import { MarketResponse } from './types/gorillaPool.types';
import { ChromeStorageService } from './ChromeStorage.service';

export class GorillaPoolService {
  constructor(private readonly chromeStorageService: ChromeStorageService) {}
  getBaseUrl(network: NetWork) {
    return network === NetWork.Mainnet ? GP_BASE_URL : GP_TESTNET_BASE_URL;
  }

  getUtxoByOutpoint = async (outpoint: string): Promise<Ordinal> => {
    try {
      const network = this.chromeStorageService.getNetwork();
      const { data } = await axios.get(`${this.getBaseUrl(network)}/api/txos/${outpoint}?script=true`);
      const ordUtxo: Ordinal = data;
      if (!ordUtxo.script) throw Error('No script when fetching by outpoint');
      ordUtxo.script = Buffer.from(ordUtxo.script, 'base64').toString('hex');
      return ordUtxo;
    } catch (e) {
      throw new Error(JSON.stringify(e));
    }
  };

  getTokenPriceInSats = async (tokenIds: string[]) => {
    const network = this.chromeStorageService.getNetwork();
    const result: { id: string; satPrice: number }[] = [];
    for (const tokenId of tokenIds) {
      const { data } = await axios.get<MarketResponse[]>(
        `${this.getBaseUrl(network)}/api/bsv20/market?sort=price_per_token&dir=asc&limit=1&offset=0&${
          tokenId.length > 30 ? 'id' : 'tick'
        }=${tokenId}`,
      );
      if (data.length > 0) {
        result.push({ id: tokenId, satPrice: data[0].pricePer });
      }
    }
    return result;
  };
}
