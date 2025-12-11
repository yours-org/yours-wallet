import { Hash, HD, Utils } from '@bsv/sdk';
import { Indexer, type IndexData, type IndexSummary, type ParseContext } from './types';
import { Outpoint } from './Outpoint';
import type { WalletAPI } from '../services/WalletServices.service';

const FEE_XPUB =
  'xpub661MyMwAqRbcF221R74MPqdipLsgUevAAX4hZP2rywyEeShpbe3v2r9ciAvSGT6FB22TEmFLdUyeEDJL4ekG8s9H5WXbzDQPr6eW1zEYYy9';
const hdKey = HD.fromString(FEE_XPUB);

export interface Bsv21 {
  id: string;
  op: string;
  amt: bigint;
  dec: number;
  sym?: string;
  icon?: string;
  status: 'valid' | 'invalid' | 'pending';
  reason?: string;
  fundAddress: string;
}

/**
 * Bsv21Indexer identifies and validates BSV21 tokens.
 * These are 1-sat outputs with application/bsv-20 inscription type.
 *
 * Data structure: Bsv21 with id, op, amt, dec, status, etc.
 *
 * Basket: 'bsv21'
 * Events: address, id, status
 */
export class Bsv21Indexer extends Indexer {
  tag = 'bsv21';
  name = 'BSV21 Tokens';

  constructor(
    public owners = new Set<string>(),
    public network: 'mainnet' | 'testnet' = 'mainnet',
    public walletAPI: WalletAPI,
  ) {
    super(owners, network);
  }

  async parse(
    ctx: ParseContext,
    vout: number,
    isBroadcasted: boolean,
  ): Promise<IndexData | undefined> {
    const txo = ctx.txos[vout];
    const insc = txo.data.insc?.data;

    if (!insc || insc.file?.type !== 'application/bsv-20') return;

    let json: any;
    let bsv21: Partial<Bsv21>;
    try {
      const content = insc.file?.content;
      if (!content) return;
      json = JSON.parse(Utils.toUTF8(content));
      bsv21 = {
        op: json.op,
        amt: BigInt(json.amt || 0),
        dec: Number.parseInt(json.dec || '0'),
        sym: json.sym,
        icon: json.icon,
        status: 'pending',
      };
    } catch {
      return;
    }

    if (!bsv21.amt || bsv21.amt <= 0n || bsv21.amt > BigInt(2 ** 64 - 1)) return;

    const outpoint = new Outpoint(ctx.txid, vout);

    switch (bsv21.op) {
      case 'deploy+mint':
        if (bsv21.dec! > 18) return;
        bsv21.id = outpoint.toString();
        bsv21.status = 'valid';
        break;
      case 'transfer':
      case 'burn':
        if (!json.id) return;
        bsv21.id = json.id;
        break;
      default:
        return;
    }

    bsv21.fundAddress = deriveFundAddress(outpoint.toBEBinary());

    const tags: string[] = [];
    if (txo.owner && this.owners.has(txo.owner)) {
      tags.push(`address:${txo.owner}`);
      tags.push(`id:${bsv21.id!}`);
    }

    txo.basket = 'bsv21';

    return {
      data: bsv21 as Bsv21,
      tags,
    };
  }

  async summerize(ctx: ParseContext): Promise<IndexSummary | undefined> {
    const tokens: { [id: string]: { sym?: string; icon?: string; dec: number; status?: 'valid' | 'invalid' | 'pending'; tokensIn: bigint; tokensOut: bigint } } = {};
    let summaryToken: Bsv21 | undefined;
    let summaryBalance = 0;

    // Process inputs from ctx.spends (already parsed)
    for (const spend of ctx.spends) {
      const bsv21 = spend.data.bsv21;
      if (!bsv21) continue;

      const tokenData = bsv21.data as Bsv21;

      // Initialize token tracking if this is the first time we see this token
      if (!tokens[tokenData.id]) {
        tokens[tokenData.id] = {
          sym: undefined,
          icon: undefined,
          dec: 0,
          status: undefined,
          tokensIn: 0n,
          tokensOut: 0n,
        };
      }

      const token = tokens[tokenData.id];

      // Validate this specific input against the overlay
      const overlayData = await this.walletAPI.getBsv21TokenByTxid(tokenData.id, spend.outpoint.txid);
      if (overlayData) {
        const outputData = overlayData.outputs.find(o => o.vout === spend.outpoint.vout);
        const bsv21OverlayData = outputData?.data.bsv21;

        // Set token metadata from overlay (only the first time we get valid overlay data)
        if (token.sym === undefined) {
          token.sym = bsv21OverlayData?.sym;
          token.icon = bsv21OverlayData?.icon;
          token.dec = bsv21OverlayData?.dec || 0;
        }
      } else {
        // Overlay returned undefined - we don't have this input, so mark as pending
        token.status = 'pending';
      }

      // Accumulate tokens in
      token.tokensIn += tokenData.amt;

      if (!summaryToken) summaryToken = tokenData;

      // Check if this input is owned by us
      if (summaryToken && tokenData.id === summaryToken.id && spend.owner && this.owners.has(spend.owner)) {
        summaryBalance -= Number(tokenData.amt);
      }
    }

    // Process outputs: accumulate tokensOut
    for (const txo of ctx.txos) {
      const bsv21 = txo.data.bsv21;
      if (!bsv21 || !['transfer', 'burn'].includes(bsv21.data.op)) continue;

      const tokenData = bsv21.data as Bsv21;
      const token = tokens[tokenData.id];

      if (token) {
        token.tokensOut += tokenData.amt;
        tokenData.sym = token.sym;
        tokenData.icon = token.icon;
        tokenData.dec = token.dec;
      } else {
        // No inputs for this token - attempting to spend tokens that don't exist
        tokenData.status = 'invalid';
      }

      if (!summaryToken) summaryToken = tokenData;
      if (summaryToken && tokenData.id === summaryToken.id && txo.owner && this.owners.has(txo.owner)) {
        summaryBalance += Number(tokenData.amt);
      }
    }

    // Finalize token validation: check that tokensIn >= tokensOut
    for (const tokenId in tokens) {
      const token = tokens[tokenId];
      if (token.status === undefined) {
        if (token.tokensIn >= token.tokensOut) {
          token.status = 'valid';
        } else {
          token.status = 'invalid';
        }
      }
    }

    // Apply token metadata and status to outputs
    for (const txo of ctx.txos) {
      const bsv21 = txo.data.bsv21;
      if (!bsv21 || !['transfer', 'burn'].includes(bsv21.data.op)) continue;

      const tokenData = bsv21.data as Bsv21;
      const token = tokens[tokenData.id];

      if (token) {
        tokenData.status = token.status || 'pending';
      }
    }

    if (summaryToken?.sym) {
      return {
        id: summaryToken.sym,
        amount: summaryBalance / Math.pow(10, summaryToken.dec || 0),
        icon: summaryToken.icon,
      };
    }
  }
}

export function deriveFundAddress(idOrOutpoint: string | number[]): string {
  const hash = Hash.sha256(idOrOutpoint);
  const reader = new Utils.Reader(hash);
  let path = `m/21/${reader.readUInt32BE() >> 1}`;
  reader.pos = 24;
  path += `/${reader.readUInt32BE() >> 1}`;
  return hdKey.derive(path).pubKey.toAddress();
}
