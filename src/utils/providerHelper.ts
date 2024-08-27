import { Utils } from '@bsv/sdk';
import { Txo } from 'ts-casemod-spv';
import { Ordinal } from 'yours-wallet-provider';

export function mapOrdinal(t: Txo): Ordinal {
  return {
    txid: t.outpoint.txid,
    vout: t.outpoint.vout,
    outpoint: t.outpoint.toString(),
    satoshis: Number(t.satoshis),
    script: Utils.toBase64(t.script),
    owner: t.owner,
    spend: '',
    origin: t.data.origin && {
      outpoint: t.data.origin.data.outpoint,
      nonce: Number(t.data.origin.data.nonce),
      num: t.block.height < 50000000 ? `${t.block.height}:${t.block.idx}:${t.outpoint.vout}` : undefined,
      data: {
        insc: t.data.origin.data?.insc,
        map: t.data.origin.data?.map,
      },
    },
    height: t.block?.height,
    idx: Number(t.block?.idx),
    data: {
      insc: t.data.insc?.data,
      list: t.data.list && {
        payout: Utils.toBase58(t.data.list.data.payout),
        price: Number(t.data.list.data.price),
      },
      lock: t.data.lock?.data,
      // TODO: add map, sigma, bsv20, bsv21
    },
  };
}
