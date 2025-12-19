import { Utils } from '@bsv/sdk';
import type { Txo } from '@1sat/wallet-toolbox';
import type { Ordinal } from 'yours-wallet-provider';

export function mapOrdinal(t: Txo): Ordinal {
  let originJson: { [key: string]: unknown } | undefined;
  let inscriptionJson: { [key: string]: unknown } | undefined;

  // Access data through the data map structure
  const originData = t.data?.origin?.data as
    | {
        outpoint?: string;
        nonce?: number;
        insc?: { file?: { type?: string; size?: number; hash?: string; content?: number[] } };
        map?: { [key: string]: unknown };
        sigma?: { data?: Array<{ algorithm?: string; address?: string; signature?: number[]; vin?: number }> };
      }
    | undefined;
  const inscData = t.data?.insc?.data as
    | { file?: { type?: string; size?: number; hash?: string; content?: number[] } }
    | undefined;
  const listData = t.data?.list?.data as { payout?: number[]; price?: number } | undefined;
  const lockData = t.data?.lock?.data as { until: number } | undefined;
  const mapData = t.data?.map?.data as { [key: string]: unknown } | undefined;
  const bsv20Data = (t.data?.bsv20?.data || t.data?.bsv21?.data) as
    | {
        p?: string;
        op?: string;
        dec?: number;
        amt?: number | string;
        id?: string;
        tick?: string;
        sym?: string;
        icon?: string;
      }
    | undefined;

  try {
    if (originData?.insc?.file?.type?.startsWith('application/json') && originData?.insc?.file?.content) {
      originJson = JSON.parse(Utils.toUTF8(originData.insc.file.content));
    }
  } catch (e) {
    console.warn('Error parsing origin json', e);
  }

  try {
    if (inscData?.file?.type?.startsWith('application/json') && inscData?.file?.content) {
      inscriptionJson = JSON.parse(Utils.toUTF8(inscData.file.content));
    }
  } catch (error) {
    console.warn('Error parsing inscription json', error);
  }

  return {
    txid: t.outpoint.txid,
    vout: t.outpoint.vout,
    outpoint: t.outpoint.toString(),
    satoshis: Number(t.output.satoshis),
    script: t.output.lockingScript ? Utils.toBase64(t.output.lockingScript.toBinary()) : undefined,
    owner: t.owner,
    spend: undefined,
    origin: originData?.outpoint
      ? {
          outpoint: originData.outpoint,
          nonce: originData.nonce,
          num: undefined, // Block height not available in new structure
          data: {
            insc: originData.insc?.file
              ? {
                  file: {
                    type: originData.insc.file.type || '',
                    size: Number(originData.insc.file.size || 0),
                    hash: originData.insc.file.hash || '',
                    text:
                      (originData.insc.file.type?.startsWith('text') ||
                        originData.insc.file.type?.startsWith('application/op-ns')) &&
                      originData.insc.file.content
                        ? Utils.toUTF8(originData.insc.file.content)
                        : undefined,
                    json: originJson,
                  },
                }
              : undefined,
            map: originData.map,
            sigma: originData.sigma?.data?.map((s) => ({
              algorithm: s.algorithm || '',
              address: s.address || '',
              signature: s.signature ? Utils.toBase64(s.signature) : '',
              vin: s.vin || 0,
            })),
          },
        }
      : undefined,
    height: 0, // Block height not available in new structure
    idx: 0,
    data: {
      insc: inscData?.file
        ? {
            file: {
              type: inscData.file.type || '',
              size: inscData.file.size || 0,
              hash: inscData.file.hash || '',
              text:
                inscData.file.type?.startsWith('text') && inscData.file.content
                  ? Utils.toUTF8(inscData.file.content)
                  : undefined,
              json: inscriptionJson,
            },
          }
        : undefined,
      list: listData?.payout
        ? {
            payout: Utils.toBase58(listData.payout),
            price: Number(listData.price || 0),
          }
        : undefined,
      lock: lockData,
      map: mapData,
      bsv20: bsv20Data
        ? {
            p: bsv20Data.p || '',
            op: bsv20Data.op || '',
            dec: bsv20Data.dec || 0,
            amt: String(bsv20Data.amt || 0),
            tick: bsv20Data.tick,
            id: bsv20Data.id,
            sym: bsv20Data.sym,
            icon: bsv20Data.icon,
            all: { confirmed: 0n, pending: 0n },
            listed: { confirmed: 0n, pending: 0n },
          }
        : undefined,
    },
  };
}
