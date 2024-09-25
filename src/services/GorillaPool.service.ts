import axios from 'axios';
import { Bsv20, BSV20Txo, Bsv21, NetWork, Ordinal } from 'yours-wallet-provider';
import { GP_BASE_URL, GP_TESTNET_BASE_URL } from '../utils/constants';
import { MarketResponse, Token } from './types/gorillaPool.types';
import { ChromeStorageService } from './ChromeStorage.service';
import { isBSV20v2 } from '../utils/ordi';

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

  getBsv20Balances = async (addresses: string[]) => {
    const network = this.chromeStorageService.getNetwork();
    const url = `${this.getBaseUrl(network)}/api/bsv20/balance?addresses=${addresses.join('&addresses=')}`;
    const res = await axios.get(url);

    const bsv20List: Array<Bsv20 | Bsv21> = res.data.map(
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

  getBSV20Utxos = async (tick: string, addresses: string[] = []): Promise<BSV20Txo[] | undefined> => {
    try {
      const network = this.chromeStorageService.getNetwork();

      const utxos: BSV20Txo[] = [];
      await Promise.all(
        addresses.map(async (address) => {
          const url = isBSV20v2(tick)
            ? `${this.getBaseUrl(network)}/api/bsv20/${address}/id/${tick}`
            : `${this.getBaseUrl(network)}/api/bsv20/${address}/tick/${tick}`;

          const r = await axios.get(url);
          (r.data as BSV20Txo[]).forEach((utxo) => {
            if (utxo.status === 1 && !utxo.listing) utxos.push(utxo);
          });
        }),
      );

      return utxos;
    } catch (error) {
      console.error('getBSV20Utxos', error);
      return [];
    }
  };

  getBsv20Details = async (tick: string) => {
    try {
      const network = this.chromeStorageService.getNetwork();
      const url = isBSV20v2(tick)
        ? `${this.getBaseUrl(network)}/api/bsv20/id/${tick}`
        : `${this.getBaseUrl(network)}/api/bsv20/tick/${tick}`;

      const r = await axios.get<Token>(url);

      return r.data;
    } catch (error) {
      console.error('getBsv20Details', error);
    }
  };
}
