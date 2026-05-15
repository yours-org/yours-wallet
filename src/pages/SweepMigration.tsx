import { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PrivateKey } from '@bsv/sdk';
import { prepareSweepInputs, sweepBsv, sweepOrdinals, sweepBsv21 } from '@1sat/actions';
import { scanAddress, type ScannedAssets, type EnrichedOrdinal, type TokenBalance } from '../sweep/scanner';
import type { IndexedOutput } from '@1sat/types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Warning } from '../components/Reusable';
import { PageLoader } from '../components/PageLoader';
import { Show } from '../components/Show';
import { TopNav } from '../components/TopNav';
import { useTheme } from '../hooks/useTheme';
import { useServiceContext } from '../hooks/useServiceContext';
import { BottomMenuContext } from '../contexts/BottomMenuContext';
import { decrypt } from '../utils/crypto';
import type { Keys } from '../utils/keys';
import type { SweepStep, SweepSelection, SweepTxResult, AddressScanStatus } from '../sweep/types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Lock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowRight,
  ExternalLink,
  Loader2,
  Coins,
  Image,
  Check,
  X,
  ChevronRight,
} from 'lucide-react';

const EXPLORER_BASE = 'https://bananablocks.com/tx/';

const STEPS: SweepStep[] = ['intro', 'password', 'scanning', 'review', 'sweeping', 'results'];
const STEP_LABELS: Record<string, string> = {
  intro: 'Intro',
  password: 'Verify',
  scanning: 'Scan',
  review: 'Review',
  sweeping: 'Sweep',
  results: 'Done',
};

// Framer variants
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

export const SweepMigration = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const menuContext = useContext(BottomMenuContext);
  const { chromeStorageService, apiContext } = useServiceContext();

  const [step, setStep] = useState<SweepStep>('intro');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [legacyKeys, setLegacyKeys] = useState<Keys | null>(null);

  const [scanStatuses, setScanStatuses] = useState<AddressScanStatus[]>([]);
  const [assets, setAssets] = useState<ScannedAssets>({
    funding: [],
    ordinals: [],
    opnsNames: [],
    bsv21Tokens: [],
    bsv20Tokens: [],
    locked: [],
    totalBsv: 0,
  });

  const [selection, setSelection] = useState<SweepSelection>({
    sweepBsv: false,
    selectedOrdinals: new Set(),
    selectedBsv21TokenIds: new Set(),
  });

  const [sweepResults, setSweepResults] = useState<SweepTxResult[]>([]);
  const [currentSweepOp, setCurrentSweepOp] = useState('');

  useEffect(() => {
    menuContext?.clearSelection();
    menuContext?.hideMenu();
    return () => {
      menuContext?.showMenu();
    };
  }, [menuContext]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setPasswordError('');

    const isVerified = await chromeStorageService.verifyPassword(password);
    if (!isVerified) {
      setPasswordError('Incorrect password');
      setIsProcessing(false);
      return;
    }

    try {
      const { account } = chromeStorageService.getCurrentAccountObject();
      const passKey = await chromeStorageService.getPassKey();
      if (!account?.encryptedKeys || !passKey) {
        setPasswordError('No encrypted keys found');
        setIsProcessing(false);
        return;
      }
      const decrypted = await decrypt(account.encryptedKeys, passKey);
      const keys: Keys = JSON.parse(decrypted);
      if (!keys.walletWif && !keys.ordWif) {
        setPasswordError('No legacy keys found in this account');
        setIsProcessing(false);
        return;
      }
      setLegacyKeys(keys);
      setStep('scanning');
    } catch {
      setPasswordError('Failed to decrypt keys');
    }
    setIsProcessing(false);
  };

  const runScan = useCallback(async () => {
    if (!legacyKeys || !apiContext.services) return;

    const addresses: { address: string; label: string; wif: string }[] = [];
    if (legacyKeys.walletWif) {
      addresses.push({
        address: PrivateKey.fromWif(legacyKeys.walletWif).toPublicKey().toAddress(),
        label: 'Pay',
        wif: legacyKeys.walletWif,
      });
    }
    if (legacyKeys.ordWif) {
      const ordAddr = PrivateKey.fromWif(legacyKeys.ordWif).toPublicKey().toAddress();
      if (!addresses.some((a) => a.address === ordAddr)) {
        addresses.push({ address: ordAddr, label: 'Ordinals', wif: legacyKeys.ordWif });
      }
    }
    if (legacyKeys.identityWif) {
      const idAddr = PrivateKey.fromWif(legacyKeys.identityWif).toPublicKey().toAddress();
      if (!addresses.some((a) => a.address === idAddr)) {
        addresses.push({ address: idAddr, label: 'Identity', wif: legacyKeys.identityWif });
      }
    }

    setScanStatuses(addresses.map((a) => ({ address: a.address, label: a.label, status: 'scanning' })));

    const results: ScannedAssets[] = [];
    const promises = addresses.map(async (addr, i) => {
      try {
        const result = await scanAddress(apiContext.services!, addr.address, (p) => {
          setScanStatuses((prev) => prev.map((s, j) => (j === i ? { ...s, status: 'scanning', error: p.detail } : s)));
        });
        results[i] = result;
        setScanStatuses((prev) => prev.map((s, j) => (j === i ? { ...s, status: 'done' } : s)));
      } catch (err) {
        setScanStatuses((prev) => prev.map((s, j) => (j === i ? { ...s, status: 'error', error: String(err) } : s)));
      }
    });

    await Promise.all(promises);

    // Merge results from all addresses
    const merged: ScannedAssets = {
      funding: [],
      ordinals: [],
      opnsNames: [],
      bsv21Tokens: [],
      bsv20Tokens: [],
      locked: [],
      totalBsv: 0,
    };
    for (const r of results) {
      if (!r) continue;
      merged.funding.push(...r.funding);
      merged.ordinals.push(...r.ordinals);
      merged.opnsNames.push(...r.opnsNames);
      merged.bsv21Tokens.push(...r.bsv21Tokens);
      merged.bsv20Tokens.push(...r.bsv20Tokens);
      merged.locked.push(...r.locked);
      merged.totalBsv += r.totalBsv;
    }

    setAssets(merged);
    setStep('review');
  }, [legacyKeys, apiContext.services]);

  useEffect(() => {
    if (step === 'scanning') runScan();
  }, [step, runScan]);

  // Toggle helpers
  const toggleBsv = () => setSelection((s) => ({ ...s, sweepBsv: !s.sweepBsv }));
  const toggleOrdinal = (outpoint: string) =>
    setSelection((s) => {
      const next = new Set(s.selectedOrdinals);
      next.has(outpoint) ? next.delete(outpoint) : next.add(outpoint);
      return { ...s, selectedOrdinals: next };
    });
  const selectAllOrdinals = () =>
    setSelection((s) => ({ ...s, selectedOrdinals: new Set(assets.ordinals.map((o) => o.outpoint)) }));
  const deselectAllOrdinals = () => setSelection((s) => ({ ...s, selectedOrdinals: new Set() }));
  const toggleBsv21 = (tokenId: string) =>
    setSelection((s) => {
      const next = new Set(s.selectedBsv21TokenIds);
      next.has(tokenId) ? next.delete(tokenId) : next.add(tokenId);
      return { ...s, selectedBsv21TokenIds: next };
    });

  const hasSelection =
    selection.sweepBsv || selection.selectedOrdinals.size > 0 || selection.selectedBsv21TokenIds.size > 0;

  const hasAnyAssets =
    assets.funding.length > 0 ||
    assets.ordinals.length > 0 ||
    assets.opnsNames.length > 0 ||
    assets.bsv21Tokens.length > 0 ||
    assets.bsv20Tokens.length > 0 ||
    assets.locked.length > 0;

  // Convert IndexedOutput to the shape prepareSweepInputs expects.
  // `score` is required by IndexedOutput but unused for sweep preparation, so 0 is fine.
  const toSweepInputs = (outputs: IndexedOutput[]): IndexedOutput[] =>
    outputs.map((o) => ({ outpoint: o.outpoint, satoshis: o.satoshis ?? 0, score: 0 }));

  const executeSweeps = async () => {
    if (!legacyKeys) return;
    setStep('sweeping');
    const results: SweepTxResult[] = [];

    if (selection.sweepBsv && assets.funding.length > 0) {
      setCurrentSweepOp('Sweeping BSV...');
      try {
        const inputs = await prepareSweepInputs(apiContext, toSweepInputs(assets.funding));
        const payKey = PrivateKey.fromWif(legacyKeys.walletWif);
        const resp = await sweepBsv.execute(apiContext, {
          inputs,
          keys: inputs.map(() => payKey),
          amount: selection.bsvAmount,
        });
        results.push({
          type: 'bsv',
          label: `BSV (${assets.totalBsv.toLocaleString()} sats)`,
          txid: resp.txid,
          error: resp.error,
        });
      } catch (err) {
        results.push({ type: 'bsv', label: 'BSV', error: String(err) });
      }
    }

    if (selection.selectedOrdinals.size > 0) {
      setCurrentSweepOp('Sweeping Ordinals...');
      try {
        const selectedOutputs = assets.ordinals.filter((o) => selection.selectedOrdinals.has(o.outpoint));
        const inputs = await prepareSweepInputs(apiContext, toSweepInputs(selectedOutputs));
        const ordKey = PrivateKey.fromWif(legacyKeys.ordWif);
        const resp = await sweepOrdinals.execute(apiContext, { inputs, keys: inputs.map(() => ordKey) });
        results.push({
          type: 'ordinals',
          label: `Ordinals (${selection.selectedOrdinals.size})`,
          txid: resp.txid,
          error: resp.error,
        });
      } catch (err) {
        results.push({ type: 'ordinals', label: 'Ordinals', error: String(err) });
      }
    }

    for (const token of assets.bsv21Tokens) {
      if (!selection.selectedBsv21TokenIds.has(token.tokenId)) continue;
      const label = token.symbol || token.tokenId.slice(0, 8);
      setCurrentSweepOp(`Sweeping ${label}...`);
      try {
        const inputs = await prepareSweepInputs(apiContext, toSweepInputs(token.outputs));
        const tokenKey = PrivateKey.fromWif(legacyKeys.ordWif);
        const resp = await sweepBsv21.execute(apiContext, {
          inputs: inputs.map((inp) => ({ ...inp, tokenId: token.tokenId, amount: token.totalAmount.toString() })),
          keys: inputs.map(() => tokenKey),
        });
        results.push({ type: 'bsv21', label: `${label} (${token.totalAmount})`, txid: resp.txid, error: resp.error });
      } catch (err) {
        results.push({ type: 'bsv21', label, error: String(err) });
      }
    }

    setSweepResults(results);
    setStep('results');
  };

  const handleSkip = async () => {
    await chromeStorageService.update({ sweepCompleted: true });
    navigate('/bsv-wallet');
  };

  const handleDone = async () => {
    await chromeStorageService.update({ sweepCompleted: true });
    navigate('/bsv-wallet');
  };

  // ===================== SHARED LAYOUT =====================

  const accent = theme.color.component.primaryButtonLeftGradient;
  const contrast = theme.color.global.contrast;
  const gray = '#98A2B3';
  const rowBg = '#17191E';
  const errorColor = '#F87171';

  const currentStepIndex = STEPS.indexOf(step);

  // Step progress bar (shared)
  const StepProgress = () => (
    <div className="flex items-center gap-1 w-full mb-6">
      {STEPS.map((s, i) => {
        const isActive = i === currentStepIndex;
        const isDone = i < currentStepIndex;
        return (
          <div key={s} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="h-1 w-full rounded-full transition-all duration-500"
              style={{
                background: isDone
                  ? `linear-gradient(90deg, #A1FF8B, #34D399)`
                  : isActive
                    ? accent + '70'
                    : contrast + '15',
              }}
            />
            <span
              className="text-[9px] font-medium tracking-wide"
              style={{
                color: isDone || isActive ? accent : gray,
                opacity: isDone || isActive ? 1 : 0.5,
              }}
            >
              {STEP_LABELS[s]}
            </span>
          </div>
        );
      })}
    </div>
  );

  // ===================== RENDER =====================

  // Step: Intro
  if (step === 'intro') {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#010101' }}>
        <TopNav />
        <div className="flex-1 flex flex-col items-center px-5 py-6 max-w-lg mx-auto w-full">
          <StepProgress />

          <motion.div
            className="flex flex-col items-center w-full"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            {/* Title */}
            <motion.h1 variants={fadeUp} className="text-2xl font-bold mb-2 text-center" style={{ color: contrast }}>
              Migrate to BRC-100
            </motion.h1>
            <motion.p variants={fadeUp} className="text-sm text-center mb-6 leading-relaxed" style={{ color: gray }}>
              Your wallet has been upgraded. Sweep assets from your legacy addresses into your new BRC-100 wallet.
            </motion.p>

            {/* Info cards */}
            <motion.div
              variants={fadeUp}
              className="w-full rounded-2xl p-4 mb-3 flex gap-3 items-start"
              style={{ background: rowBg, border: `1px solid ${contrast}10` }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${accent}15` }}
              >
                <Shield size={16} style={{ color: accent }} />
              </div>
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: contrast }}>
                  Your keys are safe
                </p>
                <p className="text-xs leading-relaxed" style={{ color: gray }}>
                  Your old keys will always be preserved, even after sweeping.
                </p>
              </div>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="w-full rounded-2xl p-4 mb-6 flex gap-3 items-start"
              style={{ background: rowBg, border: `1px solid ${contrast}10` }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: '#F59E0B15' }}
              >
                <AlertTriangle size={16} style={{ color: '#F59E0B' }} />
              </div>
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: contrast }}>
                  Some assets need manual handling
                </p>
                <p className="text-xs leading-relaxed" style={{ color: gray }}>
                  BSV-20, RUN tokens, and time-locked outputs can't be swept automatically. You'll be guided through
                  your options.
                </p>
              </div>
            </motion.div>

            {/* Actions */}
            <motion.div variants={fadeUp} className="w-full flex flex-col gap-3">
              <Button
                theme={theme}
                type="primary"
                label="Start Migration"
                onClick={() => {
                  chrome.tabs.create({ url: chrome.runtime.getURL('sweep-tab.html') });
                }}
              />
              <Button theme={theme} type="secondary-outline" label="Back" onClick={() => navigate(-1)} />
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Step: Password
  if (step === 'password') {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#010101' }}>
        <TopNav />
        <div className="flex-1 flex flex-col items-center px-5 py-6 max-w-lg mx-auto w-full">
          <StepProgress />

          <motion.div
            className="flex flex-col items-center w-full"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            {/* Icon */}
            <motion.div variants={fadeUp} className="mb-5">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: `${accent}15`, border: `1px solid ${accent}30` }}
              >
                <Lock size={28} style={{ color: accent }} />
              </div>
            </motion.div>

            <motion.h1 variants={fadeUp} className="text-2xl font-bold mb-2 text-center" style={{ color: contrast }}>
              Verify Password
            </motion.h1>
            <motion.p variants={fadeUp} className="text-sm text-center mb-6" style={{ color: gray }}>
              Enter your wallet password to decrypt your legacy keys.
            </motion.p>

            <motion.form variants={fadeUp} onSubmit={handlePasswordSubmit} className="w-full flex flex-col gap-3">
              <Input
                theme={theme}
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Show when={!!passwordError}>
                <Warning theme={theme} style={{ margin: '0' }}>
                  {passwordError}
                </Warning>
              </Show>
              <Button
                theme={theme}
                type="primary"
                label={isProcessing ? 'Decrypting...' : 'Continue'}
                disabled={isProcessing || !password}
                isSubmit
              />
            </motion.form>

            <motion.div variants={fadeUp} className="w-full mt-2">
              <Button theme={theme} type="secondary-outline" label="Back" onClick={() => setStep('intro')} />
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Step: Scanning
  if (step === 'scanning') {
    const doneCount = scanStatuses.filter((s) => s.status === 'done').length;
    const allDone = scanStatuses.length > 0 && doneCount === scanStatuses.length;

    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#010101' }}>
        <TopNav />
        <div className="flex-1 flex flex-col items-center px-5 py-6 max-w-lg mx-auto w-full">
          <StepProgress />

          <motion.div
            className="flex flex-col items-center w-full"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            <motion.h1 variants={fadeUp} className="text-2xl font-bold mb-2 text-center" style={{ color: contrast }}>
              Scanning Addresses
            </motion.h1>
            <motion.p variants={fadeUp} className="text-sm text-center mb-6" style={{ color: gray }}>
              Looking for assets on {scanStatuses.length} legacy address{scanStatuses.length !== 1 ? 'es' : ''}...
            </motion.p>

            <motion.div variants={staggerContainer} className="w-full flex flex-col gap-2 mb-6">
              {scanStatuses.map((s, i) => {
                const isDone = s.status === 'done';
                const isError = s.status === 'error';
                const isScanning = s.status === 'scanning';

                return (
                  <motion.div
                    key={s.address}
                    variants={fadeUp}
                    className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{
                      background: isError ? `${errorColor}10` : isDone ? `${accent}10` : rowBg,
                      border: `1px solid ${isError ? errorColor : isDone ? accent : contrast}15`,
                    }}
                  >
                    {/* Status indicator */}
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        background: isError ? `${errorColor}20` : isDone ? `${accent}20` : `${gray}15`,
                      }}
                    >
                      {isDone && <Check size={13} style={{ color: accent }} />}
                      {isError && <X size={13} style={{ color: errorColor }} />}
                      {isScanning && (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <Loader2 size={13} style={{ color: gray }} />
                        </motion.div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <span
                        className="text-sm font-semibold"
                        style={{ color: isError ? errorColor : isDone ? accent : contrast }}
                      >
                        {s.label}
                      </span>
                      <span className="text-xs ml-2 font-mono" style={{ color: gray }}>
                        {s.address.slice(0, 6)}...{s.address.slice(-4)}
                      </span>
                    </div>

                    <span
                      className="text-xs font-medium"
                      style={{ color: isError ? errorColor : isDone ? accent : gray }}
                    >
                      {isDone ? 'Done' : isError ? 'Error' : 'Scanning'}
                    </span>
                  </motion.div>
                );
              })}
            </motion.div>

            <Show when={scanStatuses.length === 0}>
              <PageLoader message="Preparing scan..." theme={theme} />
            </Show>

            <Show when={scanStatuses.length > 0 && !allDone}>
              <div className="w-full rounded-2xl p-4 flex items-center gap-3" style={{ background: rowBg }}>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}>
                  <Loader2 size={18} style={{ color: accent }} />
                </motion.div>
                <span className="text-sm" style={{ color: gray }}>
                  {doneCount}/{scanStatuses.length} addresses scanned
                </span>
                {/* progress bar */}
                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: `${contrast}10` }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, #A1FF8B, #34D399)` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(doneCount / Math.max(scanStatuses.length, 1)) * 100}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>
            </Show>
          </motion.div>
        </div>
      </div>
    );
  }

  // Step: Review
  if (step === 'review') {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#010101' }}>
        <TopNav />
        <div className="flex-1 flex flex-col items-center px-5 py-6 max-w-lg mx-auto w-full">
          <StepProgress />

          <Show when={!hasAnyAssets}>
            <motion.div
              className="flex flex-col items-center w-full"
              variants={staggerContainer}
              initial="hidden"
              animate="show"
            >
              <motion.div variants={fadeUp} className="mb-5">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: `${accent}15`, border: `1px solid ${accent}30` }}
                >
                  <CheckCircle size={28} style={{ color: accent }} />
                </div>
              </motion.div>
              <motion.h1 variants={fadeUp} className="text-2xl font-bold mb-2 text-center" style={{ color: contrast }}>
                All Clear
              </motion.h1>
              <motion.p variants={fadeUp} className="text-sm text-center mb-6" style={{ color: gray }}>
                No assets found on your legacy addresses. Your keys are preserved — you can scan again from Tools.
              </motion.p>
              <motion.div variants={fadeUp} className="w-full">
                <Button theme={theme} type="primary" label="Done" onClick={handleDone} />
              </motion.div>
            </motion.div>
          </Show>

          <Show when={hasAnyAssets}>
            <motion.div
              className="flex flex-col items-center w-full"
              variants={staggerContainer}
              initial="hidden"
              animate="show"
            >
              <motion.h1 variants={fadeUp} className="text-xl font-bold mb-1 text-center" style={{ color: contrast }}>
                Select Assets to Sweep
              </motion.h1>
              <motion.p variants={fadeUp} className="text-sm text-center mb-4" style={{ color: gray }}>
                Choose which assets to move to your BRC-100 wallet.
              </motion.p>

              {/* Scrollable asset sections */}
              <motion.div
                variants={fadeUp}
                className="w-full flex flex-col gap-3 overflow-y-auto mb-4"
                style={{ maxHeight: '22rem' }}
              >
                {/* BSV Funding */}
                <Show when={assets.funding.length > 0}>
                  <div className="rounded-2xl p-4" style={{ background: rowBg, border: `1px solid ${contrast}10` }}>
                    {/* Card header */}
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center"
                        style={{ background: `${accent}15` }}
                      >
                        <Coins size={14} style={{ color: accent }} />
                      </div>
                      <span className="text-sm font-semibold" style={{ color: contrast }}>
                        BSV Funding
                      </span>
                      <span
                        className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: `${accent}18`, color: accent }}
                      >
                        {(assets.totalBsv / 1e8).toFixed(8)} BSV
                      </span>
                    </div>
                    {/* Row */}
                    <label className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2 transition-colors hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={selection.sweepBsv}
                        onChange={toggleBsv}
                        className="w-4 h-4 rounded flex-shrink-0"
                        style={{ accentColor: accent }}
                      />
                      <span className="text-sm" style={{ color: contrast }}>
                        Sweep {assets.totalBsv.toLocaleString()} sats ({assets.funding.length} UTXOs)
                      </span>
                    </label>
                  </div>
                </Show>

                {/* Ordinals */}
                <Show when={assets.ordinals.length > 0}>
                  <div className="rounded-2xl p-4" style={{ background: rowBg, border: `1px solid ${contrast}10` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center"
                        style={{ background: `${accent}15` }}
                      >
                        <Image size={14} style={{ color: accent }} />
                      </div>
                      <span className="text-sm font-semibold" style={{ color: contrast }}>
                        Ordinals
                      </span>
                      <span
                        className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: `${accent}18`, color: accent }}
                      >
                        {assets.ordinals.length}
                      </span>
                    </div>
                    {/* Select/clear */}
                    <div className="flex gap-4 mb-2 px-1">
                      <button
                        type="button"
                        onClick={selectAllOrdinals}
                        className="text-xs font-medium hover:underline"
                        style={{ color: accent }}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={deselectAllOrdinals}
                        className="text-xs font-medium hover:underline"
                        style={{ color: gray }}
                      >
                        Clear
                      </button>
                    </div>
                    {assets.ordinals.map((o) => (
                      <label
                        key={o.outpoint}
                        className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2 transition-colors hover:bg-white/5"
                      >
                        <input
                          type="checkbox"
                          checked={selection.selectedOrdinals.has(o.outpoint)}
                          onChange={() => toggleOrdinal(o.outpoint)}
                          className="w-4 h-4 rounded flex-shrink-0"
                          style={{ accentColor: accent }}
                        />
                        <span className="text-sm flex-1 truncate" style={{ color: contrast }}>
                          {o.name || o.contentType || (
                            <span className="font-mono text-xs">
                              {o.outpoint.slice(0, 8)}...{o.outpoint.slice(-6)}
                            </span>
                          )}
                        </span>
                        {o.contentType && (
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: `${accent}18`, color: accent }}
                          >
                            {o.contentType.split('/').pop()}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </Show>

                {/* OpNS Names */}
                <Show when={assets.opnsNames.length > 0}>
                  <div className="rounded-2xl p-4" style={{ background: rowBg, border: `1px solid ${contrast}10` }}>
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center"
                        style={{ background: `${accent}15` }}
                      >
                        <Image size={14} style={{ color: accent }} />
                      </div>
                      <span className="text-sm font-semibold" style={{ color: contrast }}>
                        OpNS Names
                      </span>
                      <span
                        className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: `${accent}18`, color: accent }}
                      >
                        {assets.opnsNames.length}
                      </span>
                    </div>
                    {assets.opnsNames.map((o) => (
                      <label
                        key={o.outpoint}
                        className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2 transition-colors hover:bg-white/5"
                      >
                        <input
                          type="checkbox"
                          checked={selection.selectedOrdinals.has(o.outpoint)}
                          onChange={() => toggleOrdinal(o.outpoint)}
                          className="w-4 h-4 rounded flex-shrink-0"
                          style={{ accentColor: accent }}
                        />
                        <span className="text-sm" style={{ color: contrast }}>
                          {o.name || o.outpoint.slice(0, 12)}
                        </span>
                      </label>
                    ))}
                  </div>
                </Show>

                {/* BSV-21 Tokens */}
                <Show when={assets.bsv21Tokens.length > 0}>
                  <div className="rounded-2xl p-4" style={{ background: rowBg, border: `1px solid ${contrast}10` }}>
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center"
                        style={{ background: `${accent}15` }}
                      >
                        <Coins size={14} style={{ color: accent }} />
                      </div>
                      <span className="text-sm font-semibold" style={{ color: contrast }}>
                        BSV-21 Tokens
                      </span>
                    </div>
                    {assets.bsv21Tokens.map((t) => (
                      <label
                        key={t.tokenId}
                        className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2 transition-colors hover:bg-white/5"
                        style={{ opacity: t.isActive ? 1 : 0.45 }}
                      >
                        <input
                          type="checkbox"
                          checked={selection.selectedBsv21TokenIds.has(t.tokenId)}
                          onChange={() => toggleBsv21(t.tokenId)}
                          disabled={!t.isActive}
                          className="w-4 h-4 rounded flex-shrink-0"
                          style={{ accentColor: accent }}
                        />
                        <span className="text-sm flex-1" style={{ color: contrast }}>
                          {t.symbol || t.tokenId.slice(0, 8)}
                          {!t.isActive && (
                            <span className="text-[10px] ml-1.5" style={{ color: gray }}>
                              inactive
                            </span>
                          )}
                        </span>
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: `${accent}18`, color: accent }}
                        >
                          {t.totalAmount.toString()} ({t.outputs.length})
                        </span>
                      </label>
                    ))}
                  </div>
                </Show>

                {/* Non-sweepable: BSV-20 */}
                <Show when={assets.bsv20Tokens.length > 0}>
                  <div
                    className="rounded-2xl p-4 opacity-60"
                    style={{ background: rowBg, border: `1px solid ${errorColor}20` }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center"
                        style={{ background: '#F87171' + '15' }}
                      >
                        <AlertTriangle size={14} style={{ color: errorColor }} />
                      </div>
                      <span className="text-sm font-semibold" style={{ color: contrast }}>
                        BSV-20 Tokens
                      </span>
                      <span
                        className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: `${errorColor}15`, color: errorColor }}
                      >
                        {assets.bsv20Tokens.length}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed px-1" style={{ color: gray }}>
                      Cannot be swept automatically. Export your legacy keys from Settings to access these with a
                      compatible wallet.
                    </p>
                  </div>
                </Show>

                {/* Non-sweepable: Locked */}
                <Show when={assets.locked.length > 0}>
                  <div
                    className="rounded-2xl p-4 opacity-60"
                    style={{ background: rowBg, border: `1px solid ${errorColor}20` }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center"
                        style={{ background: `${errorColor}15` }}
                      >
                        <Lock size={14} style={{ color: errorColor }} />
                      </div>
                      <span className="text-sm font-semibold" style={{ color: contrast }}>
                        Locked Outputs
                      </span>
                      <span
                        className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: `${errorColor}15`, color: errorColor }}
                      >
                        {assets.locked.length}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed px-1" style={{ color: gray }}>
                      These outputs are locked in smart contracts. Your legacy keys are preserved — you can sweep these
                      after they unlock.
                    </p>
                  </div>
                </Show>

                {/* Preserved-keys notice */}
                <div
                  className="rounded-2xl p-3 flex gap-2 items-start"
                  style={{ background: `${accent}08`, borderLeft: `3px solid ${accent}40` }}
                >
                  <Shield size={13} style={{ color: accent, marginTop: 2, flexShrink: 0 }} />
                  <p className="text-xs leading-relaxed" style={{ color: contrast + 'aa' }}>
                    Your legacy keys are always preserved. Return anytime via{' '}
                    <strong>Tools → Migrate Legacy Assets</strong>.
                  </p>
                </div>
              </motion.div>

              {/* CTA */}
              <div className="w-full flex flex-col gap-2">
                <Button
                  theme={theme}
                  type="primary"
                  label={hasSelection ? 'Sweep Selected' : 'Select assets above'}
                  onClick={executeSweeps}
                  disabled={!hasSelection}
                />
              </div>
            </motion.div>
          </Show>
        </div>
      </div>
    );
  }

  // Step: Sweeping
  if (step === 'sweeping') {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#010101' }}>
        <TopNav />
        <div className="flex-1 flex flex-col items-center px-5 py-6 max-w-lg mx-auto w-full">
          <StepProgress />

          <motion.div
            className="flex flex-col items-center w-full"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            <motion.h1 variants={fadeUp} className="text-2xl font-bold mb-2 text-center" style={{ color: contrast }}>
              Sweeping Assets
            </motion.h1>

            {/* Warning banner */}
            <motion.div
              variants={fadeUp}
              className="w-full rounded-2xl px-4 py-3 mb-6 flex items-center gap-3"
              style={{ background: '#F59E0B10', border: '1px solid #F59E0B30' }}
            >
              <AlertTriangle size={15} style={{ color: '#F59E0B', flexShrink: 0 }} />
              <span className="text-xs" style={{ color: '#F59E0B' }}>
                Do not close the wallet during this process
              </span>
            </motion.div>

            {/* Current op */}
            <motion.div variants={fadeUp} className="mb-6">
              <PageLoader message={currentSweepOp || 'Processing...'} theme={theme} />
            </motion.div>

            {/* Completed so far */}
            <motion.div variants={staggerContainer} className="w-full flex flex-col gap-2">
              {sweepResults.map((r, i) => {
                const ok = !!r.txid;
                return (
                  <motion.div
                    key={i}
                    variants={fadeUp}
                    className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{
                      background: ok ? `${accent}10` : `${errorColor}10`,
                      border: `1px solid ${ok ? accent : errorColor}20`,
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: ok ? `${accent}20` : `${errorColor}20` }}
                    >
                      {ok ? (
                        <Check size={13} style={{ color: accent }} />
                      ) : (
                        <X size={13} style={{ color: errorColor }} />
                      )}
                    </div>
                    <span className="text-sm" style={{ color: ok ? accent : errorColor }}>
                      {r.label}
                    </span>
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Step: Results
  if (step === 'results') {
    const successes = sweepResults.filter((r) => r.txid);
    const failures = sweepResults.filter((r) => r.error && !r.txid);
    const allGood = failures.length === 0;

    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#010101' }}>
        <TopNav />
        <div className="flex-1 flex flex-col items-center px-5 py-6 max-w-lg mx-auto w-full">
          <StepProgress />

          <motion.div
            className="flex flex-col items-center w-full"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            {/* Result icon */}
            <motion.div
              variants={fadeUp}
              className="mb-5"
              animate={allGood ? { scale: [0.8, 1.1, 1] } : {}}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{
                  background: allGood ? `${accent}15` : `${errorColor}15`,
                  border: `1px solid ${allGood ? accent : errorColor}30`,
                }}
              >
                {allGood ? (
                  <CheckCircle size={28} style={{ color: accent }} />
                ) : (
                  <AlertTriangle size={28} style={{ color: errorColor }} />
                )}
              </div>
            </motion.div>

            <motion.h1 variants={fadeUp} className="text-2xl font-bold mb-2 text-center" style={{ color: contrast }}>
              {allGood ? 'Migration Complete' : 'Partially Complete'}
            </motion.h1>
            <motion.p variants={fadeUp} className="text-sm text-center mb-5" style={{ color: gray }}>
              {successes.length} swept{failures.length > 0 ? `, ${failures.length} failed` : ' successfully'}
            </motion.p>

            {/* Result cards */}
            <motion.div
              variants={staggerContainer}
              className="w-full flex flex-col gap-2 overflow-y-auto mb-4"
              style={{ maxHeight: '18rem' }}
            >
              {sweepResults.map((r, i) => {
                const ok = !!r.txid;
                return (
                  <motion.div
                    key={i}
                    variants={fadeUp}
                    className="flex items-start gap-3 rounded-2xl px-4 py-3"
                    style={{
                      background: ok ? `${accent}08` : `${errorColor}08`,
                      borderLeft: `3px solid ${ok ? accent : errorColor}`,
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: ok ? `${accent}20` : `${errorColor}20` }}
                    >
                      {ok ? (
                        <Check size={12} style={{ color: accent }} />
                      ) : (
                        <X size={12} style={{ color: errorColor }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: contrast }}>
                        {r.label}
                      </p>
                      {r.txid && (
                        <a
                          href={`${EXPLORER_BASE}${r.txid}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 mt-0.5 hover:underline"
                          style={{ color: accent }}
                        >
                          <span className="text-xs font-mono">{r.txid.slice(0, 16)}...</span>
                          <ExternalLink size={10} />
                        </a>
                      )}
                      {r.error && !r.txid && (
                        <p className="text-xs mt-0.5" style={{ color: errorColor }}>
                          {r.error}
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {/* Preserved-keys notice */}
              <div
                className="rounded-2xl p-3 flex gap-2 items-start"
                style={{ background: `${accent}08`, borderLeft: `3px solid ${accent}40` }}
              >
                <Shield size={13} style={{ color: accent, marginTop: 2, flexShrink: 0 }} />
                <p className="text-xs leading-relaxed" style={{ color: contrast + 'aa' }}>
                  Your legacy keys are preserved. Return anytime via <strong>Tools → Migrate Legacy Assets</strong>.
                </p>
              </div>
            </motion.div>

            <motion.div variants={fadeUp} className="w-full">
              <Button theme={theme} type="primary" label="Done" onClick={handleDone} />
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  return null;
};
