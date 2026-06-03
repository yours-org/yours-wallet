import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, CheckCircle, Key, Lock, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { Theme } from '../theme.types';
import { KeysService } from '../services/Keys.service';

type Props = {
  theme: Theme;
  keysService: KeysService;
  keysAlreadyBackedUp?: boolean;
  onKeysBackedUp: () => void;
  onDismiss: () => void;
};

type Step = 1 | 2 | 3;

export const BackupPromo = ({ theme, keysService, keysAlreadyBackedUp, onKeysBackedUp, onDismiss }: Props) => {
  const [step, setStep] = useState<Step>(keysAlreadyBackedUp ? 3 : 1);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [keysDownloaded, setKeysDownloaded] = useState(!!keysAlreadyBackedUp);

  const handleDownloadKeys = async () => {
    if (!password) {
      setPasswordError('Enter your password');
      return;
    }
    setDownloading(true);
    setPasswordError('');
    try {
      const keys = await keysService.retrieveKeys(password);
      const keysToExport = {
        mnemonic: keys.mnemonic,
        payPk: keys.walletWif,
        payDerivationPath: keys.walletDerivationPath,
        ordPk: keys.ordWif,
        ordDerivationPath: keys.ordDerivationPath,
        identityPk: keys.identityWif,
        identityDerivationPath: keys.identityDerivationPath,
      };
      const blob = new Blob([JSON.stringify(keysToExport, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'yours_wallet_keys.json');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setKeysDownloaded(true);
      onKeysBackedUp();
    } catch {
      setPasswordError('Incorrect password');
    } finally {
      setDownloading(false);
    }
  };

  const slideIn = { initial: { opacity: 0, x: 40 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -40 } };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex flex-col items-center px-6 overflow-y-auto"
      style={{ background: '#010101', paddingTop: '3rem', paddingBottom: '3rem' }}
    >
      {/* Step indicator — hidden on the informational Step 3, since it would imply
          the user just completed action steps they never saw (legacy users open
          directly on step 3 with keysAlreadyBackedUp=true). */}
      {step !== 3 && (
        <div className="flex items-center gap-2 mb-6">
          {[1, 2].map((s) => (
            <div
              key={s}
              className="h-1 rounded-full transition-all duration-300"
              style={{
                width: s === step ? '24px' : '8px',
                background: s <= step ? '#34D399' : 'rgba(255,255,255,0.1)',
              }}
            />
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ── Step 1: What's changed ────────────────────────────── */}
        {step === 1 && (
          <motion.div key="step1" {...slideIn} className="flex flex-col items-center w-full max-w-[320px]">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}
            >
              <RefreshCw size={28} style={{ color: '#34D399' }} />
            </div>

            <h1 className="text-lg font-bold text-center mb-3" style={{ color: '#FFFFFF' }}>
              Your wallet has been upgraded
            </h1>

            <div className="space-y-4 mb-6">
              <p className="text-sm text-center leading-relaxed" style={{ color: '#98A2B3' }}>
                Yours Wallet now uses <span style={{ color: '#FFFFFF', fontWeight: 600 }}>BRC-100</span> — a faster,
                more private transaction system.
              </p>

              <div
                className="rounded-xl p-4"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <p className="text-xs leading-relaxed" style={{ color: '#D0D5DD' }}>
                  Your wallet now needs two things to find your assets: your{' '}
                  <span style={{ color: '#FFFFFF', fontWeight: 600 }}>keys</span> and your{' '}
                  <span style={{ color: '#FFFFFF', fontWeight: 600 }}>transaction history</span>. A seed phrase alone is
                  no longer enough.
                </p>
              </div>
            </div>

            <div className="w-full space-y-3">
              <Button theme={theme} type="primary" label="Next" onClick={() => setStep(2)} />
            </div>
          </motion.div>
        )}

        {/* ── Step 2: Back up your keys ─────────────────────────── */}
        {step === 2 && (
          <motion.div key="step2" {...slideIn} className="flex flex-col items-center w-full max-w-[320px]">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: 'rgba(253,176,34,0.1)', border: '1px solid rgba(253,176,34,0.2)' }}
            >
              <Key size={28} style={{ color: '#FDB022' }} />
            </div>

            <h1 className="text-lg font-bold text-center mb-3" style={{ color: '#FFFFFF' }}>
              Back up your keys
            </h1>

            <div className="space-y-4 mb-6">
              <p className="text-sm text-center leading-relaxed" style={{ color: '#98A2B3' }}>
                Download your keys and store them somewhere safe.
              </p>

              <div
                className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
                style={{ background: 'rgba(253,176,34,0.06)', border: '1px solid rgba(253,176,34,0.15)' }}
              >
                <Lock size={13} style={{ color: '#FDB022' }} className="shrink-0 mt-0.5" />
                <p className="text-[10px] leading-relaxed" style={{ color: '#D0D5DD' }}>
                  Keys are encrypted on this device and{' '}
                  <span style={{ color: '#FFFFFF', fontWeight: 600 }}>never sent to any server</span>.
                </p>
              </div>

              {!keysDownloaded ? (
                <div className="space-y-2">
                  <Input
                    theme={theme}
                    placeholder="Enter your password"
                    type="password"
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError('');
                    }}
                    value={password}
                  />
                  {passwordError && (
                    <p className="text-[10px] text-center" style={{ color: '#F97066' }}>
                      {passwordError}
                    </p>
                  )}
                  <Button
                    theme={theme}
                    type="secondary-outline"
                    label={downloading ? 'Downloading...' : 'Download Keys'}
                    onClick={handleDownloadKeys}
                    loading={downloading}
                  />
                </div>
              ) : (
                <div
                  className="flex items-center gap-2.5 rounded-xl px-4 py-3"
                  style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}
                >
                  <Check size={16} style={{ color: '#34D399' }} />
                  <p className="text-xs font-semibold" style={{ color: '#34D399' }}>
                    Keys downloaded. Store them somewhere safe.
                  </p>
                </div>
              )}
            </div>

            <div className="w-full space-y-3">
              <Button theme={theme} type="primary" label="Next" onClick={() => setStep(3)} disabled={!keysDownloaded} />
              {!keysDownloaded && (
                <p className="text-[10px] text-center" style={{ color: '#475467' }}>
                  Download your keys to continue
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Step 3: Already backed up (informational) ─────────── */}
        {step === 3 && (
          <motion.div key="step3" {...slideIn} className="flex flex-col items-center w-full max-w-[320px]">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}
            >
              <CheckCircle size={28} style={{ color: '#34D399' }} />
            </div>

            <h1 className="text-lg font-bold text-center mb-3" style={{ color: '#FFFFFF' }}>
              Your wallet is backed up
            </h1>

            <div className="space-y-4 mb-6">
              <p className="text-sm text-center leading-relaxed" style={{ color: '#98A2B3' }}>
                1Sat Storage is keeping a copy of your transaction history so you can restore on a new device. Your keys
                stay on this device — only transaction history is backed up.
              </p>

              <div
                className="rounded-xl p-3 space-y-2"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <p className="text-[11px] leading-relaxed" style={{ color: '#D0D5DD' }}>
                  Manage backups anytime in{' '}
                  <span style={{ color: '#FFFFFF', fontWeight: 600 }}>Settings &gt; Wallet Backup</span>. The first 1 GB
                  is free.
                </p>
              </div>
            </div>

            <div className="w-full space-y-3">
              <Button theme={theme} type="primary" label="Got it" onClick={onDismiss} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
