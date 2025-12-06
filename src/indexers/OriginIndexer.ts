import { Indexer, type IndexData, type ParseContext, type IndexSummary } from './types';
import type { Inscription } from './InscriptionIndexer';
import type { Sigma } from './SigmaIndexer';
import type { WalletAPI } from '../services/WalletServices.service';

export interface Origin {
  outpoint?: string;
  nonce?: number;
  insc?: Inscription;
  map?: { [key: string]: any };
  sigma?: Sigma[];
}

export class OriginIndexer extends Indexer {
  tag = 'origin';
  name = 'Origins';

  constructor(
    public owners = new Set<string>(),
    public network: 'mainnet' | 'testnet' = 'mainnet',
    private walletAPI: WalletAPI,
  ) {
    super(owners, network);
  }

  async parse(ctx: ParseContext, vout: number): Promise<IndexData | undefined> {
    const txo = ctx.txos[vout];

    // Only parse 1-satoshi outputs
    if (txo.satoshis !== 1n) return;

    // Calculate the satoshi position for this output
    let outSat = 0n;
    for (let i = 0; i < vout; i++) {
      outSat += ctx.txos[i].satoshis;
    }

    // Start with empty origin
    let origin: Origin = {
      outpoint: '',
      nonce: 0,
      sigma: txo.data.sigma?.data,
    };

    // Track accumulated input satoshis to find which input contains our satoshi
    let satsIn = 0n;
    let sourceOutpoint: string | undefined;

    for (const spend of ctx.spends) {
      // Check if this input's satoshi range contains our output's satoshi
      if (satsIn === outSat && spend.satoshis === 1n) {
        // This input contains our satoshi - fetch its origin data from OrdFS
        sourceOutpoint = spend.outpoint.toString();
        break;
      }

      satsIn += spend.satoshis;

      // If we've passed our satoshi position, this is a new origin
      if (satsIn > outSat) {
        origin.outpoint = txo.outpoint.toString();
        break;
      }
    }

    // If we found a source input, fetch its metadata from OrdFS
    if (sourceOutpoint) {
      const metadata = await this.walletAPI.getOrdfsMetadata(sourceOutpoint, true);
      if (metadata) {
        // Use origin and sequence from the source
        origin.outpoint = metadata.origin || sourceOutpoint;
        origin.nonce = metadata.sequence + 1;

        // Get inscription metadata from OrdFS
        if (metadata.contentType) {
          origin.insc = {
            file: {
              hash: '',
              size: 0, // We don't have size from metadata
              type: metadata.contentType,
              content: [],
            },
          };
        }

        // Use MAP data from source
        origin.map = metadata.map || {};
      } else {
        // OrdFS doesn't know about this outpoint - treat as new origin
        origin.outpoint = txo.outpoint.toString();
      }
    }

    // Merge MAP data from current output with inherited MAP data
    origin.map = {
      ...origin.map || {},
      ...txo.data.map?.data || {},
    };

    // If current output has inscription, use it (overwrites inherited inscription)
    if (txo.data.insc?.data) {
      origin.insc = txo.data.insc.data;
    }

    // Clear large file content to save space
    if (origin.insc?.file?.size && origin.insc.file.size > 4096) {
      origin.insc.file.content = [];
    }

    const tags: string[] = [];
    if (txo.owner && this.owners.has(txo.owner)) {
      tags.push(`origin:${origin.outpoint || ''}`);
      if (origin.insc?.file?.type) {
        tags.push('type');
        tags.push(`type:${origin.insc.file.type}`);
      }
    }

    // Set basket for 1sat ordinals
    txo.basket = '1sat';

    return {
      data: origin,
      tags,
    };
  }

  async summerize(ctx: ParseContext): Promise<IndexSummary | undefined> {
    let balance = 0;
    let hasTag = false;
    let icon: string | undefined;
    let id = '';

    // Check inputs
    for (const spend of ctx.spends) {
      if (spend.data[this.tag]) {
        const origin = spend.data[this.tag].data as Origin;
        if (spend.owner && this.owners.has(spend.owner)) {
          hasTag = true;
          balance--;
          if (!icon && origin?.insc?.file?.type.startsWith('image/')) {
            icon = origin?.outpoint;
            id = origin.map?.name || '';
          }
        }
      }
    }

    // Check outputs
    for (const txo of ctx.txos) {
      if (txo.data[this.tag]) {
        if (txo.owner && this.owners.has(txo.owner)) {
          hasTag = true;
          balance++;
          const origin = txo.data.origin?.data as Origin;
          if (!icon && origin?.insc?.file?.type.startsWith('image/')) {
            icon = origin?.outpoint;
          }
        }
      }
    }

    if (hasTag) {
      return {
        id,
        amount: balance,
        icon,
      };
    }
  }
}
