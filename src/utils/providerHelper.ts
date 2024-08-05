import { Ordinal } from 'yours-wallet-provider';
import { Txo } from '../services/txo-store/models/txo';
import { Ord } from '../services/txo-store/mods/ord';

export function mapOrdinal(t: Txo): Ordinal {
  return {
    txid: t.txid,
    vout: t.vout,
    outpoint: `${t.txid}_${t.vout}`,
    satoshis: Number(t.satoshis),
    script: Buffer.from(t.script).toString('base64'),
    owner: t.owner,
    spend: '',
    origin: t.data.ord?.data.origin && {
      outpoint: t.data.ord.data.origin.outpoint,
      nonce: Number(t.data.ord.data.origin.nonce),
      num: t.block.height < 50000000 && `${t.block.height}:${t.block.idx}:${t.vout}`,
      data: {
        insc: t.data.ord.data.origin.data?.insc,
        map: t.data.ord.data.origin.data?.map,
      },
    },
    height: t.block?.height,
    idx: Number(t.block?.idx),
    data: {
      insc: (t.data.ord.data as Ord).insc,
      list: t.data.list && {
        payout: Buffer.from(t.data.list.data.payout).toString('base64'),
        price: Number(t.data.list.data.price),
      },
      lock: t.data.lock?.data,
      // TODO: add map, sigma, bsv20, bsv21
    },
  };
}
