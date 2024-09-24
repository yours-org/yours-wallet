import { Utils } from '@bsv/sdk';
import { Bsv20, Bsv21, Txo } from 'spv-store';
import { Ordinal } from 'yours-wallet-provider';

export function mapOrdinal(t: Txo): Ordinal {
  const bsv20Data = t.data.bsv20?.data as Bsv20;
  const bsv21Data = t.data.bsv21?.data as Bsv21;

  console.log('bsv21Data:', bsv21Data);
  if (bsv21Data?.icon) {
    console.log('bsv21Data.icon:', bsv21Data.icon);
  } else {
    console.log('bsv21Data.icon is undefined');
  }
  const tokenData = bsv21Data && {
    amt: Number(bsv21Data.amt),
    supply: Number(bsv21Data.supply),
    icon: bsv21Data.icon,
    id: bsv21Data.id,
    dec: bsv21Data.dec,
    op: bsv21Data.op,
    status: bsv21Data.status,
    sym: bsv21Data.sym,
  };

  console.log('tokenData', tokenData);

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
      map: t.data.map?.data,
      bsv20: tokenData as any,
      // TODO: add sigma
    },
  };
}
