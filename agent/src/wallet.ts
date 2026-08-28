import { createNodeWallet, WalletPermissionsManager, type NodeWalletResult } from '@1sat/wallet-node';
import { PrivateKey, type WalletInterface } from '@bsv/sdk';
import type { AgentConfig } from './config';
import { ADMIN_ORIGINATOR } from './constants';
import { walletDbPath } from './paths';
import { logError } from './redact';

export interface OpenedWallet {
  wallet: WalletInterface;
  baseWallet: WalletInterface;
  result: NodeWalletResult;
}

export async function openWallet(privateKey: PrivateKey, config: AgentConfig): Promise<OpenedWallet> {
  const result = await createNodeWallet({
    privateKey,
    chain: config.chain,
    storageIdentityKey: config.storageIdentityKey,
    storage: {
      provider: 'bun-sqlite',
      filename: walletDbPath(config.chain),
    },
    activeRemote: config.activeRemote,
    backups: config.backups,
    skipInitialMonitor: true,
  });

  const wrapped = wrapPermissions(result.wallet);
  return { wallet: wrapped, baseWallet: result.wallet, result };
}

function wrapPermissions(wallet: WalletInterface): WalletInterface {
  try {
    return new WalletPermissionsManager(wallet, ADMIN_ORIGINATOR) as unknown as WalletInterface;
  } catch (err) {
    logError('WalletPermissionsManager wrap skipped', err);
    return wallet;
  }
}
