import { Utils } from '@bsv/sdk';
import { Indexer, type IndexData, type ParseContext } from './types';
import type { Inscription } from './InscriptionIndexer';

export class OpNSIndexer extends Indexer {
  tag = 'opns';
  name = 'OpNS';

  constructor(
    public owners = new Set<string>(),
    public network: 'mainnet' | 'testnet' = 'mainnet',
  ) {
    super(owners, network);
  }

  async parse(ctx: ParseContext, vout: number): Promise<IndexData | undefined> {
    const txo = ctx.txos[vout];
    const insc = txo.data.insc?.data as Inscription;
    if (insc?.file?.type !== 'application/op-ns') return;

    txo.basket = 'opns';

    const tags: string[] = [];

    // Extract name from inscription content
    if (insc.file?.content && txo.owner && this.owners.has(txo.owner)) {
      try {
        const content = Utils.toUTF8(insc.file.content);
        const data = JSON.parse(content);
        if (data.name) {
          tags.push(`name:${data.name}`);
        }
      } catch (e) {
        // Invalid JSON or missing name field
      }
    }

    // TODO: Add validation against OpNS server (infrastructure not ready yet)

    return {
      data: insc,
      tags,
    };
  }
}
