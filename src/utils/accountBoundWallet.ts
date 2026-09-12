import type { WalletInterface } from '@bsv/sdk';
import type { OneSatContext } from '@1sat/actions';
import { createCWI, isCWIEventName } from '@1sat/wallet-browser';

export const WALLET_OPERATION_STOPPED = 'Wallet operation stopped. Reopen this view for the current account.';

/** Pin every CWI call, including those inside an SDK action, to this identity key. */
export async function pinCwiToIdentity(apiContext: OneSatContext, signal?: AbortSignal): Promise<OneSatContext> {
  signal?.throwIfAborted();
  const { publicKey: expectedIdentityKey } = await apiContext.wallet.getPublicKey({ identityKey: true });
  signal?.throwIfAborted();
  const wallet = createCWI(async <TResult>(action: Parameters<Parameters<typeof createCWI>[0]>[0], params: unknown) => {
    signal?.throwIfAborted();
    const response = await chrome.runtime.sendMessage({
      action,
      params,
      expectedIdentityKey,
      originator: `chrome-extension://${chrome.runtime.id}`,
    });
    signal?.throwIfAborted();
    if (!response?.success) throw new Error(response?.error || WALLET_OPERATION_STOPPED);
    return response.data as TResult;
  });
  return { ...apiContext, wallet };
}

/** Background-only dispatch: check and invoke the captured wallet without an intervening await. */
export async function callPinnedCwi(options: {
  wallet: WalletInterface;
  baseWallet?: WalletInterface;
  expectedIdentityKey: string;
  action: unknown;
  params: unknown;
  originator: string;
  isCurrent: () => boolean;
}): Promise<unknown> {
  const { wallet, expectedIdentityKey, action, params, originator, isCurrent } = options;
  if (!isCWIEventName(action) || !expectedIdentityKey || !isCurrent()) throw new Error(WALLET_OPERATION_STOPPED);
  const { publicKey } = await wallet.getPublicKey({ identityKey: true }, originator);
  if (publicKey !== expectedIdentityKey || !isCurrent()) throw new Error(WALLET_OPERATION_STOPPED);
  // Preserve the existing extension-admin send-all path through the base wallet.
  const sendAll =
    action === 'createAction' &&
    (params as { outputs?: { satoshis: number }[] })?.outputs?.some((output) => output.satoshis === 2099999999999999);
  const target = sendAll && options.baseWallet ? options.baseWallet : wallet;
  const method = target[action] as (params: unknown, originator: string) => Promise<unknown>;
  const result = await method.call(target, params, originator);
  if (!isCurrent()) throw new Error(WALLET_OPERATION_STOPPED);
  return result;
}
