import { BigNumber, BSM, Hash, OP, type PublicKey, Script, Signature, Utils } from '@bsv/sdk';
import { Indexer, type IndexData, type ParseContext } from './types';

export interface Sigma {
  algorithm: string;
  address: string;
  signature: number[];
  vin: number;
  valid: boolean;
}

export class SigmaIndexer extends Indexer {
  tag = 'sigma';
  name = 'Sigma';

  constructor(
    public owners = new Set<string>(),
    public network: 'mainnet' | 'testnet' = 'mainnet',
  ) {
    super(owners, network);
  }

  async parse(ctx: ParseContext, vout: number): Promise<IndexData | undefined> {
    const script = ctx.tx.outputs[vout].lockingScript;
    let retPos = 0;
    const sigmas: Sigma[] = [];

    for (let i = retPos + 1; i < script.chunks.length; i++) {
      const chunk = script.chunks[i];
      if (!retPos && chunk.op === OP.OP_RETURN) {
        retPos = i;
        continue;
      } else if (!retPos || chunk.data?.length !== 1 || chunk.data[0] !== 0x7c) {
        continue;
      }

      if (Utils.toUTF8(script.chunks[++i]?.data || []) !== 'SIGMA') {
        continue;
      }

      const dataPos = i - 1;
      const sigma: Sigma = {
        algorithm: script.chunks[++i]?.data ? Utils.toUTF8(script.chunks[i].data!) : '',
        address: script.chunks[++i]?.data ? Utils.toUTF8(script.chunks[i].data!) : '',
        signature: script.chunks[++i]?.data || [],
        vin: script.chunks[++i]?.data ? Number.parseInt(Utils.toUTF8(script.chunks[i].data!)) : -1,
        valid: false,
      };

      if (sigma.vin === -1) sigma.vin = vout;

      const bw = new Utils.Writer();
      bw.write(Utils.toArray(ctx.spends[sigma.vin].outpoint.txid, 'hex'));
      bw.writeUInt32LE(ctx.spends[sigma.vin].outpoint.vout);
      const inputHash = Hash.sha256(bw.toArray());

      const dataScript = new Script();
      dataScript.chunks = script.chunks.slice(0, dataPos);
      const outputHash = Hash.sha256(dataScript.toBinary());
      const msgHash = Hash.sha256(inputHash.concat(outputHash));

      const signature = Signature.fromCompact(sigma.signature);
      let publicKey: PublicKey | undefined;
      for (let recovery = 0; recovery < 4; recovery++) {
        try {
          publicKey = signature.RecoverPublicKey(recovery, new BigNumber(BSM.magicHash(msgHash)));
          const sigFitsPubkey = BSM.verify(msgHash, signature, publicKey);
          if (sigFitsPubkey && publicKey.toAddress() === sigma.address) {
            sigma.valid = true;
          }
        } catch (e) {
          // try next recovery
        }
      }
      sigmas.push(sigma);
    }

    if (!sigmas.length) return;

    return { data: sigmas, tags: [] };
  }
}
