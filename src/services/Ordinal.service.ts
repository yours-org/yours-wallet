import { KeysService } from './Keys.service';
import { ListOrdinal, MultiSendOrdinals, OrdOperationResponse } from './types/ordinal.types';
import {
  cancelOrdListings,
  createOrdListings,
  OrdP2PKH,
  purchaseOrdListing,
  purchaseOrdTokenListing,
  TokenType,
  TokenUtxo,
  transferOrdTokens,
  sendOrdinals,
  Utxo,
  Destination,
} from 'js-1sat-ord';
import { Bsv20, PurchaseOrdinal } from 'yours-wallet-provider';
import { P2PKH, PrivateKey, SatoshisPerKilobyte, Script, Transaction, Utils } from '@bsv/sdk';
import { BSV20_INDEX_FEE } from '../utils/constants';
import type { OneSatWallet, Txo } from '@1sat/wallet-toolbox';
import { isValidEmail } from '../utils/tools';
//@ts-ignore
import { PaymailClient } from '@bsv/paymail/client';
import { ChromeStorageService } from './ChromeStorage.service';
import { truncate } from '../utils/format';
import { theme } from '../theme';

const client = new PaymailClient();

export class OrdinalService {
  constructor(
    private readonly keysService: KeysService,
    private readonly wallet: OneSatWallet,
    private readonly chromeStorageService: ChromeStorageService,
  ) {}

  getBsv20s = async (): Promise<Bsv20[]> => {
    const result = await this.wallet.listOutputs({ basket: 'bsv21', includeTags: true });

    // Aggregate balances by token id, tracking confirmed (valid) vs pending
    // Tag format: id:{tokenId}:{status} where status is "valid", "invalid", or "pending"
    const balanceMap = new Map<
      string,
      { id: string; confirmed: bigint; pending: bigint; icon?: string; sym?: string; dec: number }
    >();

    for (const o of result.outputs) {
      const idTag = o.tags?.find((t) => t.startsWith('id:'));
      const amtTag = o.tags?.find((t) => t.startsWith('amt:'))?.slice(4);
      const symTag = o.tags?.find((t) => t.startsWith('sym:'))?.slice(4);
      const iconTag = o.tags?.find((t) => t.startsWith('icon:'))?.slice(5);
      const decTag = o.tags?.find((t) => t.startsWith('dec:'))?.slice(4);

      if (!idTag || !amtTag) continue;

      // Parse id:{tokenId}:{status} - status is last segment after final colon
      const idContent = idTag.slice(3); // remove "id:" prefix
      const lastColonIdx = idContent.lastIndexOf(':');
      if (lastColonIdx === -1) continue;

      const tokenId = idContent.slice(0, lastColonIdx);
      const status = idContent.slice(lastColonIdx + 1);

      // Skip invalid tokens
      if (status === 'invalid') continue;

      const isConfirmed = status === 'valid';
      const amt = BigInt(amtTag);
      const dec = decTag ? parseInt(decTag, 10) : 0;

      const existing = balanceMap.get(tokenId);
      if (existing) {
        if (isConfirmed) {
          existing.confirmed += amt;
        } else {
          existing.pending += amt;
        }
      } else {
        balanceMap.set(tokenId, {
          id: tokenId,
          confirmed: isConfirmed ? amt : 0n,
          pending: isConfirmed ? 0n : amt,
          sym: symTag,
          icon: iconTag,
          dec,
        });
      }
    }

    // Convert to Bsv20[] format
    return Array.from(balanceMap.values()).map((b) => ({
      p: 'bsv-20',
      op: 'transfer',
      dec: b.dec,
      amt: (b.confirmed + b.pending).toString(),
      id: b.id,
      sym: b.sym,
      icon: b.icon,
      all: {
        confirmed: b.confirmed,
        pending: b.pending,
      },
      listed: {
        confirmed: 0n,
        pending: 0n,
      },
    }));
  };

  transferOrdinal = async (
    destinationAddress: string,
    outpoint: string,
    password: string,
  ): Promise<OrdOperationResponse> => {
    try {
      const isAuthenticated = await this.keysService.verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }

      const ordinal = await this.wallet.loadTxo(outpoint);
      if (!ordinal) {
        return { error: 'no-ordinal' };
      }

      const keys = await this.keysService.retrieveKeys(password);
      if (!keys?.ordAddress || !keys.ordWif || !keys.walletAddress || !keys.walletWif) {
        return { error: 'no-keys' };
      }

      const changeAddress = keys.walletAddress;
      const pkMap = await this.keysService.retrievePrivateKeyMap(password);

      // Build tx
      const tx = new Transaction();
      const paymailRefs: { paymail: string; reference: string }[] = [];
      const pk = pkMap.get(ordinal.owner || '');
      if (!pk) return { error: 'no-keys' };
      const sourceTransaction = await this.wallet.loadTransaction(ordinal.outpoint.txid);
      if (!sourceTransaction) {
        console.log(`Could not find source transaction ${ordinal.outpoint.txid}`);
        return { error: 'source-tx-not-found' };
      }
      tx.addInput({
        sourceTransaction,
        sourceOutputIndex: ordinal.outpoint.vout,
        sequence: 0xffffffff,
        unlockingScriptTemplate: new OrdP2PKH().unlock(pk),
      });

      if (isValidEmail(destinationAddress)) {
        const p2pDestination = await client.getP2pOrdinalDestinations(destinationAddress, 1);
        console.log(`P2P payment destination: ${p2pDestination}`);
        paymailRefs.push({ paymail: destinationAddress, reference: p2pDestination.reference });

        tx.addOutput({
          satoshis: 1,
          lockingScript: Script.fromHex(p2pDestination.outputs[0].script),
        });
      } else {
        tx.addOutput({ satoshis: 1, lockingScript: new OrdP2PKH().lock(destinationAddress) });
      }

      tx.addOutput({
        lockingScript: new P2PKH().lock(changeAddress),
        change: true,
      });

      const fundResult = await this.wallet.listOutputs({ basket: 'fund', includeTags: true });

      let satsIn = 0;
      let fee = 0;
      const feeModel = new SatoshisPerKilobyte(this.chromeStorageService.getCustomFeeRate());
      for (const o of fundResult.outputs) {
        const [txid, voutStr] = o.outpoint.split('.');
        const vout = parseInt(voutStr, 10);
        const owner = o.tags?.find((t) => t.startsWith('own:'))?.slice(4);
        const pk = pkMap.get(owner || '');
        if (!pk) continue;
        const sourceTransaction = await this.wallet.loadTransaction(txid);
        if (!sourceTransaction) {
          console.log(`Could not find source transaction ${txid}`);
          return { error: 'source-tx-not-found' };
        }
        tx.addInput({
          sourceTransaction,
          sourceOutputIndex: vout,
          sequence: 0xffffffff,
          unlockingScriptTemplate: new P2PKH().unlock(pk),
        });
        satsIn += o.satoshis;
        fee = await feeModel.computeFee(tx);
        if (satsIn >= fee) break;
      }
      if (satsIn < fee) return { error: 'insufficient-funds' };
      await tx.fee(feeModel);
      await tx.sign();

      const response = await this.wallet.broadcast(tx, 'Transfer Ordinal');
      const txid = response.parseContext.txid;

      // Handle paymail P2P notifications
      if (paymailRefs.length > 0) {
        const txHex = tx.toHex();
        const chromeObj = this.chromeStorageService.getCurrentAccountObject();
        if (chromeObj.account) {
          for (const ref of paymailRefs) {
            console.log(`Sending P2P payment to ${ref.paymail} with reference ${ref.reference}`);
            await client.sendOrdinalTransactionP2P(ref.paymail, txHex, ref.reference, {
              sender: `${theme.settings.walletName} - ${truncate(chromeObj.account.addresses.bsvAddress, 4, 4)}`,
              note: `P2P tx from ${theme.settings.walletName}`,
            });
          }
        }
      }

      return { txid };
    } catch (error) {
      console.error('transferOrdinal failed:', error);
      return { error: JSON.stringify(error) };
    }
  };

  transferOrdinalsMulti = async (multiSend: MultiSendOrdinals): Promise<OrdOperationResponse> => {
    try {
      const { outpoints, destinationAddresses, password } = multiSend;
      const isAuthenticated = await this.keysService.verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }
      const keys = await this.keysService.retrieveKeys(password);
      if (!keys.walletWif || !keys.ordWif) return { error: 'no-keys' };

      const pkMap = await this.keysService.retrievePrivateKeyMap(password);

      // Load ordinal UTXOs
      const ordUtxos: Txo[] = [];
      for (const outpoint of outpoints) {
        const txo = await this.wallet.loadTxo(outpoint);
        if (txo) ordUtxos.push(txo);
      }

      const activeUtxos: Utxo[] = [];
      const destinations: Destination[] = [];
      ordUtxos.forEach((txo, index) => {
        const pk = pkMap.get(txo.owner || '');
        if (!pk) return;
        activeUtxos.push({
          txid: txo.outpoint.txid,
          vout: txo.outpoint.vout,
          satoshis: 1,
          script: txo.output.lockingScript ? Utils.toBase64(txo.output.lockingScript.toBinary()) : '',
          pk,
        });
        destinations.push({
          address: destinationAddresses[index],
        });
      });

      // Load funding UTXOs
      const fundResult = await this.wallet.listOutputs({ basket: 'fund', includeTags: true });
      const paymentUtxos: Utxo[] = [];
      for (const o of fundResult.outputs) {
        const [txid, voutStr] = o.outpoint.split('.');
        const vout = parseInt(voutStr, 10);
        const owner = o.tags?.find((t) => t.startsWith('own:'))?.slice(4);
        const pk = pkMap.get(owner || '');
        if (!pk) continue;
        paymentUtxos.push({
          txid,
          vout,
          satoshis: o.satoshis,
          script: o.lockingScript ? Utils.toBase64(Utils.toArray(o.lockingScript, 'hex')) : '',
          pk,
        });
      }

      const { tx } = await sendOrdinals({
        paymentUtxos,
        ordinals: activeUtxos,
        destinations,
        changeAddress: keys.walletAddress,
      });

      const response = await this.wallet.broadcast(tx, 'Transfer Ordinals');
      return { txid: response.parseContext.txid };
    } catch (error: unknown) {
      console.log(error);
      return { error: JSON.stringify(error) };
    }
  };

  sendBSV20 = async (idOrTick: string, destinationAddress: string, amount: bigint, password: string) => {
    try {
      const isAuthenticated = await this.keysService.verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }
      const keys = await this.keysService.retrieveKeys(password);
      if (!keys?.ordAddress || !keys.ordWif || !keys.walletAddress || !keys.walletWif) {
        return { error: 'no-keys' };
      }
      const pkMap = await this.keysService.retrievePrivateKeyMap(password);

      // Load funding UTXOs
      const fundResult = await this.wallet.listOutputs({ basket: 'fund', includeTags: true });
      const fundingUtxos = fundResult.outputs.map((o) => {
        const [txid, voutStr] = o.outpoint.split('.');
        const owner = o.tags?.find((t) => t.startsWith('own:'))?.slice(4);
        return {
          txid,
          vout: parseInt(voutStr, 10),
          satoshis: o.satoshis,
          script: o.lockingScript ? Utils.toBase64(Utils.toArray(o.lockingScript, 'hex')) : '',
          pk: pkMap.get(owner || ''),
        };
      });

      const tokenType = idOrTick.length > 64 ? TokenType.BSV21 : TokenType.BSV20;

      // Get valid token UTXOs from wallet - tag format is id:{tokenId}:{status}
      const tokenResult = await this.wallet.listOutputs({
        basket: 'bsv21',
        tags: [`id:${idOrTick}:valid`],
        includeTags: true,
      });
      if (!tokenResult.outputs || tokenResult.outputs.length === 0) return { error: 'no-bsv20-utxo' };

      const tokenUtxos: TokenUtxo[] = [];
      let tokensIn = 0n;
      let fundAddress = '';

      for (const o of tokenResult.outputs) {
        if (tokensIn >= amount) break;

        const [txid, voutStr] = o.outpoint.split('.');
        const vout = parseInt(voutStr, 10);
        const owner = o.tags?.find((t) => t.startsWith('own:'))?.slice(4);
        const amtTag = o.tags?.find((t) => t.startsWith('amt:'))?.slice(4);

        if (!pkMap.has(owner || '') || !amtTag) continue;

        // Load full TXO to get fundAddress from data
        const txo = await this.wallet.loadTxo(o.outpoint);
        const bsv21Data = txo.data?.bsv21?.data as { fundAddress?: string } | undefined;
        if (bsv21Data?.fundAddress && !fundAddress) {
          fundAddress = bsv21Data.fundAddress;
        }

        const t: TokenUtxo = {
          id: idOrTick,
          txid,
          vout,
          satoshis: 1,
          script: o.lockingScript ? Utils.toBase64(Utils.toArray(o.lockingScript, 'hex')) : '',
          amt: amtTag,
          pk: pkMap.get(owner || ''),
        };
        tokenUtxos.push(t);
        tokensIn += BigInt(amtTag);
      }

      if (tokensIn < amount) {
        return { error: 'insufficient-funds' };
      }

      const { tx } = await transferOrdTokens({
        distributions: [{ address: destinationAddress, tokens: Number(amount) }],
        inputTokens: tokenUtxos,
        decimals: 0,
        tokenID: idOrTick,
        protocol: tokenType,
        additionalPayments: [
          {
            to: fundAddress,
            amount: BSV20_INDEX_FEE * 2,
          },
        ],
        utxos: fundingUtxos,
        changeAddress: keys.walletAddress,
        tokenChangeAddress: keys.ordAddress,
      });

      const response = await this.wallet.broadcast(tx, 'Send BSV20');
      return { txid: response.parseContext.txid, rawTx: tx.toHex() };
    } catch (error) {
      console.error('sendBSV20 failed:', error);
      return { error: JSON.stringify(error) };
    }
  };

  listOrdinalOnGlobalOrderbook = async (listing: ListOrdinal): Promise<OrdOperationResponse> => {
    try {
      const { outpoint, price, password } = listing;
      const isAuthenticated = await this.keysService.verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }
      const keys = await this.keysService.retrieveKeys(password);

      if (!keys.walletWif || !keys.ordWif) return { error: 'no-keys' };

      const paymentPk = PrivateKey.fromWif(keys.walletWif);
      const pkMap = await this.keysService.retrievePrivateKeyMap(password);
      const ordPk = PrivateKey.fromWif(keys.ordWif);

      // Load funding UTXOs
      const fundResult = await this.wallet.listOutputs({ basket: 'fund', includeTags: true });
      const fundingUtxos = fundResult.outputs.map((o) => {
        const [txid, voutStr] = o.outpoint.split('.');
        const owner = o.tags?.find((t) => t.startsWith('own:'))?.slice(4);
        return {
          txid,
          vout: parseInt(voutStr, 10),
          satoshis: o.satoshis,
          script: o.lockingScript ? Utils.toBase64(Utils.toArray(o.lockingScript, 'hex')) : '',
          pk: pkMap.get(owner || ''),
        };
      });

      const ordUtxo = await this.wallet.loadTxo(outpoint);
      if (!ordUtxo) return { error: 'no-ord-utxo' };

      if (!pkMap.has(ordUtxo.owner || '')) {
        return { error: '' }; // default error
      }

      const { tx } = await createOrdListings({
        ordPk,
        paymentPk,
        utxos: fundingUtxos,
        listings: [
          {
            listingUtxo: {
              txid: ordUtxo.outpoint.txid,
              vout: ordUtxo.outpoint.vout,
              satoshis: Number(ordUtxo.output.satoshis),
              script: ordUtxo.output.lockingScript ? Utils.toBase64(ordUtxo.output.lockingScript.toBinary()) : '',
              pk: pkMap.get(ordUtxo.owner || ''),
            },
            price: Number(price),
            payAddress: this.keysService.bsvAddress,
            ordAddress: this.keysService.ordAddress,
          },
        ],
      });

      const response = await this.wallet.broadcast(tx, 'List Ordinal');
      return { txid: response.parseContext.txid };
    } catch (error: unknown) {
      console.log(error);
      if (error instanceof Error && error.message.includes('Not enough funds')) {
        return { error: 'insufficient-funds' };
      }
      return { error: JSON.stringify(error) };
    }
  };

  cancelGlobalOrderbookListing = async (outpoint: string, password: string): Promise<OrdOperationResponse> => {
    try {
      const isAuthenticated = await this.keysService.verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }
      const keys = await this.keysService.retrieveKeys(password);

      if (!keys.walletWif || !keys.ordWif) return { error: 'no-keys' };
      const pkMap = await this.keysService.retrievePrivateKeyMap(password);

      const paymentPk = PrivateKey.fromWif(keys.walletWif);
      const ordPk = PrivateKey.fromWif(keys.ordWif);

      // Load funding UTXOs
      const fundResult = await this.wallet.listOutputs({ basket: 'fund', includeTags: true });
      const fundingUtxos = fundResult.outputs.map((o) => {
        const [txid, voutStr] = o.outpoint.split('.');
        const owner = o.tags?.find((t) => t.startsWith('own:'))?.slice(4);
        return {
          txid,
          vout: parseInt(voutStr, 10),
          satoshis: o.satoshis,
          script: o.lockingScript ? Utils.toBase64(Utils.toArray(o.lockingScript, 'hex')) : '',
          pk: pkMap.get(owner || ''),
        };
      });

      const listingUtxo = await this.wallet.loadTxo(outpoint);
      if (!listingUtxo) return { error: 'no-ord-utxo' };

      if (!pkMap.has(listingUtxo.owner || '')) {
        return { error: '' }; // default error
      }

      const { tx } = await cancelOrdListings({
        ordPk,
        paymentPk,
        utxos: fundingUtxos,
        listingUtxos: [
          {
            txid: listingUtxo.outpoint.txid,
            vout: listingUtxo.outpoint.vout,
            satoshis: Number(listingUtxo.output.satoshis),
            script: listingUtxo.output.lockingScript ? Utils.toBase64(listingUtxo.output.lockingScript.toBinary()) : '',
            pk: pkMap.get(listingUtxo.owner || ''),
          },
        ],
      });

      const response = await this.wallet.broadcast(tx, 'Cancel Listing');
      return { txid: response.parseContext.txid };
    } catch (error: unknown) {
      console.log(error);
      if (error instanceof Error && error.message.includes('Not enough funds')) {
        return { error: 'insufficient-funds' };
      }
      return { error: JSON.stringify(error) };
    }
  };

  purchaseGlobalOrderbookListing = async (purchaseOrdinal: PurchaseOrdinal & { password: string }, listingTxo: Txo) => {
    try {
      const { marketplaceAddress, marketplaceRate, password } = purchaseOrdinal;
      const isAuthenticated = await this.keysService.verifyPassword(password);
      if (!isAuthenticated) {
        return { error: 'invalid-password' };
      }
      const keys = await this.keysService.retrieveKeys(password);

      if (!keys.walletWif || !keys.ordWif) return { error: 'no-keys' };

      const pkMap = await this.keysService.retrievePrivateKeyMap(password);

      // Load funding UTXOs
      const fundResult = await this.wallet.listOutputs({ basket: 'fund', includeTags: true });

      console.log('listingTxo', listingTxo);
      if (!listingTxo) return { error: 'no-ord-utxo' };

      // Extract listing data from Txo
      const listData = listingTxo.data?.list?.data as { payout?: number[]; price?: number } | undefined;
      if (!listData) {
        return { error: 'no-listing-data' };
      }

      const price = Number(listData.price || 0);
      const payout = listData.payout ? Utils.toBase58(listData.payout) : undefined;
      if (!payout) return { error: 'bad-listing' };

      const additionalPayments: { to: string; amount: number }[] = [];
      const marketFee = Math.ceil(price * (marketplaceRate ?? 0));

      if (marketFee > 0) {
        additionalPayments.push({
          to: marketplaceAddress ?? '',
          amount: marketFee,
        });
      }
      let tx: Transaction = new Transaction();
      const utxos: Utxo[] = [];
      for (const o of fundResult.outputs) {
        const [txid, voutStr] = o.outpoint.split('.');
        const vout = parseInt(voutStr, 10);
        const owner = o.tags?.find((t) => t.startsWith('own:'))?.slice(4);
        const pk = pkMap.get(owner || '');
        if (!pk) continue;
        utxos.push({
          txid,
          vout,
          satoshis: o.satoshis,
          script: o.lockingScript ? Utils.toBase64(Utils.toArray(o.lockingScript, 'hex')) : '',
          pk,
        });
      }
      console.log('utxos:', utxos);

      // Extract token data from Txo
      const bsv21Data = listingTxo.data?.bsv21?.data as
        | { id?: string; amt?: number | string; fundAddress?: string }
        | undefined;
      const script = listingTxo.output.lockingScript ? Utils.toBase64(listingTxo.output.lockingScript.toBinary()) : '';

      if (script && bsv21Data) {
        if (!bsv21Data.fundAddress) return { error: 'no-fund-address' };

        additionalPayments.push({
          to: bsv21Data.fundAddress,
          amount: BSV20_INDEX_FEE,
        });

        const res = await purchaseOrdTokenListing({
          protocol: TokenType.BSV21,
          ordAddress: this.keysService.ordAddress,
          utxos,
          tokenID: bsv21Data.id || '',
          changeAddress: keys.walletAddress,
          listingUtxo: {
            txid: listingTxo.outpoint.txid,
            vout: listingTxo.outpoint.vout,
            satoshis: 1,
            script,
            payout,
            price,
            amt: String(bsv21Data.amt || 0),
            id: bsv21Data.id || '',
          },
          additionalPayments,
        });
        tx = res.tx;
      } else if (script) {
        const res = await purchaseOrdListing({
          ordAddress: this.keysService.ordAddress,
          changeAddress: keys.walletAddress,
          utxos,
          listing: {
            payout,
            listingUtxo: {
              txid: listingTxo.outpoint.txid,
              vout: listingTxo.outpoint.vout,
              satoshis: 1,
              script,
            },
          },
          additionalPayments,
        });
        tx = res.tx;
      }

      const response = await this.wallet.broadcast(tx, 'Purchase Ordinal');
      return { txid: response.parseContext.txid };
    } catch (error: unknown) {
      console.log(error);
      if (error instanceof Error && error.message.includes('Not enough funds')) {
        return { error: 'insufficient-funds' };
      }
      return { error: JSON.stringify(error) };
    }
  };

  getTokenName(b: Bsv20): string {
    return b.sym || b.tick || 'Null';
  }
}
