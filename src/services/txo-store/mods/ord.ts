import { Hash, OP } from '@bsv/sdk';
import type { IndexContext } from '../models/index-context';
import { Indexer } from '../models/indexer';
import { IndexData } from '../models/index-data';
import { Outpoint } from '../models/outpoint';
import { Buffer } from 'buffer';
import { parseAddress } from '../models/address';

const ORD = Buffer.from('ord');

export interface File {
  hash: string;
  size: number;
  type: string;
  text?: string;
}

export class Origin {
  constructor(
    public outpoint: string,
    public nonce: number,
    public data: { [key: string]: any } = {},
  ) {}
}

export interface Inscription {
  file: File;
  fields?: { [key: string]: any };
  parent?: string;
}

export class Ord {
  insc?: Inscription;
  origin?: Origin;
}

export class OrdIndexer extends Indexer {
  tag = 'ord';

  parse(ctx: IndexContext, vout: number): IndexData | undefined {
    const txo = ctx.txos[vout];
    const script = ctx.tx.outputs[vout].lockingScript;
    const idxData = new IndexData();
    let fromPos: number | undefined;
    for (let i = 0; i < script.chunks.length; i++) {
      const chunk = script.chunks[i];
      if (
        i >= 2 &&
        chunk.data?.length === 3 &&
        Buffer.from(chunk.data).equals(ORD) &&
        script.chunks[i - 1].op == OP.OP_IF &&
        script.chunks[i - 2].op == OP.OP_FALSE
      ) {
        fromPos = i + 1;
      }
    }

    const ord: Ord = {};
    let owner = parseAddress(script, 0);
    if (fromPos !== undefined) {
      const insc = (ord.insc = {
        file: { hash: '', size: 0, type: '' },
        fields: {},
      } as Inscription);
      const script = ctx.tx.outputs[vout].lockingScript;
      // const events: { id: string, value: string }[] = []
      for (let i = fromPos; i < script.chunks.length; i += 2) {
        const field = script.chunks[i];
        if (field.op == OP.OP_ENDIF) {
          if (!owner) owner = parseAddress(script, i + 1);
          if (!owner && script.chunks[i + 1]?.op == OP.OP_CODESEPARATOR) {
            owner = parseAddress(script, i + 2);
          }
          break;
        }
        if (field.op > OP.OP_16) return;

        const value = script.chunks[i + 1];
        if (value.op > OP.OP_PUSHDATA4) return;

        if (field.data?.length || 0 > 1) {
          if (!insc.fields) insc.fields = {};
          insc.fields[Buffer.from(field.data!).toString()] = value.data;
          continue;
        }
        // TODO: handle MAP

        let fieldNo = 0;
        if (field.op > OP.OP_PUSHDATA4 && field.op <= OP.OP_16) {
          fieldNo = field.op - 80;
        } else if (field.data?.length) {
          fieldNo = field.data[0];
        }
        switch (fieldNo) {
          case 0:
            insc.file.size = value.data?.length || 0;
            if (!value.data?.length) break;
            insc.file.hash = Buffer.from(Hash.sha256(value.data)).toString('hex');
            idxData.events.push({ id: 'hash', value: insc.file.hash });
            if (value.data?.length <= 1024) {
              try {
                insc.file.text = new TextDecoder('utf8', { fatal: true }).decode(Buffer.from(value.data));
                const words = new Set<string>();
                insc.file.text.split(/\W+/).forEach((word) => {
                  if (word.length > 3 && word.length < 20) {
                    words.add(word);
                  }
                });
                words.forEach((word) => idxData.events.push({ id: 'word', value: word }));
              } catch {
                console.log('Error parsing text');
              }
            }
            break;
          case 1:
            insc.file.type = Buffer.from(value.data || []).toString();
            idxData.events.push({ id: 'type', value: insc.file.type });
            break;
          case 3:
            try {
              const parent = new Outpoint(new Uint8Array(value.data || []));
              if (!ctx.spends.find((s) => s.txid == parent.txidString() && s.vout == parent.vout)) continue;
              insc.parent = parent.toString();
              idxData.events.push({ id: 'parent', value: parent.toString() });
            } catch {
              console.log('Error parsing parent outpoint');
            }
            break;
          default:
            if (!insc.fields) insc.fields = {};
            insc.fields[fieldNo.toString()] = value.data && Buffer.from(value.data).toString('base64');
        }
      }
    }
    if (!ord.insc && txo.satoshis != 1n) return;
    if (owner && !txo.owner && this.owners.has(owner)) txo.owner = owner;

    let outSat = 0n;
    for (let i = 0; i < vout; i++) {
      outSat += ctx.txos[i].satoshis;
    }
    let inSat = 0n;
    for (const spend of ctx.spends) {
      idxData.deps.push(`${spend.txid}_${spend.vout}`);
      if (inSat == outSat && spend.satoshis == 1n) {
        if ((spend.data.ord?.data as Ord)?.origin) {
          ord.origin = Object.assign({}, spend.data.ord?.data?.origin) as Origin;
          ord.origin.nonce++;
        }
        break;
      } else if (inSat > outSat) {
        break;
      }
      inSat += spend.satoshis;
    }
    if (!ord.origin) {
      ord.origin = new Origin(`${txo.txid}_${txo.vout}`, 0);
    }

    if (ord.origin) {
      ord.origin.data = txo.data;
      if (txo.data.map) {
        ord.origin.data.map = Object.assign(ord.origin.data?.map || {}, txo.data.map.data);
      }
      idxData.events.push({ id: 'origin', value: ord.origin.outpoint });
    }

    idxData.data = ord;
    return idxData;
  }

  fromObj(obj: IndexData): IndexData {
    const ord: Ord = {};
    Object.assign(ord, obj.data);
    return new IndexData(ord, obj.deps);
  }
}
