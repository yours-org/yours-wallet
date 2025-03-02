import { PublicKey, Script, Transaction, TransactionSignature, UnlockingScript } from '@bsv/sdk';
import axios from 'axios';
import { Inscription, applyInscription } from 'js-1sat-ord';
import { ParseMode, SPVStore } from 'spv-store';
import { MNEEBalance, SendMNEE, SignatureRequest } from 'yours-wallet-provider';
import { MNEE_API, MNEE_API_TOKEN } from '../utils/constants';
import { ChromeStorageService } from './ChromeStorage.service';
import { ContractService } from './Contract.service';
import CosignTemplate from '../utils/mneeCosignTemplate';
import { MNEEConfig, MNEEOperation, MNEEUtxo } from './types/mnee.types';
import { Utils } from '@bsv/sdk';
import { ChromeStorageObject } from './types/chromeStorage.types';

export class MNEEService {
  constructor(
    private readonly chromeStorageService: ChromeStorageService,
    private readonly oneSatSPV: SPVStore,
    private readonly contractService: ContractService,
  ) {}

  getConfig = async (): Promise<MNEEConfig | undefined> => {
    try {
      const { data } = await axios.get<MNEEConfig>(`${MNEE_API}/v1/config?auth_token=${MNEE_API_TOKEN}`);
      return data;
    } catch (error) {
      console.error('Failed to fetch config:', error);
    }
  };

  getAddresses = () => {
    const addresses = this.chromeStorageService.getCurrentAccountObject().account?.addresses;
    if (!addresses) throw new Error('Could not fetch addresses from chrome storage');
    return addresses;
  };

  getBalance = async (): Promise<MNEEBalance> => {
    try {
      const config = await this.getConfig();
      if (!config) throw new Error('Config not fetched');
      const res = await this.getUtxos();
      const balance = res.reduce((acc, utxo) => {
        if (utxo.data.bsv21.op === 'transfer') {
          acc += utxo.data.bsv21.amt;
        }
        return acc;
      }, 0);

      const decimalAmount = parseFloat((balance / 10 ** (config.decimals || 0)).toFixed(config.decimals));
      const mneeBalance = { amount: balance, decimalAmount };

      const { account } = this.chromeStorageService.getCurrentAccountObject();
      if (!account) throw Error('No account found!');
      const key: keyof ChromeStorageObject = 'accounts';
      const update: Partial<ChromeStorageObject['accounts']> = {
        [account.addresses.identityAddress]: {
          ...account,
          mneeBalance,
        },
      };
      await this.chromeStorageService.updateNested(key, update);

      return mneeBalance;
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      return { amount: 0, decimalAmount: 0 };
    }
  };

  toAtomicAmount(amount: number, decimals: number): number {
    return Math.round(amount * 10 ** decimals);
  }

  private createInscription = (recipient: string, amount: number, config: MNEEConfig) => {
    const inscriptionData = {
      p: 'bsv-20',
      op: 'transfer',
      id: config.tokenId,
      amt: amount.toString(),
    };
    return {
      lockingScript: applyInscription(new CosignTemplate().lock(recipient, PublicKey.fromString(config.approver)), {
        dataB64: Buffer.from(JSON.stringify(inscriptionData)).toString('base64'),
        contentType: 'application/bsv-20',
      } as Inscription),
      satoshis: 1,
    };
  };

  getUtxos = async (ops: MNEEOperation[] = ['transfer', 'deploy+mint']): Promise<MNEEUtxo[]> => {
    try {
      const addresses = this.getAddresses();
      const { data } = await axios.post<MNEEUtxo[]>(`${MNEE_API}/v1/utxos?auth_token=${MNEE_API_TOKEN}`, [
        addresses.bsvAddress,
        addresses.ordAddress,
        addresses.identityAddress,
      ]);

      await this.oneSatSPV.ingestIfNew(
        data.map((utxo) => ({
          height: utxo.height,
          txid: utxo.txid,
          idx: utxo.idx,
          parseMode: ParseMode.PersistSummary,
        })),
      );

      if (ops.length) {
        return data.filter((utxo) =>
          ops.includes(utxo.data.bsv21.op.toLowerCase() as 'transfer' | 'burn' | 'deploy+mint'),
        );
      }

      return data;
    } catch (error) {
      console.error('Failed to fetch UTXOs:', error);
      return [];
    }
  };

  transfer = async (
    request: SendMNEE[],
    password: string,
  ): Promise<{ txid?: string; rawtx?: string; error?: string }> => {
    try {
      const config = await this.getConfig();
      if (!config) throw new Error('Config not fetched');

      const totalAmount = request.reduce((sum, req) => sum + req.amount, 0);
      if (totalAmount <= 0) return { error: 'Invalid amount' };
      const totalAtomicTokenAmount = this.toAtomicAmount(totalAmount, config.decimals);

      // Fetch UTXOs
      const utxos = await this.getUtxos();
      const totalUtxoAmount = utxos.reduce((sum, utxo) => sum + (utxo.data.bsv21.amt || 0), 0);

      if (totalUtxoAmount < totalAtomicTokenAmount) {
        return { error: 'Insufficient MNEE balance' };
      }

      // Determine fee
      const fee =
        request.find((req) => req.address === config.burnAddress) !== undefined
          ? 0
          : config.fees.find((fee) => totalAtomicTokenAmount >= fee.min && totalAtomicTokenAmount <= fee.max)?.fee;
      if (fee === undefined) return { error: 'Fee ranges inadequate' };

      // Build transaction
      const tx = new Transaction(1, [], [], 0);
      let tokensIn = 0;
      const signingAddresses: string[] = [];

      let changeAddress = '';
      while (tokensIn < totalAtomicTokenAmount + fee) {
        const utxo = utxos.shift();
        if (!utxo) return { error: 'Insufficient MNEE balance' };

        const sourceTransaction = await this.oneSatSPV.getTx(utxo.txid);
        if (!sourceTransaction) return { error: 'Failed to fetch source transaction' };

        signingAddresses.push(utxo.owners[0]);

        changeAddress = changeAddress || utxo.owners[0];
        tx.addInput({
          sourceTXID: utxo.txid,
          sourceOutputIndex: utxo.vout,
          sourceTransaction,
          unlockingScript: new UnlockingScript(),
        });

        tokensIn += utxo.data.bsv21.amt;
      }

      for (const req of request) {
        tx.addOutput(this.createInscription(req.address, this.toAtomicAmount(req.amount, config.decimals), config));
      }

      if (fee > 0) tx.addOutput(this.createInscription(config.feeAddress, fee, config));

      const change = tokensIn - totalAtomicTokenAmount - fee;
      if (change > 0) {
        tx.addOutput(this.createInscription(changeAddress, change, config));
      }

      // Signing transaction
      const sigRequests: SignatureRequest[] = tx.inputs.map((input, index) => {
        if (!input.sourceTXID) throw new Error('Source TXID is undefined');
        return {
          prevTxid: input.sourceTXID,
          outputIndex: input.sourceOutputIndex,
          inputIndex: index,
          address: signingAddresses[index],
          script: input.sourceTransaction?.outputs[input.sourceOutputIndex].lockingScript.toHex(),
          satoshis: input.sourceTransaction?.outputs[input.sourceOutputIndex].satoshis || 1,
          sigHashType:
            TransactionSignature.SIGHASH_ALL |
            TransactionSignature.SIGHASH_ANYONECANPAY |
            TransactionSignature.SIGHASH_FORKID,
        };
      });

      const rawtx = tx.toHex();
      const res = await this.contractService.getSignatures({ rawtx, sigRequests }, password);

      if (!res?.sigResponses) return { error: 'Failed to get signatures' };

      // Apply signatures
      for (const sigResponse of res.sigResponses) {
        tx.inputs[sigResponse.inputIndex].unlockingScript = new Script()
          .writeBin(Utils.toArray(sigResponse.sig, 'hex'))
          .writeBin(Utils.toArray(sigResponse.pubKey, 'hex'));
      }

      // Submit transaction using Axios
      console.log('pre-signed', tx.toHex());
      const base64Tx = Utils.toBase64(tx.toBinary());
      const response = await axios.post<{ rawtx: string }>(`${MNEE_API}/v1/transfer?auth_token=${MNEE_API_TOKEN}`, {
        rawtx: base64Tx,
      });

      if (!response.data.rawtx) return { error: 'Failed to broadcast transaction' };

      const decodedBase64AsBinary = Utils.toArray(response.data.rawtx, 'base64');
      const tx2 = Transaction.fromBinary(decodedBase64AsBinary);

      this.oneSatSPV.broadcast(tx2);

      return { txid: tx2.id('hex'), rawtx: Utils.toHex(decodedBase64AsBinary) };
    } catch (error) {
      let errorMessage = 'Transaction submission failed';

      if (axios.isAxiosError(error) && error.response) {
        const { status, data } = error.response;
        if (data?.message) {
          if (status === 423) {
            if (data.message.includes('frozen')) {
              errorMessage = 'Your address is currently frozen and cannot send tokens';
            } else if (data.message.includes('blacklisted')) {
              errorMessage = 'The recipient address is blacklisted and cannot receive tokens';
            } else {
              errorMessage = 'Transaction blocked: Address is either frozen or blacklisted';
            }
          } else if (status === 503) {
            if (data.message.includes('cosigner is paused')) {
              errorMessage = 'Token transfers are currently paused by the administrator';
            } else errorMessage = 'Service temporarily unavailable';
          } else {
            errorMessage = data.message;
          }
        }
      } else {
        errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      }

      console.error('Failed to transfer tokens:', errorMessage);
      return { error: errorMessage };
    }
  };
}
