import { BSM, PrivateKey, Utils } from '@bsv/sdk';

export interface SignedBsmMessage {
  /** Compact Bitcoin Signed Message signature (base64). */
  signature: string;
  /** Identity compressed pubkey hex (same as getPublicKey identityKey). */
  publicKey: string;
  /** P2PKH address for the identity key. */
  address: string;
  /** Echo of the signed message. */
  message: string;
}

/**
 * Sign `message` with the wallet identity private key using Bitcoin Signed Message.
 *
 * This is NOT BRC-100 `createSignature` / `@1sat/actions` `signBsm`, which derive a
 * protocol key under MESSAGE_SIGNING_PROTOCOL. AI Bounties and similar identity logins
 * verify compact BSM against the root identity compressed pubkey.
 */
export function signIdentityBsm(privateKey: PrivateKey, message: string): SignedBsmMessage {
  if (typeof message !== 'string') {
    throw new Error('message must be a string');
  }
  const messageBytes = Utils.toArray(message, 'utf8');
  const signature = BSM.sign(messageBytes, privateKey, 'base64') as string;
  const publicKey = privateKey.toPublicKey();
  return {
    signature,
    publicKey: publicKey.toString(),
    address: publicKey.toAddress(),
    message,
  };
}
