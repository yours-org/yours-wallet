import { ChromeStorageService } from './ChromeStorage.service';

export class TxoService {
  constructor(private readonly chromeStorageService: ChromeStorageService) {}
  // getBaseUrl(network: NetWork) {
  //   return network === NetWork.Mainnet ? GP_BASE_URL : GP_TESTNET_BASE_URL;
  // }

  // getOrdUtxos = async (ordAddress: string): Promise<OrdinalResponse> => {
  //   try {
  //     const network = this.chromeStorageService.getNetwork();
  //     if (!isAddressOnRightNetwork(network, ordAddress)) return [];
  //     const { data } = await axios.get<Ordinal[]>(
  //       `${this.getBaseUrl(network)}/api/txos/address/${ordAddress}/unspent?limit=1500&offset=0`,
  //     );
  //     return data;
  //   } catch (error) {
  //     console.log(error);
  //     return [];
  //   }
  // };

  // broadcastWithGorillaPool = async (txhex: string): Promise<GorillaPoolBroadcastResponse> => {
  //   try {
  //     const network = this.chromeStorageService.getNetwork();
  //     const encoded = Buffer.from(txhex, 'hex').toString('base64');
  //     const res = await axios.post<string | GorillaPoolErrorMessage>(`${this.getBaseUrl(network)}/api/tx`, {
  //       rawtx: encoded,
  //     });
  //     if (res.status === 200 && typeof res.data === 'string') {
  //       await this.updateStoredPaymentUtxos(txhex);
  //       return { txid: res.data };
  //     } else {
  //       return res.data as GorillaPoolErrorMessage;
  //     }
  //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //   } catch (error: any) {
  //     console.log(error);
  //     return { message: JSON.stringify(error.response.data ?? 'Unknown error while broadcasting tx') };
  //   }
  // };

  // submitTx = async (txid: string) => {
  //   try {
  //     const network = this.chromeStorageService.getNetwork();
  //     const res = await axios.post(`${this.getBaseUrl(network)}/api/tx/${txid}/submit`);

  //     if (res.status !== 0) {
  //       console.error('submitTx failed: ', txid);
  //     }
  //   } catch (error) {
  //     console.error('submitTx failed: ', txid, error);
  //   }
  // };

  // getUtxoByOutpoint = async (outpoint: string): Promise<Ordinal> => {
  //   try {
  //     const network = this.chromeStorageService.getNetwork();
  //     const { data } = await axios.get(`${this.getBaseUrl(network)}/api/txos/${outpoint}?script=true`);
  //     const ordUtxo: Ordinal = data;
  //     if (!ordUtxo.script) throw Error('No script when fetching by outpoint');
  //     ordUtxo.script = Buffer.from(ordUtxo.script, 'base64').toString('hex');
  //     return ordUtxo;
  //   } catch (e) {
  //     throw new Error(JSON.stringify(e));
  //   }
  // };

  // getMarketData = async (outpoint: string) => {
  //   try {
  //     const network = this.chromeStorageService.getNetwork();
  //     const res = await axios.get(`${this.getBaseUrl(network)}/api/inscriptions/${outpoint}?script=true`);
  //     const data = res.data as Ordinal;
  //     if (!data?.script || !data.origin?.outpoint.toString()) throw new Error('Could not get listing script');
  //     return { script: data.script, origin: data.origin.outpoint.toString() };
  //   } catch (error) {
  //     throw new Error(`Error getting market data: ${JSON.stringify(error)}`);
  //   }
  // };

  // getBsv20Balances = async (ordAddress: string) => {
  //   const network = this.chromeStorageService.getNetwork();
  //   if (!isAddressOnRightNetwork(network, ordAddress)) return [];
  //   const res = await axios.get(`${this.getBaseUrl(network)}/api/bsv20/${ordAddress}/balance`);

  //   const bsv20List: Array<Bsv20> = res.data.map(
  //     (b: {
  //       all: {
  //         confirmed: string;
  //         pending: string;
  //       };
  //       listed: {
  //         confirmed: string;
  //         pending: string;
  //       };
  //       tick?: string;
  //       sym?: string;
  //       id?: string;
  //       icon?: string;
  //       dec: number;
  //     }) => {
  //       const id = (b.tick || b.id) as string;
  //       return {
  //         id: id,
  //         tick: b.tick,
  //         sym: b.sym || null,
  //         icon: b.icon || null,
  //         dec: b.dec,
  //         all: {
  //           confirmed: BigInt(b.all.confirmed),
  //           pending: BigInt(b.all.pending),
  //         },
  //         listed: {
  //           confirmed: BigInt(b.all.confirmed),
  //           pending: BigInt(b.all.pending),
  //         },
  //       };
  //     },
  //   );

  //   return bsv20List;
  // };

  // getBSV20Utxos = async (tick: string, address: string): Promise<BSV20Txo[] | undefined> => {
  //   try {
  //     const network = this.chromeStorageService.getNetwork();
  //     if (!address) {
  //       return [];
  //     }

  //     const url = isBSV20v2(tick)
  //       ? `${this.getBaseUrl(network)}/api/bsv20/${address}/id/${tick}`
  //       : `${this.getBaseUrl(network)}/api/bsv20/${address}/tick/${tick}`;

  //     const r = await axios.get(url);

  //     if (!Array.isArray(r.data)) {
  //       return [];
  //     }

  //     return (r.data as BSV20Txo[]).filter((utxo) => utxo.status === 1 && !utxo.listing);
  //   } catch (error) {
  //     console.error('getBSV20Utxos', error);
  //     return [];
  //   }
  // };

  // getBsv20Details = async (tick: string) => {
  //   try {
  //     const network = this.chromeStorageService.getNetwork();
  //     const url = isBSV20v2(tick)
  //       ? `${this.getBaseUrl(network)}/api/bsv20/id/${tick}`
  //       : `${this.getBaseUrl(network)}/api/bsv20/tick/${tick}`;

  //     const r = await axios.get<Token>(url);

  //     return r.data;
  //   } catch (error) {
  //     console.error('getBsv20Details', error);
  //   }
  // };

  // getLockedBsvUtxos = async (address: string) => {
  //   try {
  //     const network = this.chromeStorageService.getNetwork();
  //     if (!isAddressOnRightNetwork(network, address)) return [];
  //     //TODO: use this instead of test endpoint - `${this.getBaseUrl(network)}/api/locks/address/${address}/unspent?limit=100&offset=0`
  //     const { data } = await axios.get(
  //       `${this.getBaseUrl(network)}/api/locks/address/${address}/unspent?limit=100&offset=0`,
  //     );
  //     const lockedUtxos: Ordinal[] = data;
  //     return lockedUtxos.filter((utxo) => !utxo.data?.bsv20);
  //   } catch (e) {
  //     throw new Error(JSON.stringify(e));
  //   }
  // };

  // getSpentTxids = async (outpoints: string[]): Promise<Map<string, string>> => {
  //   try {
  //     const network = this.chromeStorageService.getNetwork();
  //     const chunks = chunkedStringArray(outpoints, 50);
  //     const spentTxids = new Map<string, string>();
  //     for (const chunk of chunks) {
  //       try {
  //         //TODO: updata url to be dynamic for testnet
  //         const res = await axios.post(`${this.getBaseUrl(network)}/api/spends`, chunk);
  //         const txids = res.data as string[];
  //         txids.forEach((txid, i) => {
  //           spentTxids.set(chunk[i], txid);
  //         });
  //       } catch (error) {
  //         console.log(error);
  //       }
  //     }
  //     return spentTxids;
  //   } catch (error) {
  //     console.log(error);
  //     return new Map();
  //   }
  // };

  // getOrdContentByOriginOutpoint = async (originOutpoint: string) => {
  //   try {
  //     const network = this.chromeStorageService.getNetwork();
  //     const res = await axios.get(`${this.getBaseUrl(network)}/content/${originOutpoint}?fuzzy=false`, {
  //       responseType: 'arraybuffer',
  //     });
  //     return Buffer.from(res.data);
  //   } catch (error) {
  //     console.log(error);
  //   }
  // };

  // setDerivationTags = async (identityAddress: string, keys: Keys) => {
  //   const taggedOrds = await this.getOrdUtxos(identityAddress);
  //   const tags: TaggedDerivationResponse[] = [];
  //   const network = this.chromeStorageService.getNetwork();
  //   for (const ord of taggedOrds) {
  //     try {
  //       if (!ord.origin?.outpoint || ord.origin.data?.insc?.file.type !== 'panda/tag') continue;
  //       const contentBuffer = await this.getOrdContentByOriginOutpoint(ord.origin.outpoint.toString());
  //       if (!contentBuffer || contentBuffer.length === 0) continue;

  //       const derivationTag = decryptUsingPrivKey(
  //         [Buffer.from(contentBuffer).toString('base64')],
  //         PrivateKey.from_wif(keys.identityWif),
  //       );

  //       const parsedTag: DerivationTag = JSON.parse(Buffer.from(derivationTag[0], 'base64').toString('utf8'));
  //       const taggedKeys = getTaggedDerivationKeys(parsedTag, keys.mnemonic);

  //       const taggedAddress = P2PKHAddress.from_string(taggedKeys.address)
  //         .set_chain_params(getChainParams(network))
  //         .to_string();

  //       tags.push({ tag: parsedTag, address: taggedAddress, pubKey: taggedKeys.pubKey.to_hex() });
  //     } catch (error) {
  //       console.log(error);
  //     }
  //   }

  //   const { account } = this.chromeStorageService.getCurrentAccountObject();
  //   if (!account) throw new Error('No account found!');
  //   const key: keyof ChromeStorageObject = 'accounts';
  //   const update: Partial<ChromeStorageObject['accounts']> = {
  //     [account.addresses.identityAddress]: {
  //       ...account,
  //       derivationTags: tags,
  //     },
  //   };
  //   await this.chromeStorageService.updateNested(key, update);
  // };

  // getTxOut = async (txid: string, vout: number) => {
  //   try {
  //     const { data } = await axios.get(`${JUNGLE_BUS_URL}/v1/txo/get/${txid}_${vout}`, { responseType: 'arraybuffer' });
  //     return TxOut.from_hex(Buffer.from(data).toString('hex'));
  //   } catch (error) {
  //     console.log(error);
  //   }
  // };

  // updateStoredPaymentUtxos = async (rawtx: string) => {
  //   const { account } = this.chromeStorageService.getCurrentAccountObject();
  //   if (!account) throw new Error('No account found!');
  //   const { addresses, paymentUtxos } = account;
  //   const { bsvAddress } = addresses;

  //   const tx = Transaction.from_hex(rawtx);
  //   const inputCount = tx.get_ninputs();
  //   const outputCount = tx.get_noutputs();
  //   const spends: string[] = [];

  //   for (let i = 0; i < inputCount; i++) {
  //     const txIn = tx.get_input(i);
  //     if (!txIn) continue;
  //     spends.push(`${txIn.get_prev_tx_id_hex()}_${txIn.get_vout()}`);
  //   }
  //   paymentUtxos.forEach((utxo) => {
  //     if (spends.includes(`${utxo.txid}_${utxo.vout}`)) {
  //       utxo.spent = true;
  //       utxo.spentUnixTime = getCurrentUtcTimestamp();
  //     }
  //   });

  //   const fundingScript = P2PKHAddress.from_string(bsvAddress).get_locking_script().to_hex();
  //   const txid = tx.get_id_hex();

  //   for (let i = 0; i < outputCount; i++) {
  //     const txOut = tx.get_output(i);
  //     if (!txOut) continue;
  //     const outScript = txOut?.get_script_pub_key_hex();
  //     if (outScript === fundingScript) {
  //       paymentUtxos.push({
  //         satoshis: Number(txOut.get_satoshis()),
  //         script: fundingScript,
  //         txid,
  //         vout: i,
  //         spent: false,
  //         spentUnixTime: 0,
  //       });
  //     }
  //   }

  //   const key: keyof ChromeStorageObject = 'accounts';
  //   const update: Partial<ChromeStorageObject['accounts']> = {
  //     [account.addresses.identityAddress]: {
  //       ...account,
  //       paymentUtxos,
  //     },
  //   };
  //   await this.chromeStorageService.updateNested(key, update);
  //   return paymentUtxos;
  // };

  // getTokenPriceInSats = async (tokenIds: string[]) => {
  //   const network = this.chromeStorageService.getNetwork();
  //   const result: { id: string; satPrice: number }[] = [];
  //   for (const tokenId of tokenIds) {
  //     const { data } = await axios.get<MarketResponse[]>(
  //       `${this.getBaseUrl(network)}/api/bsv20/market?sort=price_per_token&dir=asc&limit=1&offset=0&${
  //         tokenId.length > 30 ? 'id' : 'tick'
  //       }=${tokenId}`,
  //     );
  //     if (data.length > 0) {
  //       result.push({ id: tokenId, satPrice: data[0].pricePer });
  //     }
  //   }
  //   return result;
  // };
}
