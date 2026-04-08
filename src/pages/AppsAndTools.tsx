import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Lock,
  Unlock,
  Code,
  KeyRound,
  Heart,
  Compass,
  Github,
  ExternalLink,
  ChevronRight,
  ArrowRightLeft,
} from 'lucide-react';
import { Button } from '../components/Button';
import { PageLoader } from '../components/PageLoader';
import yoursLogo from '../assets/logos/icon.png';
import { DateTimePicker, Warning } from '../components/Reusable';
import { Show } from '../components/Show';
import { useBottomMenu } from '../hooks/useBottomMenu';
import { useTheme } from '../hooks/useTheme';
import { BSV_DECIMAL_CONVERSION, YOURS_DEV_WALLET, featuredApps } from '../utils/constants';
import { formatNumberWithCommasAndDecimals, truncate } from '../utils/format';
import { TopNav } from '../components/TopNav';
import { useServiceContext } from '../hooks/useServiceContext';
import { lockBsv, unlockBsv, sendBsv } from '@1sat/actions';
import { Outpoint, type ParseContext, type Txo } from '@1sat/wallet-browser';
import { Script } from '@bsv/sdk';
import { Input } from '../components/Input';
import TxPreview from '../components/TxPreview';
import { TransactionFormat } from 'yours-wallet-provider';
import { getTxFromRawTxFormat } from '../utils/tools';
import { useSnackbar } from '../hooks/useSnackbar';

// Helper type for lock data stored in Txo.data.lock.data
interface LockData {
  until: number;
}

type AppsPage =
  | 'main'
  | 'sponsor'
  | 'sponsor-thanks'
  | 'discover-apps'
  | 'unlock'
  | 'lock-page'
  | 'decode-broadcast'
  | 'decode'
  | 'sweep-wif';

// ── Animation variants ──────────────────────────────────────────────────────

const pageVariants = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
};

const pageTransition = { duration: 0.18, ease: 'easeOut' };

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
};

// ── Reusable primitives ─────────────────────────────────────────────────────

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="px-1 pb-1.5 pt-4 first:pt-0">
    <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#98A2B3' }}>
      {children}
    </span>
  </div>
);

type MenuRowProps = {
  icon: React.ReactNode;
  title: string;
  description?: string;
  onClick?: () => void;
  trailingIcon?: React.ReactNode;
};

const MenuRow = ({ icon, title, description, onClick, trailingIcon }: MenuRowProps) => (
  <motion.button
    variants={itemVariants}
    whileTap={{ scale: 0.985 }}
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors duration-150 bg-[#17191E] hover:bg-[#1f2128]"
  >
    <span style={{ color: '#A1FF8B' }} className="shrink-0">
      {icon}
    </span>
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>
        {title}
      </span>
      {description && (
        <span className="truncate text-xs leading-snug" style={{ color: '#98A2B3' }}>
          {description}
        </span>
      )}
    </span>
    {trailingIcon ?? <ChevronRight size={16} style={{ color: '#98A2B3' }} className="shrink-0" />}
  </motion.button>
);

const RowGroup = ({ children }: { children: React.ReactNode }) => (
  <div className="flex w-full flex-col gap-0.5">{children}</div>
);

const BackHeader = ({ title, onBack }: { title: string; onBack: () => void }) => (
  <div className="flex w-full items-center gap-3 pb-4">
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onBack}
      className="flex h-8 w-8 items-center justify-center rounded-lg"
      style={{ background: '#17191E' }}
    >
      <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
    </motion.button>
    <span className="text-base font-bold" style={{ color: '#FFFFFF' }}>
      {title}
    </span>
  </div>
);

const FormatPill = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <motion.button
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className="relative rounded-full px-4 py-1.5 text-xs font-semibold transition-colors"
    style={{
      background: active ? 'linear-gradient(135deg, #A1FF8B, #34D399)' : '#17191E',
      color: active ? '#010101' : '#98A2B3',
    }}
  >
    {label}
  </motion.button>
);

const AmountChip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <motion.button
    whileTap={{ scale: 0.93 }}
    onClick={onClick}
    className="rounded-full px-4 py-2 text-sm font-semibold transition-all"
    style={{
      background: active ? 'linear-gradient(135deg, #A1FF8B, #34D399)' : '#17191E',
      color: active ? '#010101' : '#FFFFFF',
      border: active ? 'none' : '1px solid #98A2B326',
    }}
  >
    {label}
  </motion.button>
);

// ── Main component ──────────────────────────────────────────────────────────

export const AppsAndTools = () => {
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const menuContext = useBottomMenu();
  const { query } = menuContext;
  const { keysService, chromeStorageService, wallet, apiContext } = useServiceContext();
  const { bsvAddress, ordAddress, identityAddress, getWifBalance, sweepWif } = keysService;
  const exchangeRate = chromeStorageService.getCurrentAccountObject().exchangeRateCache?.rate ?? 0;
  const [isProcessing, setIsProcessing] = useState(false);
  const [page, setPage] = useState<AppsPage>(query === 'pending-locks' ? 'unlock' : 'main');
  const [otherIsSelected, setOtherIsSelected] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [lockedUtxos, setLockedUtxos] = useState<Txo[]>([]);
  const [currentBlockHeight, setCurrentBlockHeight] = useState(0);
  const [txData, setTxData] = useState<ParseContext>();
  const [rawTx, setRawTx] = useState<string | number[]>('');
  const [transactionFormat, setTransactionFormat] = useState<TransactionFormat>('tx');
  const [satsOut, setSatsOut] = useState(0);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [lockBlockHeight, setLockBlockHeight] = useState(0);
  const [lockBsvAmount, setLockBsvAmount] = useState<number | null>(null);

  const [wifKey, setWifKey] = useState('');
  const [sweepBalance, setSweepBalance] = useState(0);
  const [isSweeping, setIsSweeping] = useState(false);

  const checkWIFBalance = async (wif: string) => {
    const balance = await getWifBalance(wif);
    if (balance === undefined) {
      addSnackbar('Error checking balance. Please ensure the WIF key is valid.', 'error');
      return;
    }
    if (balance === 0) {
      addSnackbar('No balance found for this WIF key', 'info');
      setSweepBalance(balance);
      return;
    }

    addSnackbar(`Balance found: ${balance / BSV_DECIMAL_CONVERSION} BSV`, 'success');
    setSweepBalance(balance);
  };

  const sweepFunds = async () => {
    try {
      if (!wifKey) return;
      setIsSweeping(true);
      const res = await sweepWif(wifKey);
      if (res?.txid) {
        addSnackbar('Successfully swept funds to your wallet', 'success');
        handleResetSweep();
        return;
      } else {
        addSnackbar('Error sweeping funds. Please try again.', 'error');
      }
    } catch (error) {
      addSnackbar('Error sweeping funds. Please try again.', 'error');
      console.error('Sweep error:', error);
    } finally {
      setIsSweeping(false);
    }
  };

  const handleWifChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const wif = e.target.value;
    if (!wif) return;
    checkWIFBalance(wif);
    setWifKey(e.target.value);
  };

  const handleResetSweep = () => {
    setWifKey('');
    setSweepBalance(0);
    setIsSweeping(false);
    setPage('main');
  };

  const getLockData = async () => {
    setIsProcessing(true);
    const height = await apiContext.services!.chaintracks.currentHeight();
    setCurrentBlockHeight(height);

    const result = await wallet!.listOutputs({ basket: 'lock', limit: 10000 });
    const txos: Txo[] = [];
    for (const o of result.outputs) {
      const outpoint = new Outpoint(o.outpoint);
      const output = {
        lockingScript: Script.fromHex(o.lockingScript || ''),
        satoshis: o.satoshis,
      };
      const txo = await wallet!.parseOutput(output, outpoint);
      txos.push(txo);
    }
    setLockedUtxos(txos);
    setIsProcessing(false);
  };

  useEffect(() => {
    if (page === 'unlock' && identityAddress) {
      getLockData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityAddress, page]);

  const handleSubmit = async (amount: number) => {
    if (!amount || !exchangeRate) return;

    const sats = Math.round((amount / exchangeRate) * BSV_DECIMAL_CONVERSION);
    setIsProcessing(true);
    try {
      const result = await sendBsv.execute(apiContext, {
        requests: [{ address: YOURS_DEV_WALLET, satoshis: sats }],
      });
      if (result.txid) {
        setPage('sponsor-thanks');
      } else {
        addSnackbar(result.error || 'Transaction failed', 'error');
      }
    } catch (err) {
      addSnackbar(err instanceof Error ? err.message : 'Transaction failed', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecode = async () => {
    setIsProcessing(true);
    try {
      const tx = getTxFromRawTxFormat(rawTx, transactionFormat);
      const data = await wallet!.parseTransaction(tx);
      setTxData(data);
      let userSatsOut = data.spends.reduce((acc, spend) => {
        if (spend.owner && [bsvAddress, ordAddress, identityAddress].includes(spend.owner)) {
          return acc + BigInt(spend.output.satoshis || 0);
        }
        return acc;
      }, 0n);

      // how much did the user get back from the tx
      userSatsOut = data.txos.reduce((acc, txo) => {
        if (txo.owner && [bsvAddress, ordAddress, identityAddress].includes(txo.owner)) {
          return acc - BigInt(txo.output.satoshis || 0);
        }
        return acc;
      }, userSatsOut);

      setSatsOut(Number(userSatsOut));
      setIsProcessing(false);
      setPage('decode');
    } catch (error) {
      console.error('Decode error:', error);
      addSnackbar('An error occurred while decoding the transaction', 'error');
      setIsProcessing(false);
    }
  };

  const handleBroadcast = async () => {
    if (!rawTx || !transactionFormat) return;
    try {
      setIsBroadcasting(true);
      setIsProcessing(true);
      const tx = getTxFromRawTxFormat(rawTx, transactionFormat);
      await wallet!.broadcast(tx, 'manual');
      addSnackbar('Transaction broadcasted successfully', 'success');
      setPage('decode-broadcast');
    } catch (error) {
      console.log(error);
      addSnackbar('An error occurred while broadcasting the transaction', 'error');
      setPage('decode-broadcast');
    } finally {
      setIsBroadcasting(false);
      setIsProcessing(false);
    }
  };

  const handleUnlock = async () => {
    try {
      setIsProcessing(true);
      const res = await unlockBsv.execute(apiContext, {});
      if (!res?.txid) {
        addSnackbar(`Error unlocking funds. ${res?.error ?? 'Please try again.'}`, 'error');
        return;
      }

      addSnackbar('Funds unlocked successfully', 'success');
    } catch (error) {
      console.error('Unlock error:', error);
    } finally {
      setIsProcessing(false);
      getLockData();
    }
  };

  const handleBlockHeightChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateChoice = new Date(e.target.value).getTime();
    const blockCount = Math.ceil((dateChoice - Date.now()) / 1000 / 60 / 10);
    const currentHeight = await apiContext.services!.chaintracks.currentHeight();
    const blockHeight = currentHeight + blockCount;
    setLockBlockHeight(blockHeight);
  };

  const handleLockBsv = async () => {
    try {
      if (!identityAddress) return;
      if (!lockBsvAmount || !lockBlockHeight) throw new Error('Invalid lock amount or block height');
      setIsProcessing(true);
      const currentHeight = await apiContext.services!.chaintracks.currentHeight();
      if (currentHeight >= lockBlockHeight) {
        throw new Error('Invalid block height. Please choose a future block height.');
      }
      const sats = Math.round(lockBsvAmount * BSV_DECIMAL_CONVERSION);
      const res = await lockBsv.execute(apiContext, {
        requests: [{ until: lockBlockHeight, satoshis: sats }],
      });

      if (!res?.txid) throw new Error(`${res?.error ?? 'An error occurred. Please try again.'}`);

      addSnackbar('Funds locked successfully', 'success');
      setLockBlockHeight(0);
      setLockBsvAmount(null);
    } catch (error) {
      console.error('Lock error:', error);
      addSnackbar(`${error ?? 'An error has occurred!'}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Sub-pages ─────────────────────────────────────────────────────────────

  const main = (
    <motion.div
      key="main"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex w-full flex-col"
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex w-full flex-col gap-1"
      >
        {/* Tools section */}
        <SectionLabel>Tools</SectionLabel>
        <RowGroup>
          <Show when={theme.settings.services.locks}>
            <MenuRow
              icon={<Lock size={18} />}
              title="Lock BSV"
              description="Lock your coins for a set period of time"
              onClick={() => setPage('lock-page')}
            />
          </Show>
          <Show when={theme.settings.services.locks}>
            <MenuRow
              icon={<Unlock size={18} />}
              title="Pending Locks"
              description="View the pending coins you've locked"
              onClick={() => setPage('unlock')}
            />
          </Show>
          <MenuRow
            icon={<Code size={18} />}
            title="Decode / Broadcast"
            description="Decode and broadcast raw transactions"
            onClick={() => setPage('decode-broadcast')}
          />
          <MenuRow
            icon={<ArrowRightLeft size={18} />}
            title="Migrate Legacy Assets"
            description="Sweep assets from your old keys to BRC-100"
            onClick={() => {
              menuContext?.clearSelection();
              navigate('/sweep');
            }}
          />
          <MenuRow
            icon={<KeyRound size={18} />}
            title="Sweep Private Key"
            description="Import funds from WIF private key"
            onClick={() => setPage('sweep-wif')}
          />
        </RowGroup>

        {/* Apps section */}
        <Show when={theme.settings.services.apps}>
          <>
            <SectionLabel>Apps</SectionLabel>
            <RowGroup>
              <MenuRow
                icon={<Compass size={18} />}
                title="Discover Apps"
                description={`Meet the apps using ${theme.settings.walletName} Wallet`}
                onClick={() => setPage('discover-apps')}
              />
            </RowGroup>
          </>
        </Show>

        {/* Support section */}
        <SectionLabel>Support</SectionLabel>
        <RowGroup>
          <Show when={theme.settings.walletName === 'Yours'}>
            <MenuRow
              icon={<Heart size={18} />}
              title="Support Yours"
              description="Fund Yours Wallet's open source developers"
              onClick={() => setPage('sponsor')}
            />
          </Show>
          <MenuRow
            icon={<Github size={18} />}
            title="Contribute or Integrate"
            description="All the tools you need to get involved"
            onClick={() => window.open(theme.settings.repo, '_blank')}
            trailingIcon={<ExternalLink size={14} style={{ color: '#98A2B3' }} className="shrink-0" />}
          />
        </RowGroup>
      </motion.div>
    </motion.div>
  );

  const lockPage = (
    <motion.div
      key="lock-page"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex w-full flex-col"
    >
      <BackHeader title="Lock BSV" onBack={() => setPage('main')} />
      <p className="mb-4 text-xs leading-relaxed" style={{ color: '#98A2B3' }}>
        Lock your BSV for a set period of time. This will prevent you from spending them until the lock expires.
      </p>
      <div className="flex flex-col gap-3">
        <Input
          theme={theme}
          placeholder="Enter BSV Amount"
          type="number"
          min="0.00000001"
          value={lockBsvAmount !== null && lockBsvAmount !== undefined ? lockBsvAmount : ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const inputValue = e.target.value;
            if (inputValue === '') {
              setLockBsvAmount(null);
            } else {
              setLockBsvAmount(parseFloat(inputValue));
            }
          }}
        />
        <DateTimePicker theme={theme} onChange={handleBlockHeightChange} />
        <Button
          theme={theme}
          type="primary"
          label={
            isProcessing
              ? 'Locking...'
              : `${lockBlockHeight ? `Lock until block ${formatNumberWithCommasAndDecimals(lockBlockHeight, 0)}` : 'Lock'}`
          }
          onClick={handleLockBsv}
          disabled={isProcessing}
        />
      </div>
    </motion.div>
  );

  const unlockPage = (
    <motion.div
      key="unlock"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex w-full flex-col"
    >
      <BackHeader title="Pending Locks" onBack={() => setPage('main')} />

      {/* Table header */}
      <div
        className="mb-1 grid grid-cols-3 rounded-lg px-4 py-2 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: '#98A2B3', background: '#17191E' }}
      >
        <span className="text-left">TxID</span>
        <span className="text-center">Blocks Left</span>
        <span className="text-right">Amount</span>
      </div>

      <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: '260px' }}>
        {lockedUtxos
          .sort((a, b) => {
            const aLock = a.data.lock?.data as unknown as LockData | undefined;
            const bLock = b.data.lock?.data as unknown as LockData | undefined;
            return Number(aLock?.until ?? 0) - Number(bLock?.until ?? 0);
          })
          .map((u) => {
            const lockData = u.data.lock?.data as unknown as LockData | undefined;
            const blocksRemaining = Number(lockData?.until ?? 0) - currentBlockHeight;
            const satoshis = BigInt(u.output.satoshis || 0);
            return (
              <div
                key={u.outpoint.txid}
                className="grid grid-cols-3 rounded-xl px-4 py-3 text-sm"
                style={{ background: '#17191E', color: '#FFFFFF' }}
              >
                <span className="text-left font-mono text-xs" style={{ color: '#98A2B3' }}>
                  {truncate(u.outpoint.txid, 4, 4)}
                </span>
                <span className="text-center text-xs font-semibold" style={{ color: '#A1FF8B' }}>
                  {blocksRemaining < 0 ? '0' : blocksRemaining}
                </span>
                <span className="text-right text-xs">
                  {satoshis < 1000n
                    ? `${satoshis} ${satoshis > 1n ? 'sats' : 'sat'}`
                    : `${Number(satoshis) / BSV_DECIMAL_CONVERSION} BSV`}
                </span>
              </div>
            );
          })}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Button theme={theme} type="primary" label="Unlock Funds" onClick={handleUnlock} />
      </div>
    </motion.div>
  );

  const discoverAppsPage = (
    <motion.div
      key="discover-apps"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex w-full flex-col"
    >
      <BackHeader title="Discover Apps" onBack={() => setPage('main')} />
      <Show
        when={featuredApps.length > 0}
        whenFalseContent={
          <div className="flex flex-col items-center justify-center py-16">
            <Compass size={40} style={{ color: '#98A2B3' }} className="mb-3" />
            <span className="text-sm" style={{ color: '#98A2B3' }}>
              No apps listed yet
            </span>
          </div>
        }
      >
        <>
          <p className="mb-3 text-xs leading-relaxed" style={{ color: '#98A2B3' }}>
            If your app has integrated {theme.settings.walletName} Wallet but is not listed,{' '}
            <a
              href={theme.settings.repo}
              rel="noreferrer"
              target="_blank"
              className="font-medium underline underline-offset-2"
              style={{ color: '#A1FF8B' }}
            >
              let us know!
            </a>
          </p>
          <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: '340px' }}>
            {featuredApps.map((app, idx) => (
              <motion.button
                key={app.name + idx}
                whileTap={{ scale: 0.985 }}
                onClick={() => window.open(app.link, '_blank')}
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors duration-150 bg-[#17191E] hover:bg-[#1f2128]"
              >
                <div className="flex items-center gap-3">
                  <img src={app.icon} alt={app.name} className="h-10 w-10 rounded-lg object-cover" />
                  <span className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>
                    {app.name}
                  </span>
                </div>
                <ExternalLink size={14} style={{ color: '#98A2B3' }} />
              </motion.button>
            ))}
          </div>
        </>
      </Show>
    </motion.div>
  );

  const sponsorPage = (
    <motion.div
      key="sponsor"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex w-full flex-col items-center"
    >
      <BackHeader title="Support Project" onBack={() => setPage('main')} />
      <img src={yoursLogo} alt="Wallet Logo" className="mb-3 h-12 w-12 rounded-xl" />
      <p className="mb-4 text-center text-xs leading-relaxed" style={{ color: '#98A2B3' }}>
        Yours is an open-source initiative. Consider supporting its continued development.
      </p>

      <Show
        when={otherIsSelected}
        whenFalseContent={
          <div className="flex w-full flex-wrap justify-center gap-2 pb-2">
            {['25', '50', '100', '250', '500', 'Other'].map((amt) => (
              <AmountChip
                key={amt}
                label={amt === 'Other' ? 'Other' : `$${amt}`}
                active={selectedAmount === Number(amt)}
                onClick={() => {
                  if (amt === 'Other') {
                    setOtherIsSelected(true);
                  } else {
                    handleSubmit(Number(amt));
                  }
                }}
              />
            ))}
          </div>
        }
      >
        <div className="flex w-full flex-col gap-2">
          <Input
            theme={theme}
            placeholder="Enter USD Amount"
            type="number"
            step="1"
            value={selectedAmount !== null && selectedAmount !== undefined ? selectedAmount : ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const inputValue = e.target.value;
              if (inputValue === '') {
                setSelectedAmount(null);
              } else {
                setSelectedAmount(Number(inputValue));
              }
            }}
          />
          <div className="flex gap-2">
            <Button theme={theme} type="secondary-outline" label="Cancel" onClick={() => setOtherIsSelected(false)} />
            <Button theme={theme} type="primary" label="Submit" onClick={() => handleSubmit(Number(selectedAmount))} />
          </div>
        </div>
      </Show>

      <div
        className="my-4 w-full rounded-xl p-4 text-xs leading-relaxed"
        style={{ background: '#17191E', color: '#98A2B3' }}
      >
        Give monthly through Yours Wallet's transparent Open Collective (formerly Panda Wallet).
      </div>
      <Button
        theme={theme}
        type="primary"
        label="View Open Collective"
        onClick={() => window.open('https://opencollective.com/yours-wallet', '_blank')}
      />
    </motion.div>
  );

  const thankYouSponsorPage = (
    <motion.div
      key="sponsor-thanks"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex w-full flex-col items-center justify-center py-12"
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: 'linear-gradient(135deg, #A1FF8B, #34D399)' }}
      >
        <Heart size={28} style={{ color: '#010101' }} fill="#010101" />
      </motion.div>
      <h2 className="mb-2 text-xl font-bold" style={{ color: '#FFFFFF' }}>
        Thank You
      </h2>
      <p className="mb-6 text-center text-sm" style={{ color: '#98A2B3' }}>
        Your contribution has been received.
      </p>
      <Button theme={theme} type="primary" label="Done" onClick={() => setPage('main')} />
    </motion.div>
  );

  const decodeOrBroadcastPage = (
    <motion.div
      key="decode-broadcast"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex w-full flex-col"
    >
      <BackHeader title="Decode / Broadcast" onBack={() => setPage('main')} />
      <p className="mb-3 text-xs leading-relaxed" style={{ color: '#98A2B3' }}>
        Decode or broadcast a raw transaction in various formats.
      </p>

      {/* Format selector pills */}
      <div className="mb-3 flex gap-2">
        {[
          { label: 'Hex', value: 'tx' as TransactionFormat },
          { label: 'BEEF', value: 'beef' as TransactionFormat },
          { label: 'Extended', value: 'ef' as TransactionFormat },
        ].map((f) => (
          <FormatPill
            key={f.label}
            label={f.label}
            active={transactionFormat === f.value}
            onClick={() => setTransactionFormat(f.value)}
          />
        ))}
      </div>

      {/* Textarea */}
      <textarea
        placeholder="Paste your raw transaction"
        onChange={(e) => setRawTx(e.target.value)}
        className="mb-3 w-full resize-none rounded-xl px-4 py-3 text-xs outline-none"
        rows={5}
        style={{
          background: '#17191E',
          color: '#FFFFFF80',
          border: '1px solid #98A2B326',
          fontFamily: 'monospace',
        }}
      />

      <div className="flex gap-2">
        <Button theme={theme} type="secondary-outline" label="Decode" onClick={handleDecode} />
        <Button theme={theme} type="primary" label="Broadcast" onClick={handleBroadcast} />
      </div>
    </motion.div>
  );

  const wifSweepPage = (
    <motion.div
      key="sweep-wif"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex w-full flex-col"
    >
      <BackHeader title="Sweep Private Key" onBack={handleResetSweep} />
      <p className="mb-3 text-xs leading-relaxed" style={{ color: '#98A2B3' }}>
        Enter a private key in WIF format to sweep all funds to your wallet.
      </p>
      <Input theme={theme} placeholder="Enter WIF private key" value={wifKey} onChange={handleWifChange} />

      {sweepBalance > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-3 flex items-center justify-between rounded-xl px-4 py-3"
          style={{ background: '#17191E' }}
        >
          <span className="text-xs" style={{ color: '#98A2B3' }}>
            Available to sweep
          </span>
          <span className="text-sm font-bold" style={{ color: '#A1FF8B' }}>
            {sweepBalance / BSV_DECIMAL_CONVERSION} BSV
          </span>
        </motion.div>
      )}

      <div className="flex gap-2">
        <Button
          theme={theme}
          type="secondary-outline"
          label="Cancel"
          onClick={handleResetSweep}
          disabled={isSweeping}
        />
        <Button
          theme={theme}
          type="primary"
          label={isSweeping ? 'Sweeping...' : 'Sweep Funds'}
          onClick={sweepFunds}
          disabled={isSweeping || sweepBalance === 0}
        />
      </div>
      <Warning theme={theme}>This will only sweep funds. 1Sat Ordinals could be lost!</Warning>
    </motion.div>
  );

  const decodePage = !!txData && (
    <motion.div
      key="decode"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex w-full flex-col gap-3"
    >
      <BackHeader title="Decoded Transaction" onBack={() => setPage('decode-broadcast')} />
      <TxPreview txData={txData} />
      <Button
        theme={theme}
        type="primary"
        label={`Broadcast - ${satsOut > 0 ? satsOut / BSV_DECIMAL_CONVERSION : 0} BSV`}
        onClick={handleBroadcast}
      />
      <Button theme={theme} type="secondary-outline" label="Cancel" onClick={() => setPage('decode-broadcast')} />
    </motion.div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex w-full flex-col items-center overflow-x-hidden overflow-y-auto pb-20"
      style={{ height: 'calc(75%)', background: '#010101' }}
    >
      <TopNav />

      {/* Processing loaders */}
      <Show when={isProcessing && page === 'unlock'}>
        <PageLoader theme={theme} message="Gathering info..." />
      </Show>
      <Show when={isProcessing && page === 'lock-page'}>
        <PageLoader theme={theme} message="Locking..." />
      </Show>
      <Show when={(isProcessing && page === 'decode-broadcast') || (isProcessing && page === 'decode')}>
        <PageLoader
          theme={theme}
          message={isBroadcasting ? 'Broadcasting transaction...' : 'Decoding transaction...'}
        />
      </Show>

      {/* Page content */}
      <div className="w-full px-4 pb-6">
        <AnimatePresence mode="wait">
          {page === 'main' && main}
          {page === 'lock-page' && !isProcessing && lockPage}
          {page === 'unlock' && !isProcessing && unlockPage}
          {page === 'discover-apps' && discoverAppsPage}
          {page === 'sponsor' && sponsorPage}
          {page === 'sponsor-thanks' && thankYouSponsorPage}
          {page === 'decode-broadcast' && !isProcessing && decodeOrBroadcastPage}
          {page === 'decode' && !isProcessing && decodePage}
          {page === 'sweep-wif' && wifSweepPage}
        </AnimatePresence>
      </div>
    </div>
  );
};
