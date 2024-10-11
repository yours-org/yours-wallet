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
            type: t.data.origin.data.insc.file.type,
            size: Number(t.data.origin.data.insc.file.size),
            hash: t.data.origin.data.insc.file.hash,
            text:
              t.data.origin?.data?.insc?.file?.type.startsWith('text') &&
              t.data.origin.data.insc?.file?.content &&
              Utils.toUTF8(t.data.origin.data.insc.file.content),
            json:
              t.data.origin?.data?.insc?.file?.type.startsWith('application/json') &&
              t.data.origin?.data?.insc?.file?.content &&
              JSON.parse(Utils.toUTF8(t.data.origin.data.insc.file.content)),
          },
        },
        map: t.data.origin.data?.map,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sigma: (t.data.origin.data?.sigma?.data || []).map((s: any) => ({
          ...s,
          signature: Utils.toBase64(s.signature),
        })),
      },
    },
    height: t.block?.height,
    idx: Number(t.block?.idx),
    data: {
      insc: {
        file: t.data?.insc?.data?.file && {
          type: t.data.insc.data.file.type,
          size: t.data.insc.data.file.size,
          hash: t.data.insc.data.file.hash,
          text:
            t.data.insc?.data?.file?.type.startsWith('text') &&
            t.data.insc.data.file.content &&
            Utils.toUTF8(t.data.insc.data.file.content),
          json:
            t.data.insc?.data?.file?.type.startsWith('application/json') &&
            t.data.insc.data.file.content &&
            JSON.parse(Utils.toUTF8(t.data.insc.data.file.content)),
        },
      },
      list: t.data.list && {
        payout: Utils.toBase58(t.data.list.data.payout),
        price: Number(t.data.list.data.price),
      },
      lock: t.data.lock?.data,
      map: t.data.map?.data,
      bsv20: (t.data.bsv20?.data || t.data.bsv21?.data) && {
        ...(t.data.bsv20?.data || t.data.bsv21?.data),
        amt: Number(t.data.bsv20?.data?.amt || t.data.bsv21?.data?.amt),
      },
      // TODO (DAVID CASE): add sigma
    },
  };
}
