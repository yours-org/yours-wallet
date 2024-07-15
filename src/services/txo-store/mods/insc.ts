import { Hash, OP } from '@bsv/sdk';
import type { IndexContext } from '../models/index-context';
import { Indexer } from '../models/indexer';
import { IndexData } from '../models/index-data';
import { Outpoint } from '../models/outpoint';
import { Buffer } from 'buffer';
import { parseAddress } from '../models/address';

const ORD = Buffer.from('ord');

export class File {
  hash = '';
  size = 0;
  type = '';
  text = '';
}

export class Inscription {
  file = new File();
  fields?: { [key: string]: any };
  parent?: string;
}

export class InscriptionIndexer extends Indexer {
  tag = 'insc';

  parse(ctx: IndexContext, vout: number): IndexData | undefined {
    const script = ctx.tx.outputs[vout].lockingScript;
    for (let i = 0; i < script.chunks.length; i++) {
      const chunk = script.chunks[i];
      if (
        i >= 2 &&
        chunk.data?.length === 3 &&
        Buffer.from(chunk.data).equals(ORD) &&
        script.chunks[i - 1].op == OP.OP_IF &&
        script.chunks[i - 2].op == OP.OP_FALSE
      ) {
        return this.pareseInscription(ctx, vout, i + 1);
      }
    }
  }

  pareseInscription(ctx: IndexContext, vout: number, fromPos: number): IndexData | undefined {
    const txo = ctx.txos[vout];
    const insc = new Inscription();
    const data = new IndexData();
    data.data = insc;
    const script = ctx.tx.outputs[vout].lockingScript;
    // const events: { id: string, value: string }[] = []
    for (let i = fromPos; i < script.chunks.length; i += 2) {
      const field = script.chunks[i];
      if (field.op == OP.OP_ENDIF) {
        if (!txo.owner) {
          txo.owner = parseAddress(script, i + 1);
          if (!txo.owner && script.chunks[i + 1]?.op == OP.OP_CODESEPARATOR) {
            txo.owner = parseAddress(script, i + 1);
          }
        }
        return data;
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
          data.events.push({ id: 'hash', value: insc.file.hash });
          if (value.data?.length <= 1024) {
            try {
              insc.file.text = new TextDecoder('utf8', { fatal: true }).decode(Buffer.from(value.data));
              const words = new Set<string>();
              insc.file.text.split(' ').forEach((word) => {
                if (word.length > 3 && word.length < 20) {
                  words.add(word);
                }
              });
              words.forEach((word) => data.events.push({ id: 'word', value: word }));
            } catch {
              console.log('Error parsing text');
            }
          }
          break;
        case 1:
          insc.file.type = Buffer.from(value.data || []).toString();
          data.events.push({ id: 'type', value: insc.file.type });
          break;
        case 3:
          try {
            const parent = new Outpoint(new Uint8Array(value.data || []));
            if (!ctx.spends.find((s) => s.txid == parent.txidString() && s.vout == parent.vout)) continue;
            insc.parent = parent.toString();
            data.events.push({ id: 'parent', value: parent.toString() });
          } catch {
            console.log('Error parsing parent outpoint');
          }
          break;
        default:
          if (!insc.fields) insc.fields = {};
          insc.fields[fieldNo.toString()] = value.data && Buffer.from(value.data).toString('base64');
      }
    }
    return;
  }

  fromObj(obj: IndexData): IndexData {
    const insc = new Inscription();
    Object.assign(insc, obj.data);
    return new IndexData(insc, obj.deps);
  }
}
