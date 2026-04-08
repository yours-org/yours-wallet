import { Buffer } from 'buffer';
import process from 'process';
import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { SweepApp, configureServices, type LegacyKeys } from '@1sat/sweep-ui';
import { createChromeCWI } from '@1sat/wallet-browser';
import { decrypt } from './utils/crypto';
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

    chrome.storage.local.get(null, (storage) => {
      try {
        const { accounts, selectedAccount, passKey, isLocked } = storage;

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

        const decrypted = JSON.parse(decrypt(account.encryptedKeys, passKey));
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
