import axios from 'axios';
import { NetWork, Ordinal } from 'yours-wallet-provider';
import { GP_BASE_URL, GP_TESTNET_BASE_URL } from '../utils/constants';
import { Keys } from '../utils/keys';
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

  //TODO: revisit this...
  setDerivationTags = async (identityAddress: string, keys: Keys) => {
    // const taggedOrds = await this.getOrdUtxos(identityAddress);
    // const tags: TaggedDerivationResponse[] = [];
    // const network = this.chromeStorageService.getNetwork();
    // for (const ord of taggedOrds) {
    //   try {
    //     if (!ord.origin?.outpoint || ord.origin.data?.insc?.file.type !== 'panda/tag') continue;
    //     const contentBuffer = await this.getOrdContentByOriginOutpoint(ord.origin.outpoint.toString());
    //     if (!contentBuffer || contentBuffer.length === 0) continue;
    //     const derivationTag = decryptUsingPrivKey(
    //       [Buffer.from(contentBuffer).toString('base64')],
    //       PrivateKey.from_wif(keys.identityWif),
    //     );
    //     const parsedTag: DerivationTag = JSON.parse(Buffer.from(derivationTag[0], 'base64').toString('utf8'));
    //     const taggedKeys = getTaggedDerivationKeys(parsedTag, keys.mnemonic);
    //     const taggedAddress = P2PKHAddress.from_string(taggedKeys.address)
    //       .set_chain_params(getChainParams(network))
    //       .to_string();
    //     tags.push({ tag: parsedTag, address: taggedAddress, pubKey: taggedKeys.pubKey.to_hex() });
    //   } catch (error) {
    //     console.log(error);
    //   }
    // }
    // const { account } = this.chromeStorageService.getCurrentAccountObject();
    // if (!account) throw new Error('No account found!');
    // const key: keyof ChromeStorageObject = 'accounts';
    // const update: Partial<ChromeStorageObject['accounts']> = {
    //   [account.addresses.identityAddress]: {
    //     ...account,
    //     derivationTags: tags,
    //   },
    // };
    // await this.chromeStorageService.updateNested(key, update);
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
