import { Buffer } from 'buffer';
import process from 'process';
import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { SweepApp, configureServices, type LegacyKeys } from '@1sat/sweep-ui';
import { createChromeCWI, OneSatServices } from '@1sat/wallet-browser';
import { createContext } from '@1sat/actions';
import { decrypt } from './utils/crypto';
import { cancelOwnedOrdLockListings } from './utils/cancelOrdLockListings';
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

  useEffect(() => {
    configureServices(SERVICES_BASE_URL);

    chrome.storage.local.get(null, async (storage) => {
      try {
        // Check for an externally-provided WIF (e.g. from Sweep Private Key in Tools)
        const sessionData = await chrome.storage.session.get('sweepExternalWif');
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
        setError(e instanceof Error ? e.message : 'Failed to load keys');
      }
      setLoading(false);
    });
  }, []);

  // OPL-4696: cancel wallet-owned OrdLock listings once when sweep tab unlocks.
  // Hooks must run unconditionally (before early returns).
  useEffect(() => {
    if (loading || error || !keys) return;
    let cancelled = false;
    (async () => {
      try {
        const services = new OneSatServices('main');
        const apiContext = createContext(wallet, { chain: 'main', services, isBaseWallet: false });
        if (cancelled) return;
        const res = await cancelOwnedOrdLockListings(apiContext, {
          sessionKey: 'sweep-tab-load',
        });
        if (res.cancelled > 0) {
          console.log('[sweep-tab] auto-cancelled OrdLock listings', res);
        }
      } catch (err) {
        console.warn('[sweep-tab] OrdLock auto-cancel failed (continuing)', err);
      }
    })();
    return () => {
      cancelled = true;
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

  return <SweepApp legacyKeys={keys} wallet={wallet} sweepOnly />;
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');
ReactDOM.createRoot(root).render(<SweepTab />);
