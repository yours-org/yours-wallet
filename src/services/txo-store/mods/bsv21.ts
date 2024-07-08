import type { IndexContext } from '../models/index-context';
import { IndexData } from '../models/index-data';
import { Indexer } from '../models/indexer';
import type { Inscription } from './insc';
import type { Txo } from '../models/txo';

export enum Bsv21Status {
  Invalid = -1,
  Pending = 0,
  Valid = 1,
}

export class Bsv21 {
  status = Bsv21Status.Pending;
  public id = '';
  public op = '';
  public amt = 0n;
  public dec = 0;
  public sym?: string;
  public icon?: string;
  public contract?: string;
  public reason?: string;

  toJSON(): any {
    return {
      ...this,
      amt: this.amt.toString(),
    };
  }

  static fromJSON(obj: any): Bsv21 {
    const bsv21 = new Bsv21();
    Object.assign(bsv21, {
      ...obj,
      amt: BigInt(obj.amt),
    });
    return bsv21;
  }
}

export class Bsv21Indexer extends Indexer {
  tag = 'bsv21';

  parse(ctx: IndexContext, vout: number): IndexData | undefined {
    const txo = ctx.txos[vout];
    const insc = txo.data.insc?.data as Inscription;
    if (!insc || insc.file.type !== 'application/bsv-20') return;
    const bsv21 = Bsv21.fromJSON(JSON.parse(insc.file.text));
    const data = new IndexData(bsv21);
    if (bsv21.amt <= 0n || bsv21.amt > 2 ** 64 - 1) return;
    switch (bsv21.op) {
      case 'deploy+mint':
        if (bsv21.dec > 18) return;
        bsv21.id = `${txo.txid}_${txo.vout}`;
        bsv21.status = Bsv21Status.Valid;
        break;
      case 'transfer':
      case 'burn':
        break;
      default:
        return;
    }
    if (!bsv21.id) {
      return;
    }
    data.events.push({ id: 'op', value: bsv21.op });
    data.events.push({ id: 'id', value: bsv21.id });
    if (bsv21.contract) {
      data.events.push({ id: 'contract', value: bsv21.contract });
    }

    return data;
  }

  save(ctx: IndexContext) {
    const balance: { [id: string]: bigint } = {};
    const tokensIn: { [id: string]: Txo[] } = {};
    for (const spend of ctx.spends) {
      const bsv21 = spend.data.bsv21;
      if (!bsv21) continue;
      if (bsv21.data.status == Bsv21Status.Valid) {
        if (!tokensIn[bsv21.data.id]) {
          tokensIn[bsv21.data.id] = [];
        }
        tokensIn[bsv21.data.id].push(spend);
        balance[bsv21.data!.id] = (balance[bsv21.data!.id] || 0n) + bsv21.data.amt;
      }
    }
    const tokensOut: { [id: string]: Txo[] } = {};
    const reasons: { [id: string]: string } = {};
    for (const txo of ctx.txos) {
      const bsv21 = txo.data?.bsv21;
      if (!bsv21 || !['transfer', 'burn'].includes(bsv21.data.op)) continue;
      let token: Bsv21 | undefined;
      for (const spend of tokensIn[bsv21.data.id]) {
        token = spend.data.bsv21.data;
        bsv21.deps.push(`${spend.txid}_${spend.vout}`);
      }
      if ((balance[bsv21.data.id] || 0n) < bsv21.data.amt) {
        reasons[bsv21.data.id] = 'Insufficient inputs';
      }

      if (token) {
        bsv21.data.sym = token.sym;
        bsv21.data.icon = token.icon;
        bsv21.data.contract = token.contract;
      }

      if (!tokensOut[bsv21.data.id]) {
        tokensOut[bsv21.data.id] = [];
      }
      tokensOut[bsv21.data.id].push(txo);
      balance[bsv21.data.id] = (balance[bsv21.data.id] || 0n) - BigInt(bsv21.data.amt);
    }

    for (const [id, txos] of Object.entries(tokensOut)) {
      const reason = reasons[id];
      for (const txo of txos) {
        txo.data.bsv21.data.status = reason ? Bsv21Status.Invalid : Bsv21Status.Valid;
        txo.data.bsv21.data.reason = reason;
      }
    }
  }

  fromObj(obj: IndexData): IndexData {
    return new IndexData(Bsv21.fromJSON(obj.data), obj.deps);
  }
}
