import { useEffect, useState } from 'react';
import { useKeys } from './useKeys';
import { PrivateKey, Script, Transaction, TxIn } from 'bsv-wasm-web';
import { useBsvWasm } from './useBsvWasm';

/**
 * `SignatureRequest` contains required informations for a signer to sign a certain input of a transaction.
 */
export interface SignatureRequest {
  prevTxId: string;
  outputIndex: number;
  /** The index of input to sign. */
  inputIndex: number;
  /** The previous output satoshis value of the input to spend. */
  satoshis: number;
  /** The address(es) of corresponding private key(s) required to sign the input. */
  address: string | string[];
  /** The previous output script of input, default value is a P2PKH locking script for the `address` if omitted. */
  scriptHex?: string;
  /** The sighash type, default value is `SIGHASH_ALL | SIGHASH_FORKID` if omitted. */
  sigHashType?: number;
  /**
   * Index of the OP_CODESEPARATOR to split the previous output script at during verification.
   * If undefined, the whole script is used.
   * */
  csIdx?: number;
  /** The extra information for signing. */
  data?: unknown;
}

export type Web3GetSignaturesRequest = {
  /** The raw transaction hex to get signatures from. */
  txHex: string;

  /** The signature requst informations, see details in `SignatureRequest`. */
  sigRequests: SignatureRequest[];
};

/**
 * `SignatureResponse` contains the signing result corresponding to a `SignatureRequest`.
 */
export interface SignatureResponse {
  /** The index of input. */
  inputIndex: number;
  /** The signature.*/
  sig: string;
  /** The public key bound with the `sig`. */
  publicKey: string;
  /** The sighash type, default value is `SIGHASH_ALL | SIGHASH_FORKID` if omitted. */
  sigHashType: number;
  /** The index of the OP_CODESEPARATOR to split the previous output script at.*/
  csIdx?: number;
}

const DEFAULT_SIGHASH_TYPE = 65; // SIGHASH_ALL | SIGHASH_FORKID

export const useContracts = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { retrieveKeys, bsvAddress, ordAddress, verifyPassword } = useKeys();
  const { bsvWasmInitialized } = useBsvWasm();

  /**
   *
   * @param request An object containing the raw transaction hex and signature request informations.
   * @param password The confirm password to unlock the private keys.
   * @returns A promise which resolves to a list of `SignatureReponse` corresponding to the `request` or an error object if any.
   */
  const getSignatures = async (
    request: Web3GetSignaturesRequest,
    password: string,
  ): Promise<{ sigResponses?: SignatureResponse[]; error?: { message: string; cause?: any } }> => {
    try {
      if (!bsvWasmInitialized) throw Error('bsv-wasm not initialized!');

      setIsProcessing(true);
      const isAuthenticated = await verifyPassword(password);
      if (!isAuthenticated) {
        throw new Error('invalid-password');
      }

      const keys = await retrieveKeys(password);
      const getPrivKeys = (address: string | string[]) => {
        const addresses = address instanceof Array ? address : [address];
        return addresses.map((addr) => {
          if (addr === bsvAddress) {
            return PrivateKey.from_wif(keys.walletWif!);
          }
          if (addr === ordAddress) {
            return PrivateKey.from_wif(keys.ordWif!);
          }
          throw new Error('unknown-address', { cause: addr });
        });
      };

      const tx = Transaction.from_hex(request.txHex);
      const sigResponses: SignatureResponse[] = request.sigRequests.flatMap((sigReq) => {
        const privkeys = getPrivKeys(sigReq.address);

        return privkeys.map((privKey: PrivateKey) => {
          const addr = privKey.to_public_key().to_address();
          const script = sigReq.scriptHex ? Script.from_hex(sigReq.scriptHex) : addr.get_locking_script();
          const txIn =
            tx.get_input(sigReq.inputIndex) ||
            new TxIn(Buffer.from(sigReq.prevTxId, 'hex'), sigReq.outputIndex, script);
          txIn.set_prev_tx_id(Buffer.from(sigReq.prevTxId, 'hex'));
          txIn.set_vout(sigReq.outputIndex);
          txIn.set_satoshis(BigInt(sigReq.satoshis));
          txIn.set_locking_script(script);

          script.remove_codeseparators();
          // TODO: support multiple OP_CODESEPARATORs and get subScript according to `csIdx`.
          const subScript = script;

          const sig = tx
            .sign(
              privKey,
              sigReq.sigHashType || DEFAULT_SIGHASH_TYPE,
              sigReq.inputIndex,
              subScript,
              BigInt(sigReq.satoshis),
            )
            .to_hex();

          return {
            sig,
            publicKey: privKey.to_public_key().to_hex(),
            inputIndex: sigReq.inputIndex,
            sigHashType: sigReq.sigHashType || DEFAULT_SIGHASH_TYPE,
            csIdx: sigReq.csIdx,
          };
        });
      });
      return Promise.resolve({ sigResponses });
    } catch (err: any) {
      console.error('getSignatures error', err);
      return {
        error: {
          message: err.message ?? 'unknown',
          cause: err.cause,
        },
      };
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isProcessing,
    setIsProcessing,
    getSignatures,
  };
};
