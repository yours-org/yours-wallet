import { validate } from 'bitcoin-address-validation';
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  List,
  History,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeft,
  Copy,
  Check,
  Trash2,
  Plus,
  ArrowUpDown,
  ExternalLink,
} from 'lucide-react';
import bsvCoin from '../assets/bsv-coin.svg';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { PageLoader } from '../components/PageLoader';
import { QrCode } from '../components/QrCode';
import { MainContent } from '../components/Reusable';
import { Show } from '../components/Show';
import { TopNav } from '../components/TopNav';
import { useBottomMenu } from '../hooks/useBottomMenu';
import { useSnackbar } from '../hooks/useSnackbar';
import { useSocialProfile } from '../hooks/useSocialProfile';
import { useTheme } from '../hooks/useTheme';
import {
  BSV_DECIMAL_CONVERSION,
  HOSTED_YOURS_IMAGE,
  MNEE_ICON_URL,
  MNEE_MOBILE_REFERRAL_LINK,
} from '../utils/constants';
import { formatNumberWithCommasAndDecimals, formatUSD } from '../utils/format';
import { sleep } from '../utils/sleep';
import { AssetRow } from '../components/AssetRow';
import lockIcon from '../assets/lock.svg';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWeb3RequestContext } from '../hooks/useWeb3RequestContext';
import { useServiceContext } from '../hooks/useServiceContext';
import {
  getBsv21Balances,
  getLockData,
  sendAllBsv,
  sendBsv,
  unlockBsv,
  type Bsv21Balance,
  type LockData,
} from '@1sat/actions';
import { getWalletBalance, fetchExchangeRate } from '../utils/wallet';
import { sendMessage, sendMessageAsync } from '../utils/chromeHelpers';
import { YoursEventName } from '../inject';
import { useSyncTracker } from '../hooks/useSyncTracker';
import { getErrorMessage, isValidEmail } from '../utils/tools';
import { UpgradeNotification } from '../components/UpgradeNotification';
import { Bsv21TokensList } from '../components/Bsv21TokensList';
import { ManageTokens } from '../components/ManageTokens';
import { Account, ChromeStorageObject } from '../services/types/chromeStorage.types';
import { SendBsv21View } from '../components/SendBsv21View';
import { FaucetButton } from '../components/FaucetButton';
import { TxHistory } from '../components/TxHistory';
import { getMneeBalance, sendMnee, deriveDepositAddresses } from '@1sat/actions';
import { MneeClient } from '@1sat/client';

// CopyAddressed feedback state hook — used in receive view

type PageState = 'main' | 'receive' | 'send' | 'sendMNEE' | 'getMNEE';
type AmountType = 'bsv' | 'usd';

export type Recipient = {
  id: string;
  address: string;
  satSendAmount: number | null;
  usdSendAmount: number | null;
  amountType: AmountType;
  error?: string;
};

export const BsvWallet = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { updateBalance, isSyncing } = useSyncTracker();
  const urlParams = new URLSearchParams(location.search);
  const { handleSelect, query } = useBottomMenu();
  const isReload = urlParams.get('reload') === 'true' || query === 'reload';
  urlParams.delete('reload');
  const [pageState, setPageState] = useState<PageState>('main');
  const [satSendAmount, setSatSendAmount] = useState<number | null>(null);
  const { addSnackbar } = useSnackbar();
  const { chromeStorageService, apiContext } = useServiceContext();
  const { socialProfile } = useSocialProfile(chromeStorageService);
  const [unlockAttempted, setUnlockAttempted] = useState(false);
  const { connectRequest } = useWeb3RequestContext();
  const [isProcessing, setIsProcessing] = useState(false);
  // Get identityAddress from chrome storage (selected account)
  const identityAddress = chromeStorageService.getCurrentAccountObject().account?.addresses?.identityAddress || '';
  const [receiveAddress, setReceiveAddress] = useState<string>('');
  const [bsvBalance, setBsvBalance] = useState<number>(0);
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [lockData, setLockData] = useState<LockData>();
  const [isSendAllBsv, setIsSendAllBsv] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [bsv21s, setBsv21s] = useState<Bsv21Balance[]>([]);
  const [manageFavorites, setManageFavorites] = useState(false);
  const [historyTx, setHistoryTx] = useState(false);
  const [account, setAccount] = useState<Account>();
  const [token, setToken] = useState<{ isConfirmed: boolean; info: Bsv21Balance } | null>(null);
  const services = theme.settings.services;
  const [filteredTokens, setFilteredTokens] = useState<Bsv21Balance[]>([]);
  const [randomKey, setRandomKey] = useState(Math.random());
  const isTestnet = chromeStorageService.getNetwork() === 'testnet' ? true : false;
  const [mneeBalance, setMneeBalance] = useState(0);
  const [mneeRecipient, setMneeRecipient] = useState('');
  const [mneeReciepientAmount, setMneeRecipientAmount] = useState<number | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);

  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: crypto.randomUUID(), address: '', satSendAmount: null, usdSendAmount: null, amountType: 'bsv' },
  ]);

  const addRecipient = () => {
    setRecipients((prev) => [
      ...prev,
      { id: crypto.randomUUID(), address: '', satSendAmount: null, usdSendAmount: null, amountType: 'bsv' },
    ]);
  };

  const removeRecipient = (id: string) => {
    if (recipients.length > 1) {
      setRecipients((prev) => [...prev.filter((r) => r.id !== id)]);
    }
  };

  const updateRecipient = (
    id: string,
    field: 'address' | 'satSendAmount' | 'usdSendAmount' | 'amountType' | 'error',
    value: string | number | null,
  ) => {
    setRecipients((prev) => [
      ...prev.map((r) => {
        if (r.id === id) {
          // If we're updating amountType, reset both amounts
          if (field === 'amountType') {
            return {
              ...r,
              [field]: value as AmountType,
              satSendAmount: null,
              usdSendAmount: null,
            };
          }
          // Otherwise just update the specified field
          return { ...r, [field]: value };
        }
        return r;
      }),
    ]);
  };

  const toggleRecipientAmountType = (id: string) => {
    updateRecipient(id, 'amountType', recipients.find((r) => r.id === id)?.amountType === 'bsv' ? 'usd' : 'bsv');
  };

  const resetRecipients = () => {
    setRecipients([
      { id: crypto.randomUUID(), address: '', satSendAmount: null, usdSendAmount: null, amountType: 'bsv' },
    ]);
    setIsProcessing(false);
  };

  const computeTotalAmount = () => {
    const totalBsv = recipients.reduce((acc, r) => acc + (r.satSendAmount ?? 0), 0);
    const totalUsd = recipients.reduce((acc, r) => acc + (r.usdSendAmount ?? 0), 0);
    return { totalBsv, totalUsd };
  };

  const updateMneeBalance = async () => {
    if (!receiveAddress || !apiContext) return;
    try {
      const res = await getMneeBalance.execute(apiContext, { addresses: [receiveAddress] });
      setMneeBalance(res.totalDecimal);

      // Update MNEE balance in Chrome storage
      const { account } = chromeStorageService.getCurrentAccountObject();
      if (!account) return;

      const key: keyof ChromeStorageObject = 'accounts';
      const update: Partial<ChromeStorageObject['accounts']> = {
        [identityAddress]: {
          ...account,
          mneeBalance: {
            amount: res.totalAtomic,
            decimalAmount: res.totalDecimal,
          },
        },
      };
      await chromeStorageService.updateNested(key, update);
    } catch (error) {
      console.error('Failed to update MNEE balance:', error);
    }
  };

  const resetRecipientErrors = () => {
    setRecipients((prev) => [...prev.map((r) => ({ ...r, error: undefined }))]);
  };

  const getAndSetAccountAndBsv21s = async () => {
    const res = await getBsv21Balances.execute(apiContext, {});
    setBsv21s(res);
    setAccount(chromeStorageService.getCurrentAccountObject().account);
  };

  useEffect(() => {
    if (!bsv21s || !account) return;
    const filtered = bsv21s.filter((t) => t.id && account?.settings?.favoriteTokens?.includes(t.id));
    setFilteredTokens(filtered);
  }, [bsv21s, account]);

  useEffect(() => {
    (async () => {
      const obj = await chromeStorageService.getAndSetStorage();
      setShowWelcome(!!obj?.showWelcome);
      if (obj?.selectedAccount) {
        await getAndSetAccountAndBsv21s();
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch receive address from service worker
  useEffect(() => {
    (async () => {
      try {
        const response = await sendMessageAsync<{ success: boolean; data?: string }>({
          action: YoursEventName.GET_RECEIVE_ADDRESS,
        });
        if (response?.success && response.data) {
          setReceiveAddress(response.data);
        }
      } catch (error) {
        console.error('Failed to get receive address:', error);
      }
    })();
  }, []);

  useEffect(() => {
    const bsvBalanceInSats = Math.round(bsvBalance * BSV_DECIMAL_CONVERSION);
    setIsSendAllBsv(satSendAmount === bsvBalanceInSats);
  }, [satSendAmount, bsvBalance]);

  const getAndSetBsvBalance = async () => {
    const satoshis = await getWalletBalance();
    setBsvBalance(satoshis / 100_000_000);
    const rate = await fetchExchangeRate(apiContext.chain, apiContext.wocApiKey);
    setExchangeRate(rate);
  };

  useEffect(() => {
    if (updateBalance) {
      getAndSetBsvBalance();
      loadLocks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateBalance]);

  useEffect(() => {
    if (isReload) window.location.reload();
  }, [isReload]);

  const loadLocks = async () => {
    const lockData = await getLockData.execute(apiContext, {});
    setLockData(lockData);
  };

  useEffect(() => {
    loadLocks && loadLocks();
    getAndSetBsvBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch MNEE balance once receiveAddress is available
  useEffect(() => {
    if (receiveAddress) {
      updateMneeBalance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiveAddress]);

  const refreshUtxos = async (showLoad = false) => {
    showLoad && setIsProcessing(true);
    await getAndSetBsvBalance();
    loadLocks && loadLocks();

    sendMessage({ action: YoursEventName.SYNC_UTXOS });

    showLoad && setIsProcessing(false);
  };

  useEffect(() => {
    if (connectRequest) {
      navigate('/connect');
      return;
    }
  });

  useEffect(() => {
    if (!identityAddress || isSyncing) return;
    getAndSetBsvBalance();
    // Auto-unlock: attempt to unlock matured coins via CWI
    if (!unlockAttempted && lockData?.unlockable) {
      (async () => {
        const res = await unlockBsv.execute(apiContext, {});
        setUnlockAttempted(true);
        if (res.txid) {
          await refreshUtxos();
          await sleep(1000);
          addSnackbar('Successfully unlocked coins!', 'success');
        }
        // Note: unlockBsv may return error if it requires direct key access
        // In that case, unlocking happens on the service worker side
      })();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityAddress, isSyncing, lockData]);

  const resetSendState = () => {
    setIsProcessing(false);
    resetRecipients();
    setIsSendAllBsv(false);
    setSatSendAmount(null);
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(receiveAddress).then(() => {
      addSnackbar('Copied!', 'success');
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    });
  };

  const handleSendMNEE = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);
    if (!mneeRecipient || !mneeReciepientAmount) {
      addSnackbar('Enter a recipient and amount!', 'info');
      return;
    }

    if (mneeReciepientAmount > mneeBalance) {
      addSnackbar('Insufficient MNEE balance!', 'error');
      setIsProcessing(false);
      return;
    }

    if (mneeReciepientAmount <= 0.00001) {
      addSnackbar('Minimum send amount is 0.00001 MNEE!', 'error');
      setIsProcessing(false);
      return;
    }

    // TODO: MNEE requires direct key access for cosigning flow.
    // Need to implement message-based MNEE transfer in background.ts
    // For now, show a message that MNEE is temporarily unavailable
    if (!apiContext) {
      addSnackbar('Wallet not ready.', 'error');
      setIsProcessing(false);
      return;
    }

    try {
      const derivationResult = await deriveDepositAddresses.execute(apiContext, {
        prefix: 'yours',
        startIndex: 0,
        count: 5,
      });

      addSnackbar('Transaction initiated. Processing...', 'info');

      const res = await sendMnee.execute(apiContext, {
        recipients: [{ address: mneeRecipient, amount: mneeReciepientAmount }],
        derivations: derivationResult.derivations,
      });

      if (res.error) {
        addSnackbar(`Transaction failed: ${res.error}`, 'error');
        setIsProcessing(false);
        return;
      }

      setMneeRecipient('');
      setMneeRecipientAmount(null);
      setTimeout(updateMneeBalance, 1000);
      setPageState('main');
      addSnackbar('Transaction Successful!', 'success');
    } catch (error: unknown) {
      console.error('MNEE transfer error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('status: 423')) {
        addSnackbar('The sending or receiving address may be frozen. Please contact support.', 'error');
      } else {
        addSnackbar(getErrorMessage(errorMessage) || 'Transfer failed. Please try again.', 'error');
      }
    } finally {
      setIsProcessing(false);
    }

    /* Legacy MNEE transfer code removed — now using @1sat/actions sendMnee
    const keys = await keysService.retrieveKeys(passwordConfirm);
    if (!keys?.walletWif) {
      addSnackbar('Invalid password!', 'error');
      setIsProcessing(false);
      return;
    }

    try {
      // Initiate the transfer with broadcast flag
      const res = await mneeService.transfer(
        [{ address: mneeRecipient, amount: mneeReciepientAmount }],
        keys.walletWif,
        { broadcast: true },
      );

      // Handle ticket-based response
      if (res.ticketId) {
        addSnackbar('Transaction initiated. Processing...', 'info');

        // Poll for transaction status
        let finalStatus = null;
        let attempts = 0;
        const maxAttempts = 30; // 30 attempts with 2 second intervals = 60 seconds max

        while (attempts < maxAttempts) {
          await sleep(2000); // Wait 2 seconds between polls

          try {
            const status = await mneeService.getTxStatus(res.ticketId);

            if (status.status === 'SUCCESS' || status.status === 'MINED') {
              finalStatus = status;
              break;
            } else if (status.status === 'FAILED') {
              addSnackbar(`Transaction failed: ${status.errors || 'Unknown error'}`, 'error');
              setPasswordConfirm('');
              setIsProcessing(false);
              return;
            }
            // If BROADCASTING, continue polling
          } catch (pollError) {
            console.error('Error polling transaction status:', pollError);
          }

          attempts++;
        }

        if (!finalStatus) {
          addSnackbar('Transaction timeout. Please check your transaction history.', 'error');
          setPasswordConfirm('');
          setIsProcessing(false);
          return;
        }

        // Transaction successful
        setMneeRecipient('');
        setMneeRecipientAmount(null);
        setTimeout(updateMneeBalance, 1000);
        setPasswordConfirm('');
        setPageState('main');
        addSnackbar('Transaction Successful!', 'success');
        setIsProcessing(false);
      } else if (res.rawtx) {
        // Legacy response with raw transaction (shouldn't happen with broadcast: true)
        addSnackbar('Transaction created but not broadcast. Please try again.', 'info');
        setPasswordConfirm('');
        setIsProcessing(false);
        return;
      } else {
        // No valid response
        addSnackbar('Transfer failed. No valid response from server.', 'error');
        setPasswordConfirm('');
        setIsProcessing(false);
        return;
      }
    } catch (error: unknown) {
      console.error('MNEE transfer error:', error);
      // Check for specific error messages
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('status: 423')) {
        addSnackbar('The sending or receiving address may be frozen. Please contact support.', 'error');
      } else {
        addSnackbar(getErrorMessage(errorMessage) || 'Transfer failed. Please try again.', 'error');
      }
      setPasswordConfirm('');
      setIsProcessing(false);
    }
    */
  };

  const handleSendBsv = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    resetRecipientErrors();
    setIsProcessing(true);
    await sleep(25);

    //? multi-send validate all recipients
    for (const recipient of recipients) {
      if (!isValidEmail(recipient.address) && !validate(recipient.address)) {
        updateRecipient(recipient.id, 'error', 'Provide a valid BSV or Paymail address.');
        addSnackbar('All recipients must have valid BSV or Paymail addresses.', 'info');
        setIsProcessing(false);
        return;
      }

      if (!recipient.satSendAmount && !recipient.usdSendAmount) {
        updateRecipient(recipient.id, 'error', 'Provide an amount.');
        addSnackbar('All recipients must have an amount.', 'info');
        setIsProcessing(false);
        return;
      }
    }

    //? multi-send calculate all amounts
    const sendRecipients = recipients.map((r) => {
      let satoshis = r.satSendAmount ?? 0;
      if (r.amountType === 'usd' && r.usdSendAmount) {
        satoshis = Math.ceil((r.usdSendAmount / exchangeRate) * BSV_DECIMAL_CONVERSION);
      }
      return isValidEmail(r.address) ? { paymail: r.address, satoshis } : { address: r.address, satoshis };
    });

    let sendRes;
    if (isSendAllBsv) {
      const r = sendRecipients[0];
      const destination = r.address ?? r.paymail ?? '';
      sendRes = await sendAllBsv.execute(apiContext, { destination });
    } else {
      sendRes = await sendBsv.execute(apiContext, { requests: sendRecipients });
    }

    if (!sendRes.txid || sendRes.error) {
      addSnackbar(getErrorMessage(sendRes.error), 'error');
      setIsProcessing(false);
      return;
    }

    resetSendState();
    setPageState('main');
    setTimeout(() => refreshUtxos(), 1000);
    addSnackbar('Transaction Successful!', 'success');
    setIsProcessing(false);
  };

  const fillInputWithAllBsv = () => {
    setSatSendAmount(Math.round(bsvBalance * BSV_DECIMAL_CONVERSION));
    setRecipients([
      {
        id: crypto.randomUUID(),
        address: '',
        satSendAmount: Math.round(bsvBalance * BSV_DECIMAL_CONVERSION),
        usdSendAmount: null,
        amountType: 'bsv',
      },
    ]);
  };

  const getLabel = () => {
    let satAmount = 0;
    recipients.forEach((r) => {
      const usdAmountInSats = r.usdSendAmount
        ? Math.ceil((r.usdSendAmount / exchangeRate) * BSV_DECIMAL_CONVERSION)
        : 0;
      satAmount += r.satSendAmount ?? usdAmountInSats;
    });
    const sendAmount = satAmount ? satAmount / BSV_DECIMAL_CONVERSION : 0;
    const overBalance = sendAmount > bsvBalance;
    return sendAmount
      ? overBalance
        ? 'Insufficient Balance'
        : `Send ${satAmount / BSV_DECIMAL_CONVERSION}`
      : 'Enter Send Details';
  };

  const getMneeLabel = () => {
    return mneeReciepientAmount ? `Send ${mneeReciepientAmount.toFixed(5)} MNEE` : 'Enter Send Details';
  };

  const handleDismissWelcome = async () => {
    await chromeStorageService.update({ showWelcome: false });
    setShowWelcome(false);
  };

  const handleTokenClick = (token: Bsv21Balance) => {
    if (token.all.pending > 0n) {
      addSnackbar('Pending tokens cannot be sent!', 'error', 2000);
      return;
    }
    setToken({
      isConfirmed: true,
      info: token,
    });
  };

  const handleTestNetFaucetConfirmation = () => {
    addSnackbar('Testnet coins sent! It may take one block confirmation for them to appear in your wallet.', 'success');
    refreshUtxos();
  };

  const handleSendAllMnee = async () => {
    if (!apiContext?.services?.mnee) {
      setMneeRecipientAmount(mneeBalance);
      return;
    }
    try {
      const config = await apiContext.services.mnee.getConfig();
      const atomicBalance = MneeClient.toAtomicAmount(mneeBalance);
      const fee = config.fees.find((f) => atomicBalance >= f.min && atomicBalance <= f.max)?.fee || 0;
      setMneeRecipientAmount(MneeClient.fromAtomicAmount(atomicBalance - fee));
    } catch {
      setMneeRecipientAmount(mneeBalance);
    }
  };

  const receive = (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="flex flex-col items-center w-full pt-14 pb-20 px-4 overflow-y-auto"
      style={{ minHeight: 'calc(100% - 3.75rem)', backgroundColor: theme.color.global.walletBackground }}
    >
      {/* Header row */}
      <div className="flex items-center w-full mb-5 mt-2">
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            setPageState('main');
            getAndSetBsvBalance();
          }}
          className="flex items-center justify-center w-8 h-8 rounded-full border-0 outline-none cursor-pointer mr-3"
          style={{ background: theme.color.global.row, color: theme.color.global.gray }}
        >
          <ArrowLeft size={16} />
        </motion.button>
        <h2 className="text-base font-bold tracking-tight flex-1" style={{ color: theme.color.global.contrast }}>
          Receive Assets
        </h2>
      </div>

      {/* Info text */}
      <Show
        when={services.ordinals || services.bsv21}
        whenFalseContent={
          <p className="text-xs text-center mb-4" style={{ color: theme.color.global.gray }}>
            You may safely send{' '}
            <span className="font-semibold" style={{ color: theme.color.component.primaryButtonLeftGradient }}>
              Bitcoin SV (BSV)
            </span>{' '}
            to this address.
          </p>
        }
      >
        <p className="text-xs text-center mb-4" style={{ color: theme.color.global.gray }}>
          You may safely send{' '}
          <span className="font-semibold" style={{ color: theme.color.component.primaryButtonLeftGradient }}>
            BSV, MNEE, and Ordinals
          </span>{' '}
          to this address.
        </p>
      </Show>

      {/* QR code */}
      <QrCode address={receiveAddress} onClick={handleCopyToClipboard} />

      {/* Address copy row */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleCopyToClipboard}
        className="flex items-center gap-2 mt-5 px-4 py-3 rounded-xl w-full border-0 outline-none cursor-pointer text-left"
        style={{ background: theme.color.global.row }}
      >
        <AnimatePresence mode="wait">
          {copiedAddress ? (
            <motion.div
              key="check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Check size={16} style={{ color: theme.color.component.primaryButtonLeftGradient }} />
            </motion.div>
          ) : (
            <motion.div
              key="copy"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Copy size={16} style={{ color: theme.color.global.gray }} />
            </motion.div>
          )}
        </AnimatePresence>
        <span className="text-xs font-mono truncate flex-1" style={{ color: theme.color.global.contrast }}>
          {receiveAddress}
        </span>
        <span className="text-xs shrink-0" style={{ color: theme.color.global.gray }}>
          {copiedAddress ? 'Copied!' : 'Copy'}
        </span>
      </motion.button>
    </motion.div>
  );

  const listItemStyle = {
    borderColor: theme.color.global.gray + '14',
  };

  const main = (
    <MainContent>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.07 } },
        }}
        className="flex flex-col items-center w-full pt-14 pb-16 overflow-y-auto"
        style={{ minHeight: '100%' }}
      >
        {/* ── Profile avatar ── */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: -12 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="mt-4"
        >
          <Show when={socialProfile.avatar !== HOSTED_YOURS_IMAGE}>
            <motion.img
              whileHover={{ scale: 1.06 }}
              src={socialProfile.avatar}
              className="w-14 h-14 rounded-full object-cover mb-2"
              style={{ outline: `2px solid ${theme.color.component.primaryButtonLeftGradient}40` }}
              alt="Profile"
            />
          </Show>
        </motion.div>

        {/* ── USD balance ── */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="flex flex-col items-center mt-2"
        >
          <h1
            title="Sync Transactions"
            onClick={() => {}}
            className="text-4xl font-bold tracking-tight cursor-pointer select-none"
            style={{ color: theme.color.global.contrast, letterSpacing: '-0.02em' }}
          >
            {formatUSD(bsvBalance * exchangeRate)}
          </h1>
          <div className="flex items-center gap-1.5 mt-1">
            <img src={bsvCoin} className="w-3.5 h-3.5 opacity-70" alt="BSV" />
            <span className="text-sm font-mono" style={{ color: theme.color.global.gray }}>
              {bsvBalance.toFixed(8)} BSV
            </span>
          </div>
        </motion.div>

        {/* ── Action buttons ── */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
          className="flex items-center gap-4 mt-6 w-[88%]"
        >
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onClick={() => setPageState('receive')}
            className="flex flex-1 items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm border-0 outline-none cursor-pointer"
            style={{
              background: `linear-gradient(135deg, ${theme.color.component.primaryButtonLeftGradient}, ${theme.color.component.primaryButtonRightGradient})`,
              color: theme.color.component.primaryButtonText,
            }}
          >
            <ArrowDownToLine size={16} strokeWidth={2.5} />
            Receive
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onClick={() => setPageState('send')}
            className="flex flex-1 items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm border-0 outline-none cursor-pointer"
            style={{
              background: `linear-gradient(135deg, ${theme.color.component.primaryButtonLeftGradient}, ${theme.color.component.primaryButtonRightGradient})`,
              color: theme.color.component.primaryButtonText,
            }}
          >
            <ArrowUpFromLine size={16} strokeWidth={2.5} />
            Send
          </motion.button>
        </motion.div>

        {/* ── Faucet button (testnet only) ── */}
        <motion.div
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
          className="w-full flex justify-center mt-2"
        >
          <FaucetButton
            onConfirmation={handleTestNetFaucetConfirmation}
            address={receiveAddress}
            isTestnet={isTestnet}
          />
        </motion.div>

        {/* ── Assets section ── */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full mt-6"
        >
          {/* Section header */}
          <div className="flex items-center px-4 mb-2">
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: theme.color.global.gray }}
            >
              Assets
            </span>
            <div className="flex-1 ml-3 h-px opacity-20" style={{ backgroundColor: theme.color.global.gray }} />
          </div>

          <AssetRow
            balance={bsvBalance}
            icon={bsvCoin}
            ticker="BSV"
            usdBalance={bsvBalance * exchangeRate}
            showPointer={false}
          />
          <Show when={services.mnee && !isTestnet}>
            <AssetRow
              balance={mneeBalance}
              icon={MNEE_ICON_URL}
              ticker="MNEE USD"
              usdBalance={mneeBalance}
              showPointer={mneeBalance > 0}
              isMNEE
              onGetMneeClick={() => setPageState('getMNEE')}
              onClick={() => (mneeBalance > 0 ? setPageState('sendMNEE') : null)}
            />
          </Show>
          {lockData && (
            <Show when={services.locks && lockData.totalLocked > 0}>
              <AssetRow
                animate
                ticker="Total Locked"
                showPointer={true}
                balance={lockData.totalLocked / BSV_DECIMAL_CONVERSION}
                usdBalance={Number((lockData.unlockable / BSV_DECIMAL_CONVERSION).toFixed(3))}
                icon={lockIcon}
                isLock
                nextUnlock={lockData?.nextUnlock}
                onClick={() => handleSelect('tools', 'pending-locks')}
              />
            </Show>
          )}
        </motion.div>

        {/* ── Favorite tokens ── */}
        <Show when={services.bsv21}>
          <motion.div
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="w-full"
          >
            {filteredTokens.length > 0 && (
              <Bsv21TokensList
                key={randomKey}
                hideStatusLabels
                tokens={filteredTokens}
                theme={theme}
                onTokenClick={(t: Bsv21Balance) => handleTokenClick(t)}
              />
            )}
          </motion.div>
        </Show>

        {/* ── Quick links (Manage Tokens / Recent Activity) ── */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full mt-4 px-4 flex flex-col gap-2"
        >
          <Show when={services.bsv21}>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setManageFavorites(!manageFavorites)}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border text-left cursor-pointer outline-none transition-colors duration-150 bg-[#17191E] hover:bg-[#1f2128]"
              style={listItemStyle}
            >
              <List size={16} color={theme.color.global.gray} />
              <span className="text-sm font-semibold" style={{ color: theme.color.global.gray }}>
                Manage Tokens List
              </span>
            </motion.button>
          </Show>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setHistoryTx(!historyTx)}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border text-left cursor-pointer outline-none transition-colors duration-150 bg-[#17191E] hover:bg-[#1f2128]"
            style={listItemStyle}
          >
            <History size={16} color={theme.color.global.gray} />
            <span className="text-sm font-semibold" style={{ color: theme.color.global.gray }}>
              Recent Activity
            </span>
          </motion.button>
        </motion.div>

        {/* Bottom breathing room */}
        <div className="h-4" />
      </motion.div>
    </MainContent>
  );

  const sendMNEE = (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="flex flex-col items-center w-full pt-14 pb-20 px-4 overflow-y-auto"
      style={{ minHeight: 'calc(100% - 3.75rem)', backgroundColor: theme.color.global.walletBackground }}
    >
      {/* Header */}
      <div className="flex items-center w-full mb-5 mt-2">
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            setPageState('main');
            setMneeRecipient('');
            setMneeRecipientAmount(null);
          }}
          className="flex items-center justify-center w-8 h-8 rounded-full border-0 outline-none cursor-pointer mr-3"
          style={{ background: theme.color.global.row, color: theme.color.global.gray }}
        >
          <ArrowLeft size={16} />
        </motion.button>
        <div className="flex items-center gap-2 flex-1">
          <img src={MNEE_ICON_URL} className="w-6 h-6 rounded-full" alt="MNEE" />
          <h2 className="text-base font-bold tracking-tight" style={{ color: theme.color.global.contrast }}>
            Send MNEE
          </h2>
        </div>
      </div>

      {/* Balance chip */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={handleSendAllMnee}
        className="flex items-center gap-2 px-4 py-2 rounded-full border-0 outline-none cursor-pointer mb-5"
        style={{ background: theme.color.global.row }}
        title="Tap to fill max amount"
      >
        <span className="text-xs" style={{ color: theme.color.global.gray }}>
          Balance
        </span>
        <span className="text-sm font-semibold font-mono" style={{ color: theme.color.global.contrast }}>
          {formatNumberWithCommasAndDecimals(mneeBalance, 5)}
        </span>
        <span className="text-xs font-semibold" style={{ color: theme.color.component.primaryButtonLeftGradient }}>
          MNEE
        </span>
        <span
          className="text-[10px] ml-1 px-1.5 py-0.5 rounded"
          style={{
            background: `${theme.color.component.primaryButtonLeftGradient}20`,
            color: theme.color.component.primaryButtonLeftGradient,
          }}
        >
          MAX
        </span>
      </motion.button>

      {/* Form */}
      <form noValidate onSubmit={(e) => handleSendMNEE(e)} className="flex flex-col items-center w-full gap-3">
        {/* Address input card */}
        <div className="w-full rounded-2xl p-4" style={{ background: theme.color.global.row }}>
          <p
            className="text-[10px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: theme.color.global.gray }}
          >
            Recipient Address
          </p>
          <div className="relative w-full">
            <Input
              theme={theme}
              placeholder="Enter Address"
              type="text"
              onChange={(e) => setMneeRecipient(e.target.value)}
              value={mneeRecipient}
            />
          </div>
        </div>

        {/* Amount input card */}
        <div className="w-full rounded-2xl p-4" style={{ background: theme.color.global.row }}>
          <p
            className="text-[10px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: theme.color.global.gray }}
          >
            Amount (MNEE)
          </p>
          <div className="relative w-full">
            <Input
              theme={theme}
              placeholder="Enter MNEE Amount"
              type="number"
              step="0.00001"
              value={mneeReciepientAmount !== null && mneeReciepientAmount !== undefined ? mneeReciepientAmount : ''}
              onChange={(e) => {
                const inputValue = e.target.value;
                if (inputValue === '') {
                  setMneeRecipientAmount(null);
                } else {
                  setMneeRecipientAmount(Number(inputValue));
                }
              }}
            />
          </div>
        </div>

        {/* Send button */}
        <Button
          theme={theme}
          type="primary"
          label={getMneeLabel()}
          disabled={
            isProcessing ||
            mneeReciepientAmount === null ||
            mneeReciepientAmount === undefined ||
            mneeReciepientAmount <= 0
          }
          isSubmit
        />
      </form>

      {/* Swap & Bridge banner */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => window.open('https://swap-user.mnee.net', '_blank')}
        className="flex items-center justify-between w-full mt-3 px-4 py-3 rounded-2xl border-0 outline-none cursor-pointer"
        style={{ background: 'linear-gradient(135deg, #ff950015, #ffb80015)', border: '1px solid #ff950030' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: '#ffb800' }}>
            Swap &amp; Bridge
          </span>
          <span className="text-xs" style={{ color: theme.color.global.gray }}>
            Convert assets on mnee.net
          </span>
        </div>
        <ExternalLink size={14} style={{ color: '#ffb800' }} />
      </motion.button>
    </motion.div>
  );

  const getMnee = (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="flex flex-col items-center w-full pt-14 pb-20 px-4 overflow-y-auto"
      style={{ minHeight: 'calc(100% - 3.75rem)', backgroundColor: theme.color.global.walletBackground }}
    >
      {/* Header */}
      <div className="flex items-center w-full mb-5 mt-2">
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => setPageState('main')}
          className="flex items-center justify-center w-8 h-8 rounded-full border-0 outline-none cursor-pointer mr-3"
          style={{ background: theme.color.global.row, color: theme.color.global.gray }}
        >
          <ArrowLeft size={16} />
        </motion.button>
        <h2 className="text-base font-bold tracking-tight" style={{ color: theme.color.global.contrast }}>
          Get MNEE
        </h2>
      </div>

      {/* Info card */}
      <div className="w-full rounded-2xl p-5 mb-5" style={{ background: theme.color.global.row }}>
        <div className="flex items-center gap-3 mb-3">
          <img src={MNEE_ICON_URL} className="w-10 h-10 rounded-full" alt="MNEE" />
          <div>
            <p className="text-sm font-bold" style={{ color: theme.color.global.contrast }}>
              MNEE Stablecoin
            </p>
            <p className="text-xs" style={{ color: theme.color.global.gray }}>
              1 MNEE = $1.00 USD
            </p>
          </div>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: theme.color.global.gray }}>
          MNEE is the{' '}
          <span className="font-semibold" style={{ color: theme.color.component.primaryButtonLeftGradient }}>
            first USD-backed stablecoin
          </span>{' '}
          on the BSV blockchain. Each token is fully collateralized with US T-bills and cash equivalents.
        </p>
      </div>

      {/* QR code */}
      <QrCode link={MNEE_MOBILE_REFERRAL_LINK} onClick={handleCopyToClipboard} />

      <p className="text-xs font-semibold mt-4 mb-5" style={{ color: theme.color.global.gray }}>
        Scan with your mobile device to get started
      </p>
    </motion.div>
  );

  const send = (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="flex flex-col items-center w-full pt-14 pb-20 px-4 overflow-y-auto"
      style={{ minHeight: 'calc(100% - 3.75rem)', backgroundColor: theme.color.global.walletBackground }}
    >
      {/* Header */}
      <div className="flex items-center w-full mb-5 mt-2">
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            setPageState('main');
            resetRecipients();
            resetSendState();
          }}
          className="flex items-center justify-center w-8 h-8 rounded-full border-0 outline-none cursor-pointer mr-3"
          style={{ background: theme.color.global.row, color: theme.color.global.gray }}
        >
          <ArrowLeft size={16} />
        </motion.button>
        <div className="flex items-center gap-2 flex-1">
          <img src={bsvCoin} className="w-5 h-5" alt="BSV" />
          <h2 className="text-base font-bold tracking-tight" style={{ color: theme.color.global.contrast }}>
            Send BSV
          </h2>
        </div>
      </div>

      {/* Balance chip */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={fillInputWithAllBsv}
        className="flex items-center gap-2 px-4 py-2 rounded-full border-0 outline-none cursor-pointer mb-5"
        style={{ background: theme.color.global.row }}
        title="Tap to fill max balance"
      >
        <span className="text-xs" style={{ color: theme.color.global.gray }}>
          Balance
        </span>
        <span className="text-sm font-semibold font-mono" style={{ color: theme.color.global.contrast }}>
          {bsvBalance.toFixed(8)}
        </span>
        <span className="text-xs font-semibold" style={{ color: theme.color.component.primaryButtonLeftGradient }}>
          BSV
        </span>
        <span
          className="text-[10px] ml-1 px-1.5 py-0.5 rounded"
          style={{
            background: `${theme.color.component.primaryButtonLeftGradient}20`,
            color: theme.color.component.primaryButtonLeftGradient,
          }}
        >
          MAX
        </span>
      </motion.button>

      {/* Form */}
      <form noValidate onSubmit={(e) => handleSendBsv(e)} className="flex flex-col items-center w-full gap-3">
        {/* Recipient cards */}
        <AnimatePresence>
          {recipients.map((recipient, idx) => (
            <motion.div
              key={recipient.id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full rounded-2xl p-4 flex flex-col gap-3"
              style={{ background: theme.color.global.row }}
            >
              {/* Card header */}
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: theme.color.global.gray }}
                >
                  {recipients.length > 1 ? `Recipient ${idx + 1}` : 'Recipient'}
                </span>
                {recipients.length > 1 && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    onClick={() => removeRecipient(recipient.id)}
                    className="flex items-center justify-center w-6 h-6 rounded-full border-0 outline-none cursor-pointer"
                    style={{ background: '#ff444415', color: '#ff4444' }}
                  >
                    <Trash2 size={12} />
                  </motion.button>
                )}
              </div>

              {/* Address input */}
              <Input
                theme={theme}
                placeholder="Enter Address or Paymail"
                type="text"
                onChange={(e) => updateRecipient(recipient.id, 'address', e.target.value)}
                value={recipient.address}
              />

              {/* Error */}
              {recipient.error && (
                <p className="text-xs" style={{ color: '#ff4444' }}>
                  {recipient.error}
                </p>
              )}

              {/* Amount input + unit toggle */}
              <div
                className="flex items-center w-[85%] mx-auto rounded-xl border"
                style={{
                  backgroundColor: theme.color.global.row,
                  borderColor: theme.color.global.gray + '40',
                }}
              >
                <input
                  placeholder={recipient.amountType === 'bsv' ? 'Enter BSV Amount' : 'Enter USD Amount'}
                  type="number"
                  step="0.00000001"
                  className="flex-1 bg-transparent h-9 px-4 text-sm outline-none border-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                  style={{
                    color: theme.color.global.contrast,
                    fontFamily: "'Inter', Arial, Helvetica, sans-serif",
                  }}
                  value={
                    recipient.satSendAmount !== null && recipient.satSendAmount !== undefined
                      ? recipient.satSendAmount / BSV_DECIMAL_CONVERSION
                      : recipient.usdSendAmount !== null && recipient.usdSendAmount !== undefined
                        ? recipient.usdSendAmount
                        : ''
                  }
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    if (inputValue === '') {
                      updateRecipient(recipient.id, 'satSendAmount', null);
                      updateRecipient(recipient.id, 'usdSendAmount', null);
                    } else {
                      if (recipient.amountType === 'bsv') {
                        updateRecipient(
                          recipient.id,
                          'satSendAmount',
                          Math.round(Number(inputValue) * BSV_DECIMAL_CONVERSION),
                        );
                      } else {
                        updateRecipient(recipient.id, 'usdSendAmount', Number(inputValue));
                      }
                    }
                  }}
                  onWheel={(e) => {
                    (e.target as HTMLInputElement).blur();
                    e.stopPropagation();
                    setTimeout(() => (e.target as HTMLInputElement).focus(), 0);
                  }}
                />
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  type="button"
                  onClick={() => toggleRecipientAmountType(recipient.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 mr-1.5 rounded-lg border-0 outline-none cursor-pointer shrink-0"
                  style={{ background: `${theme.color.component.primaryButtonLeftGradient}18` }}
                >
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: theme.color.component.primaryButtonLeftGradient }}
                  >
                    {recipient.amountType === 'bsv' ? 'BSV' : 'USD'}
                  </span>
                  <ArrowUpDown size={10} style={{ color: theme.color.component.primaryButtonLeftGradient }} />
                </motion.button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Add recipient */}
        <Show when={!isSendAllBsv}>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={addRecipient}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-0 outline-none cursor-pointer"
            style={{
              background: `${theme.color.component.primaryButtonLeftGradient}10`,
              border: `1px dashed ${theme.color.component.primaryButtonLeftGradient}40`,
            }}
          >
            <Plus size={14} style={{ color: theme.color.component.primaryButtonLeftGradient }} />
            <span className="text-sm font-semibold" style={{ color: theme.color.component.primaryButtonLeftGradient }}>
              Add Recipient
            </span>
          </motion.button>
        </Show>

        {/* Send button */}
        <Button
          theme={theme}
          type="primary"
          label={getLabel()}
          disabled={
            isProcessing ||
            getLabel() === 'Insufficient Balance' ||
            (!computeTotalAmount().totalBsv && !computeTotalAmount().totalUsd)
          }
          isSubmit
        />
      </form>
    </motion.div>
  );

  if (token) {
    return <SendBsv21View token={token} onBack={() => setToken(null)} />;
  }

  if (showWelcome) {
    return <UpgradeNotification onDismiss={handleDismissWelcome} />;
  }

  return (
    <>
      <Show when={manageFavorites}>
        <ManageTokens
          onBack={() => {
            setManageFavorites(false);
            getAndSetAccountAndBsv21s();
            setRandomKey(Math.random());
          }}
          tokens={bsv21s}
          theme={theme}
        />
      </Show>
      <Show when={historyTx}>
        <TxHistory
          onBack={() => {
            setHistoryTx(false);
            getAndSetAccountAndBsv21s();
            setRandomKey(Math.random());
          }}
          theme={theme}
        />
      </Show>
      <TopNav />
      <Show when={isProcessing && pageState === 'main'}>
        <PageLoader theme={theme} message="Loading wallet..." />
      </Show>
      <Show when={isProcessing && pageState === 'send'}>
        <PageLoader theme={theme} message="Sending BSV..." />
      </Show>
      <Show when={isProcessing && pageState === 'sendMNEE'}>
        <PageLoader theme={theme} message="Sending MNEE..." />
      </Show>
      <Show when={!isProcessing && pageState === 'main'}>{main}</Show>
      <Show when={!isProcessing && pageState === 'receive'}>{receive}</Show>
      <Show when={!isProcessing && pageState === 'send'}>{send}</Show>
      <Show when={!isProcessing && pageState === 'sendMNEE'}>{sendMNEE}</Show>
      <Show when={!isProcessing && pageState === 'getMNEE'}>{getMnee}</Show>
    </>
  );
};
