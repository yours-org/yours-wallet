import { Buffer } from 'buffer';
import type { WalletInterface } from '@bsv/sdk';
import process from 'process';
import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { SweepApp, configureServices, type LegacyKeys } from '@1sat/sweep-ui';
import { createChromeCWI, OneSatServices } from '@1sat/wallet-browser';
import { createContext } from '@1sat/actions';
import { decrypt } from './utils/crypto';
import { pinCwiToIdentity, WALLET_OPERATION_STOPPED } from './utils/accountBoundWallet';
import './sweep-tab.css';

global.Buffer = Buffer;
global.process = process;
window.Buffer = Buffer;

const SERVICES_BASE_URL = 'https://api.1sat.app';

function SweepTab() {
  const [keys, setKeys] = useState<LegacyKeys | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wallet] = useState(() => createChromeCWI());
  const operationControllerRef = useRef(new AbortController());
  const [sweepWallet, setSweepWallet] = useState<WalletInterface | null>(null);

  useEffect(() => {
    configureServices(SERVICES_BASE_URL);
    let active = true;
    const accountChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || (!changes.selectedAccount && !changes.isLocked?.newValue)) return;
      active = false;
      operationControllerRef.current.abort();
      setSweepWallet(null);
      setKeys(null);
      setLoading(false);
      setError(WALLET_OPERATION_STOPPED);
    };
    chrome.storage.onChanged.addListener(accountChanged);

    chrome.storage.local.get(null, async (storage) => {
      try {
        // Check for an externally-provided WIF (e.g. from Sweep Private Key in Tools)
        const sessionData = await chrome.storage.session.get('sweepExternalWif');
        if (!active) return;
        const externalWif = sessionData.sweepExternalWif as string | undefined;
        if (externalWif) {
          // Clear it immediately so it doesn't persist
          chrome.storage.session.remove('sweepExternalWif');
          setKeys({ payPk: externalWif, ordPk: externalWif });
          setLoading(false);
          return;
        }

        // Otherwise, load legacy keys from the current account
        const { accounts, selectedAccount, isLocked } = storage;

        // passKey lives in session storage (memory-only), not local storage
        const session = await chrome.storage.session.get('passKey');
        if (!active) return;
        const passKey = session.passKey as string | undefined;

        if (isLocked || !passKey) {
          setError('Wallet is locked. Please unlock your wallet and try again.');
          setLoading(false);
          return;
        }

        if (!accounts || !selectedAccount) {
          setError('No account found.');
          setLoading(false);
          return;
        }

        const account = accounts[selectedAccount];
        if (!account?.encryptedKeys) {
          setError('No encrypted keys found.');
          setLoading(false);
          return;
        }

        const decrypted = JSON.parse(await decrypt(account.encryptedKeys, passKey));
        if (!active) return;
        if (!decrypted.walletWif && !decrypted.ordWif) {
          setError('No legacy keys found in this account.');
          setLoading(false);
          return;
        }

        setKeys({
          payPk: decrypted.walletWif,
          ordPk: decrypted.ordWif,
          identityPk: decrypted.identityWif || undefined,
        });
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Failed to load keys');
      }
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      operationControllerRef.current.abort();
      chrome.storage.onChanged.removeListener(accountChanged);
    };
  }, []);

  useEffect(() => {
    if (loading || error || !keys) return;
    let active = true;
    const controller = new AbortController();
    operationControllerRef.current = controller;
    setSweepWallet(null);
    const services = new OneSatServices('main');
    const apiContext = createContext(wallet, { chain: 'main', services, isBaseWallet: false });
    void pinCwiToIdentity(apiContext, controller.signal)
      .then((context) => {
        controller.signal.throwIfAborted();
        if (active) setSweepWallet(context.wallet);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to prepare wallet.');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [loading, error, keys, wallet]);

  if (loading) {
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#a1a1aa' }}
      >
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: '#ef4444',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        {error}
      </div>
    );
  }

  if (!keys) return null;

  if (!sweepWallet) {
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#a1a1aa' }}
      >
        Preparing wallet...
      </div>
    );
  }

  return <SweepApp legacyKeys={keys} wallet={sweepWallet} sweepOnly />;
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');
ReactDOM.createRoot(root).render(<SweepTab />);
