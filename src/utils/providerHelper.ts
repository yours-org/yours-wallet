import { Utils } from '@bsv/sdk';
import { Txo } from 'spv-store';
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
        insc: {
          file: t.data?.origin?.data?.insc?.file && {
            ...t.data.origin.data.insc.file,
            text:
              t.data.origin?.data?.insc?.file?.type.startsWith('text') &&
              Utils.toUTF8(t.data.origin.data.insc.file.content),
            json:
              t.data.origin?.data?.insc?.file?.type.startsWith('application/json') &&
              JSON.parse(Utils.toUTF8(t.data.origin.data.insc.file.content)),
          },
        },
        map: t.data.origin.data?.map,
      },
    },
    height: t.block?.height,
    idx: Number(t.block?.idx),
    data: {
      insc: {
        file: t.data?.insc?.data?.file && {
          ...t.data.insc.data.file,
          text: t.data.insc?.data?.file?.type.startsWith('text') && Utils.toUTF8(t.data.insc.data.file.content),
          json:
            t.data.insc?.data?.file?.type.startsWith('application/json') &&
            JSON.parse(Utils.toUTF8(t.data.insc.data.file.content)),
        },
      },
      list: t.data.list && {
        payout: Utils.toBase58(t.data.list.data.payout),
        price: Number(t.data.list.data.price),
      },
      lock: t.data.lock?.data,
      map: t.data.map?.data,
      bsv20: t.data.bsv20?.data || t.data.bsv21?.data,
      // TODO: add sigma
    },
  };
}
