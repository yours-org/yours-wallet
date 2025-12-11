import { Beef, ChainTracker, MerklePath, Transaction, Utils } from '@bsv/sdk';
import type {
  WalletServices,
  GetRawTxResult,
  GetMerklePathResult,
  PostBeefResult,
  GetUtxoStatusResult,
  GetStatusForTxidsResult,
  GetScriptHashHistoryResult,
  BlockHeader,
  GetUtxoStatusOutputFormat,
  ServicesCallHistory,
  ServiceCallHistory,
} from '@bsv/wallet-toolbox/out/src/sdk/WalletServices.interfaces';
import type { Chain } from '@bsv/wallet-toolbox/out/src/sdk/types';
import { WalletError } from '@bsv/wallet-toolbox/out/src/sdk/WalletError';
import type { TableOutput } from '@bsv/wallet-toolbox/out/src/storage/schema/tables/TableOutput';
import { NetWork } from 'yours-wallet-provider';
import type { Bsv21TransactionData } from '../indexers/types';

/**
 * Multi-source API service implementing WalletServices interface.
 *
 * Data sources:
 * - ordfs-server (local) - Block headers, merkle proofs, raw transactions
 * - OneSat API - Transaction broadcasting
 * - BSV21 Overlay - Token validation and metadata
 *
 * Over time, these will be unified into a single server.
 */
export class WalletAPI implements WalletServices {
  chain: Chain;
  private ordfsBaseUrl: string;
  private onesatBaseUrl: string;
  private bsv21OverlayUrl: string;

  constructor(network: NetWork, ordfsUrl?: string, bsv21OverlayUrl?: string) {
    this.chain = network === NetWork.Mainnet ? 'main' : 'test';
    this.ordfsBaseUrl = ordfsUrl || 'http://localhost:3000';
    this.onesatBaseUrl =
      network === NetWork.Mainnet
        ? 'https://ordinals.1sat.app'
        : 'https://testnet.ordinals.gorillapool.io';
    this.bsv21OverlayUrl = bsv21OverlayUrl || 'http://localhost:8080';
  }

  async getChainTracker(): Promise<ChainTracker> {
    throw new Error('ChainTracker not yet implemented');
  }

  async getHeaderForHeight(height: number): Promise<number[]> {
    const resp = await fetch(`${this.ordfsBaseUrl}/v2/block/${height}`);
    if (!resp.ok) {
      throw new Error(`Failed to fetch header for height ${height}: ${resp.statusText}`);
    }
    const arrayBuffer = await resp.arrayBuffer();
    return Array.from(new Uint8Array(arrayBuffer));
  }

  async getHeight(): Promise<number> {
    const resp = await fetch(`${this.ordfsBaseUrl}/v2/chain/height`);
    if (!resp.ok) {
      throw new Error(`Failed to fetch chain height: ${resp.statusText}`);
    }
    const data = await resp.json();
    return data.height;
  }

  async getBsvExchangeRate(): Promise<number> {
    throw new Error('Exchange rate fetching not yet implemented');
  }

  async getFiatExchangeRate(currency: 'USD' | 'GBP' | 'EUR', base?: 'USD' | 'GBP' | 'EUR'): Promise<number> {
    throw new Error('Fiat exchange rate not yet implemented');
  }

  async getRawTx(txid: string, useNext?: boolean): Promise<GetRawTxResult> {
    try {
      const resp = await fetch(`${this.ordfsBaseUrl}/v2/tx/${txid}`);
      if (!resp.ok) {
        return {
          txid,
          error: new WalletError('FETCH_FAILED', `Failed to fetch transaction: ${resp.statusText}`),
        };
      }
      const arrayBuffer = await resp.arrayBuffer();
      const rawTx = Array.from(new Uint8Array(arrayBuffer));
      return {
        txid,
        name: 'ordfs-server',
        rawTx,
      };
    } catch (error) {
      return {
        txid,
        error: new WalletError('NETWORK_ERROR', error instanceof Error ? error.message : 'Unknown error'),
      };
    }
  }

  async getMerklePath(txid: string, useNext?: boolean): Promise<GetMerklePathResult> {
    try {
      const resp = await fetch(`${this.ordfsBaseUrl}/v2/tx/${txid}/proof`);
      if (!resp.ok) {
        return {
          name: 'ordfs-server',
          error: new WalletError('FETCH_FAILED', `Failed to fetch merkle proof: ${resp.statusText}`),
        };
      }
      const arrayBuffer = await resp.arrayBuffer();
      const proofBytes = Array.from(new Uint8Array(arrayBuffer));
      const merklePath = MerklePath.fromBinary(proofBytes);

      return {
        name: 'ordfs-server',
        merklePath,
      };
    } catch (error) {
      return {
        name: 'ordfs-server',
        error: new WalletError('NETWORK_ERROR', error instanceof Error ? error.message : 'Unknown error'),
      };
    }
  }

  async postBeef(beef: Beef, txids: string[]): Promise<PostBeefResult[]> {
    const results: PostBeefResult[] = [];

    for (const txid of txids) {
      try {
        const tx = beef.findTxid(txid);
        if (!tx) {
          results.push({
            name: 'onesat-api',
            status: 'error',
            error: new WalletError('TX_NOT_FOUND', `Transaction ${txid} not found in BEEF`),
            txidResults: [
              {
                txid,
                status: 'error',
                data: { detail: 'Transaction not found in BEEF' },
              },
            ],
          });
          continue;
        }

        const resp = await fetch(`${this.onesatBaseUrl}/v5/tx`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          body: Buffer.from(tx.toBinary()),
        });

        const body = await resp.json();

        if (resp.status === 200) {
          results.push({
            name: 'onesat-api',
            status: 'success',
            txidResults: [
              {
                txid: body.txid || txid,
                status: 'success',
              },
            ],
          });
        } else {
          results.push({
            name: 'onesat-api',
            status: 'error',
            error: new WalletError(resp.status.toString(), body.error || resp.statusText),
            txidResults: [
              {
                txid,
                status: 'error',
                data: body,
              },
            ],
          });
        }
      } catch (error) {
        results.push({
          name: 'onesat-api',
          status: 'error',
          error: new WalletError('NETWORK_ERROR', error instanceof Error ? error.message : 'Unknown error'),
          txidResults: [
            {
              txid,
              status: 'error',
            },
          ],
        });
      }
    }

    return results;
  }

  hashOutputScript(script: string): string {
    const scriptBin = Utils.toArray(script, 'hex');
    return Utils.toHex(Utils.hash256(scriptBin).reverse());
  }

  async getStatusForTxids(txids: string[], useNext?: boolean): Promise<GetStatusForTxidsResult> {
    throw new Error('getStatusForTxids not yet implemented');
  }

  async isUtxo(output: TableOutput): Promise<boolean> {
    throw new Error('isUtxo not yet implemented');
  }

  async getUtxoStatus(
    output: string,
    outputFormat?: GetUtxoStatusOutputFormat,
    outpoint?: string,
    useNext?: boolean
  ): Promise<GetUtxoStatusResult> {
    throw new Error('getUtxoStatus not yet implemented');
  }

  async getScriptHashHistory(hash: string, useNext?: boolean): Promise<GetScriptHashHistoryResult> {
    throw new Error('getScriptHashHistory not yet implemented');
  }

  async hashToHeader(hash: string): Promise<BlockHeader> {
    const resp = await fetch(`${this.ordfsBaseUrl}/v2/block/${hash}`);
    if (!resp.ok) {
      throw new Error(`Failed to fetch header for hash ${hash}: ${resp.statusText}`);
    }
    const arrayBuffer = await resp.arrayBuffer();
    const headerBytes = Array.from(new Uint8Array(arrayBuffer));

    if (headerBytes.length !== 80) {
      throw new Error(`Invalid header length: ${headerBytes.length}`);
    }

    const version = headerBytes[0] | (headerBytes[1] << 8) | (headerBytes[2] << 16) | (headerBytes[3] << 24);
    const previousHash = Utils.toHex(headerBytes.slice(4, 36).reverse());
    const merkleRoot = Utils.toHex(headerBytes.slice(36, 68).reverse());
    const time = headerBytes[68] | (headerBytes[69] << 8) | (headerBytes[70] << 16) | (headerBytes[71] << 24);
    const bits = headerBytes[72] | (headerBytes[73] << 8) | (headerBytes[74] << 16) | (headerBytes[75] << 24);
    const nonce = headerBytes[76] | (headerBytes[77] << 8) | (headerBytes[78] << 16) | (headerBytes[79] << 24);

    const hashBytes = Utils.hash256(headerBytes);
    const blockHash = Utils.toHex(hashBytes.reverse());

    throw new Error('hashToHeader not yet fully implemented - need height');
  }

  async nLockTimeIsFinal(txOrLockTime: string | number[] | Transaction | number): Promise<boolean> {
    throw new Error('nLockTimeIsFinal not yet implemented');
  }

  async getBeefForTxid(txid: string): Promise<Beef> {
    const resp = await fetch(`${this.ordfsBaseUrl}/v2/tx/${txid}/beef`);
    if (!resp.ok) {
      throw new Error(`Failed to fetch BEEF for txid ${txid}: ${resp.statusText}`);
    }
    const arrayBuffer = await resp.arrayBuffer();
    const beefBytes = Array.from(new Uint8Array(arrayBuffer));
    return Beef.fromBinary(beefBytes);
  }

  getServicesCallHistory(reset?: boolean): ServicesCallHistory {
    const emptyHistory: ServiceCallHistory = {
      serviceName: '',
      historyByProvider: {},
    };

    return {
      version: 1,
      getMerklePath: { ...emptyHistory, serviceName: 'getMerklePath' },
      getRawTx: { ...emptyHistory, serviceName: 'getRawTx' },
      postBeef: { ...emptyHistory, serviceName: 'postBeef' },
      getUtxoStatus: { ...emptyHistory, serviceName: 'getUtxoStatus' },
      getStatusForTxids: { ...emptyHistory, serviceName: 'getStatusForTxids' },
      getScriptHashHistory: { ...emptyHistory, serviceName: 'getScriptHashHistory' },
      updateFiatExchangeRates: { ...emptyHistory, serviceName: 'updateFiatExchangeRates' },
    };
  }

  async getBsv21TokenByTxid(tokenId: string, txid: string): Promise<Bsv21TransactionData | undefined> {
    try {
      const resp = await fetch(`${this.bsv21OverlayUrl}/api/1sat/bsv21/${tokenId}/tx/${txid}`);
      if (!resp.ok) {
        if (resp.status === 404 || resp.status === 424) {
          return undefined;
        }
        throw new Error(`Failed to fetch BSV21 token data: ${resp.statusText}`);
      }
      return await resp.json();
    } catch (error) {
      if (error instanceof Error && error.message.includes('Failed to fetch')) {
        throw error;
      }
      return undefined;
    }
  }

  async getOrdfsMetadata(outpoint: string, includeMap = false): Promise<OrdfsMetadata | undefined> {
    try {
      const url = new URL(`${this.ordfsBaseUrl}/v2/metadata/${outpoint}`);
      if (includeMap) {
        url.searchParams.set('map', 'true');
      }
      const resp = await fetch(url.toString());
      if (!resp.ok) {
        if (resp.status === 404) {
          return undefined;
        }
        throw new Error(`Failed to fetch OrdFS metadata: ${resp.statusText}`);
      }
      return await resp.json();
    } catch (error) {
      if (error instanceof Error && error.message.includes('Failed to fetch')) {
        throw error;
      }
      return undefined;
    }
  }

  async getOrdfsContent(outpoint: string): Promise<number[] | undefined> {
    try {
      const resp = await fetch(`${this.ordfsBaseUrl}/content/${outpoint}`);
      if (!resp.ok) {
        if (resp.status === 404) {
          return undefined;
        }
        throw new Error(`Failed to fetch OrdFS content: ${resp.statusText}`);
      }
      const arrayBuffer = await resp.arrayBuffer();
      return Array.from(new Uint8Array(arrayBuffer));
    } catch (error) {
      return undefined;
    }
  }
}

export interface OrdfsMetadata {
  contentType: string;
  outpoint: string;
  origin?: string;
  sequence: number;
  map?: any;
  parent?: string;
  output?: string;
}
