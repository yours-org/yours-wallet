import { Hash, OP, Script, Utils } from '@bsv/sdk';
import { Indexer, type IndexData, type ParseContext } from './types';
import { parseAddress } from './parseAddress';

export interface File {
  hash: string;
  size: number;
  type: string;
  content: number[];
}

export interface Inscription {
  file?: File;
  fields?: { [key: string]: string };
  parent?: string;
}

/**
 * InscriptionIndexer identifies and parses ordinal inscriptions.
 * These are outputs with exactly 1 satoshi containing OP_FALSE OP_IF "ord" envelope.
 *
 * Data structure: Inscription with file, fields, and optional parent
 *
 * Basket: None (no basket assignment - this is preliminary data for other indexers)
 * Events: address for owned outputs
 */
export class InscriptionIndexer extends Indexer {
  tag = 'insc';
  name = 'Inscriptions';

  constructor(
    public owners = new Set<string>(),
    public network: 'mainnet' | 'testnet' = 'mainnet',
  ) {
    super(owners, network);
  }

  async parse(ctx: ParseContext, vout: number): Promise<IndexData | undefined> {
    const txo = ctx.txos[vout];
    if (txo.satoshis !== 1n) return;

    const script = ctx.tx.outputs[vout].lockingScript;
    let fromPos: number | undefined;

    for (let i = 0; i < script.chunks.length; i++) {
      const chunk = script.chunks[i];
      if (
        i >= 2 &&
        chunk.data?.length === 3 &&
        Utils.toUTF8(chunk.data) === 'ord' &&
        script.chunks[i - 1].op === OP.OP_IF &&
        script.chunks[i - 2].op === OP.OP_FALSE
      ) {
        fromPos = i + 1;
        break;
      }
    }

    if (fromPos === undefined) return;

    if (!txo.owner) txo.owner = parseAddress(script, 0, this.network);

    const insc: Inscription = {
      file: { hash: '', size: 0, type: '', content: [] },
      fields: {},
    };

    for (let i = fromPos; i < script.chunks.length; i += 2) {
      const field = script.chunks[i];
      if (field.op === OP.OP_ENDIF) {
        if (!txo.owner) txo.owner = parseAddress(script, i + 1, this.network);
        if (!txo.owner && script.chunks[i + 1]?.op === OP.OP_CODESEPARATOR) {
          txo.owner = parseAddress(script, i + 2, this.network);
        }
        break;
      }
      if (field.op > OP.OP_16) return;
      const value = script.chunks[i + 1];
      if (value.op > OP.OP_PUSHDATA4) return;

      // TODO: Handle MAP protocol embedding when MAP indexer is ported
      if (field.data?.length && Utils.toUTF8(field.data) === 'MAP') {
        continue;
      }

      let fieldNo = 0;
      if (field.op > OP.OP_PUSHDATA4 && field.op <= OP.OP_16) {
        fieldNo = field.op - 80;
      } else if (field.data?.length) {
        fieldNo = field.data[0];
      }

      switch (fieldNo) {
        case 0:
          insc.file!.size = value.data?.length || 0;
          if (!value.data?.length) break;
          insc.file!.hash = Utils.toBase64(Hash.sha256(value.data));
          insc.file!.content = value.data;
          break;
        case 1:
          insc.file!.type = Buffer.from(value.data || []).toString();
          break;
        case 3:
          if (!value.data || value.data.length !== 36) break;
          try {
            const reader = new Utils.Reader(value.data);
            const txid = Utils.toHex(reader.read(32).reverse());
            const vout = reader.readInt32LE();
            insc.parent = `${txid}_${vout}`;
          } catch {
            console.log('Error parsing parent outpoint');
          }
          break;
        default:
          if (!insc.fields) insc.fields = {};
          insc.fields[fieldNo.toString()] =
            value.data ? Buffer.from(value.data).toString('base64') : '';
      }
    }

    const tags: string[] = [];
    if (txo.owner && this.owners.has(txo.owner)) {
      tags.push(`address:${txo.owner}`);
    }

    return {
      data: insc,
      tags,
    };
  }
}
