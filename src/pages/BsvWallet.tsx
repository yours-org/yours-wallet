import { validate } from 'bitcoin-address-validation';
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  List,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeft,
  Copy,
  Check,
  Trash2,
  Plus,
  ArrowUpDown,
  ExternalLink,
  Loader2,
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
import { useIdentity, resolveImageUrl } from '../hooks/useIdentity';
import { useTheme } from '../hooks/useTheme';
import {
  BSV_DECIMAL_CONVERSION,
  GENERIC_TOKEN_ICON,
  MNEE_ICON_URL,
  MNEE_MOBILE_REFERRAL_LINK,
} from '../utils/constants';
import { formatNumberWithCommasAndDecimals, formatUSD } from '../utils/format';
import { sleep } from '../utils/sleep';
import { isUri } from '../utils/uri';
import { AssetRow } from '../components/AssetRow';
import { BackupPromo } from '../components/BackupPromo';
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
import { sendMessageAsync } from '../utils/chromeHelpers';
import { YoursEventName } from '../inject';
import { useSyncTracker } from '../hooks/useSyncTracker';
import { getErrorMessage, isValidEmail } from '../utils/tools';
import { UpgradeNotification } from '../components/UpgradeNotification';
import { Bsv21TokensList } from '../components/Bsv21TokensList';
import { ManageTokens } from '../components/ManageTokens';
import { Account, ChromeStorageObject } from '../services/types/chromeStorage.types';
import { SendBsv21View } from '../components/SendBsv21View';
import { AssetPicker, type PickableAsset } from '../components/AssetPicker';
import { SendConfirmation, type SendLineItem } from '../components/SendConfirmation';
import { CoinHistory } from '../components/CoinHistory';
import { getMneeBalance, sendMnee, deriveDepositAddresses, ONESAT_MAINNET_CONTENT_URL } from '@1sat/actions';
import { MneeClient } from '@1sat/client';
import { PrivateKey } from '@bsv/sdk';
import { getLegacyMneeBalance, sweepLegacyMnee } from '../utils/sweepLegacyMnee';
import { decrypt } from '../utils/crypto';
import type { Keys } from '../utils/keys';

// CopyAddressed feedback state hook — used in receive view

type PageState = 'main' | 'receive' | 'send' | 'sendMNEE' | 'getMNEE' | 'asset-picker';
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
  const [sendSource, setSendSource] = useState<PageState>('main');
  const [satSendAmount, setSatSendAmount] = useState<number | null>(null);
  const { addSnackbar } = useSnackbar();
  const { chromeStorageService, apiContext, keysService } = useServiceContext();
  const { profile: identityProfile } = useIdentity(apiContext, chromeStorageService);
  const avatarUrl = useMemo(() => {
    if (!identityProfile.image || !apiContext.services) return '';
    return resolveImageUrl(identityProfile.image, apiContext);
  }, [identityProfile.image, apiContext]);
  const [avatarReady, setAvatarReady] = useState(false);

  // Pre-load the avatar image so it's decoded before we render it.
  useEffect(() => {
    if (!avatarUrl) {
      setAvatarReady(false);
      return;
    }
    const img = new Image();
    img.src = avatarUrl;
    img.onload = () => setAvatarReady(true);
    img.onerror = () => setAvatarReady(false);
  }, [avatarUrl]);

  const [unlockAttempted, setUnlockAttempted] = useState(false);
  const { connectRequest } = useWeb3RequestContext();
  const [isProcessing, setIsProcessing] = useState(false);
  const [sendConfirmation, setSendConfirmation] = useState<{
    icon?: string;
    lineItems: SendLineItem[];
    total: string;
    onConfirm: () => void;
  } | null>(null);
  // Get identityAddress from chrome storage (selected account)
  const identityAddress = chromeStorageService.getCurrentAccountObject().account?.addresses?.identityAddress || '';
  const [receiveAddress, setReceiveAddress] = useState<string>('');
  const [bsvBalance, setBsvBalance] = useState<number>(0);
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [lockData, setLockData] = useState<LockData>();
  const [isSendAllBsv, setIsSendAllBsv] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showBackupPromo, setShowBackupPromo] = useState(false);
  const [keysAlreadyBackedUp, setKeysAlreadyBackedUp] = useState(false);
  const [bsv21s, setBsv21s] = useState<Bsv21Balance[]>([]);
  const [manageFavorites, setManageFavorites] = useState(false);
  const [account, setAccount] = useState<Account>();
  const [token, setToken] = useState<{ isConfirmed: boolean; info: Bsv21Balance } | null>(null);
  const services = theme.settings.services;
  const [filteredTokens, setFilteredTokens] = useState<Bsv21Balance[]>([]);
  const [randomKey, setRandomKey] = useState(Math.random());
  // Bump to force a refresh of the per-coin CoinHistory list (e.g. after a successful send)
  const [bsvHistoryRefreshKey, setBsvHistoryRefreshKey] = useState(0);
  const [mneeHistoryRefreshKey, setMneeHistoryRefreshKey] = useState(0);
  const [mneeBalance, setMneeBalance] = useState(0);
  const [copiedAddress, setCopiedAddress] = useState(false);

  // Legacy MNEE sweep state
  const [legacyMneeBalance, setLegacyMneeBalance] = useState(0);
  const [legacyMneeSweeping, setLegacyMneeSweeping] = useState(false);
  const [legacyMneeSweepMsg, setLegacyMneeSweepMsg] = useState('');
  const [showLegacyMneePrompt, setShowLegacyMneePrompt] = useState(false);

  // MNEE supports multi-recipient at the action level, so the UI mirrors BSV's pattern
  type MneeRecipient = { id: string; address: string; amount: number | null };
  const [mneeRecipients, setMneeRecipients] = useState<MneeRecipient[]>([
    { id: crypto.randomUUID(), address: '', amount: null },
  ]);

  const addMneeRecipient = () => {
    setMneeRecipients((prev) => [...prev, { id: crypto.randomUUID(), address: '', amount: null }]);
  };

  const removeMneeRecipient = (id: string) => {
    if (mneeRecipients.length > 1) {
      setMneeRecipients((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const updateMneeRecipient = (id: string, field: 'address' | 'amount', value: string | number | null) => {
    setMneeRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const resetMneeRecipients = () => {
    setMneeRecipients([{ id: crypto.randomUUID(), address: '', amount: null }]);
  };

  const mneeTotal = mneeRecipients.reduce((acc, r) => acc + (r.amount ?? 0), 0);

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
      // Show backup promo only when launched directly (not from a dApp popup)
      // and only if not previously dismissed (per-account) and no active remote
      const isPopup = !!(
        obj?.connectRequest ||
        obj?.permissionRequest ||
        obj?.groupedPermissionRequest ||
        obj?.counterpartyPermissionRequest ||
        obj?.transactionApprovalRequest
      );
      if (!isPopup) {
        const acct = obj?.accounts?.[obj?.selectedAccount ?? ''];
        const dismissed = !!acct?.settings?.dismissedBackupPromo;
        const hasRemotes = (acct?.storageConfig?.remotes?.length ?? 0) > 0;
        setKeysAlreadyBackedUp(!!acct?.settings?.keysBackedUp);
        setShowBackupPromo(!dismissed && !hasRemotes);
      }
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
    setBalanceLoading(false);
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

  // Check for legacy MNEE balance (old address) once wallet is ready
  useEffect(() => {
    if (!apiContext?.services?.mnee) return;
    (async () => {
      try {
        const { account } = chromeStorageService.getCurrentAccountObject();
        const passKey = await chromeStorageService.getPassKey();
        if (!account?.encryptedKeys || !passKey) return;
        const decrypted = await decrypt(account.encryptedKeys, passKey);
        const keys: Keys = JSON.parse(decrypted);
        if (!keys.walletWif) return;
        const legacyAddr = PrivateKey.fromWif(keys.walletWif).toPublicKey().toAddress();
        // Skip if legacy address matches new receive address (same derivation)
        if (legacyAddr === receiveAddress) return;
        const balance = await getLegacyMneeBalance(apiContext.services!.mnee, legacyAddr);
        setLegacyMneeBalance(balance);
      } catch (err) {
        console.error('[legacyMneeCheck]', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiveAddress, apiContext?.services?.mnee]);

  const handleSweepLegacyMnee = async () => {
    if (!apiContext?.services?.mnee) return;
    setLegacyMneeSweeping(true);
    setLegacyMneeSweepMsg('Starting...');
    try {
      const { account } = chromeStorageService.getCurrentAccountObject();
      const passKey = await chromeStorageService.getPassKey();
      if (!account?.encryptedKeys || !passKey) throw new Error('Keys unavailable');
      const decrypted = await decrypt(account.encryptedKeys, passKey);
      const keys: Keys = JSON.parse(decrypted);
      if (!keys.walletWif) throw new Error('No legacy wallet key');

      // Derive the BRC-29 destination address
      const derivationResult = await deriveDepositAddresses.execute(apiContext, {
        prefix: 'yours',
        startIndex: 0,
        count: 1,
      });
      const destinationAddress = derivationResult.derivations[0]?.address;
      if (!destinationAddress) throw new Error('Could not derive destination address');

      const result = await sweepLegacyMnee({
        mneeClient: apiContext.services.mnee,
        legacyPrivateKey: PrivateKey.fromWif(keys.walletWif),
        destinationAddress,
        onProgress: setLegacyMneeSweepMsg,
      });

      if (result.error) {
        addSnackbar(`Sweep failed: ${result.error}`, 'error');
      } else {
        addSnackbar(`Moved $${result.amount?.toFixed(2)} MNEE to your new wallet!`, 'success');
        setLegacyMneeBalance(0);
        updateMneeBalance();
        setMneeHistoryRefreshKey((k) => k + 1);
      }
    } catch (err) {
      addSnackbar(`Sweep failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setLegacyMneeSweeping(false);
      setShowLegacyMneePrompt(false);
    }
  };

  const refreshUtxos = async (showLoad = false) => {
    showLoad && setIsProcessing(true);
    await getAndSetBsvBalance();
    loadLocks && loadLocks();
    // Note: BRC-100 on-chain sync is driven by the service worker
    // (Monitor + syncAddresses). The UI only needs to re-read current state.
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
    await sleep(25);

    // Validate all recipients
    for (const r of mneeRecipients) {
      if (!r.address || r.amount === null || r.amount === undefined) {
        addSnackbar('All recipients must have an address and amount!', 'info');
        return;
      }
      if (!isValidEmail(r.address) && !validate(r.address)) {
        addSnackbar('All recipients must have a valid BSV or Paymail address!', 'info');
        return;
      }
      if (r.amount <= 0.00001) {
        addSnackbar('Minimum send amount is 0.00001 MNEE per recipient!', 'error');
        return;
      }
    }

    if (mneeTotal > mneeBalance) {
      addSnackbar('Insufficient MNEE balance!', 'error');
      return;
    }

    if (!apiContext) {
      addSnackbar('Wallet not ready.', 'error');
      return;
    }

    // Consolidate duplicate addresses by summing amounts
    const mneeConsolidated = new Map<string, number>();
    const mneeOrder: string[] = [];
    for (const r of mneeRecipients) {
      mneeConsolidated.set(r.address, (mneeConsolidated.get(r.address) ?? 0) + (r.amount as number));
      if (!mneeOrder.includes(r.address)) mneeOrder.push(r.address);
    }
    const lineItems: SendLineItem[] = mneeOrder.map((addr) => ({
      address: addr,
      amount: `$${mneeConsolidated.get(addr)!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })} MNEE`,
    }));

    setSendConfirmation({
      icon: MNEE_ICON_URL,
      lineItems,
      total: `$${mneeTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })} MNEE`,
      onConfirm: async () => {
        setSendConfirmation(null);
        setIsProcessing(true);

        try {
          const derivationResult = await deriveDepositAddresses.execute(apiContext, {
            prefix: 'yours',
            startIndex: 0,
            count: 5,
          });

          addSnackbar('Transaction initiated. Processing...', 'info');

          const res = await sendMnee.execute(apiContext, {
            recipients: mneeRecipients.map((r) => ({ address: r.address, amount: r.amount as number })),
            derivations: derivationResult.derivations,
          });

          if (res.error) {
            addSnackbar(`Transaction failed: ${res.error}`, 'error');
            setIsProcessing(false);
            return;
          }

          resetMneeRecipients();
          setMneeBalance((prev) => Math.max(0, prev - mneeTotal));
          updateMneeBalance().catch((err) => console.error('[handleSendMNEE] reconcile refresh failed:', err));
          setMneeHistoryRefreshKey((k) => k + 1);
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
      },
    });
  };

  const handleSendBsv = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    resetRecipientErrors();
    await sleep(25);

    //? multi-send validate all recipients
    for (const recipient of recipients) {
      if (!isValidEmail(recipient.address) && !validate(recipient.address)) {
        updateRecipient(recipient.id, 'error', 'Provide a valid BSV or Paymail address.');
        addSnackbar('All recipients must have valid BSV or Paymail addresses.', 'info');
        return;
      }

      if (
        (!recipient.satSendAmount || recipient.satSendAmount <= 0) &&
        (!recipient.usdSendAmount || recipient.usdSendAmount <= 0)
      ) {
        updateRecipient(recipient.id, 'error', 'Provide an amount.');
        addSnackbar('All recipients must have an amount.', 'info');
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

    const totalSats = isSendAllBsv
      ? Math.round(bsvBalance * BSV_DECIMAL_CONVERSION)
      : sendRecipients.reduce((acc, r) => acc + (r.satoshis ?? 0), 0);

    // Consolidate duplicate addresses by summing satoshis
    const consolidated = new Map<string, number>();
    const addressOrder: string[] = [];
    for (const r of sendRecipients) {
      const addr = r.address ?? r.paymail ?? '';
      consolidated.set(addr, (consolidated.get(addr) ?? 0) + r.satoshis);
      if (!addressOrder.includes(addr)) addressOrder.push(addr);
    }
    const lineItems: SendLineItem[] = addressOrder.map((addr) => ({
      address: addr,
      amount: `${formatNumberWithCommasAndDecimals(consolidated.get(addr)! / BSV_DECIMAL_CONVERSION, 8)} BSV`,
    }));

    setSendConfirmation({
      icon: bsvCoin,
      lineItems,
      total: `${formatNumberWithCommasAndDecimals(totalSats / BSV_DECIMAL_CONVERSION, 8)} BSV`,
      onConfirm: async () => {
        setSendConfirmation(null);
        setIsProcessing(true);

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

        setBsvBalance((prev) => Math.max(0, prev - totalSats / BSV_DECIMAL_CONVERSION));
        refreshUtxos().catch((err) => console.error('[handleSendBsv] reconcile refresh failed:', err));
        resetSendState();
        setBsvHistoryRefreshKey((k) => k + 1);
        setPageState('main');
        addSnackbar('Transaction Successful!', 'success');
      },
    });
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
    return mneeTotal > 0 ? `Send ${mneeTotal.toFixed(5)} MNEE` : 'Enter Send Details';
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

  /** Fill the given MNEE recipient with (balance - already-assigned - fee). */
  const handleFillMaxMnee = async (id: string) => {
    const assignedElsewhere = mneeRecipients.reduce((acc, r) => (r.id === id ? acc : acc + (r.amount ?? 0)), 0);
    const available = Math.max(0, mneeBalance - assignedElsewhere);

    if (!apiContext?.services?.mnee) {
      updateMneeRecipient(id, 'amount', available);
      return;
    }
    try {
      const config = await apiContext.services.mnee.getConfig();
      const atomicAvailable = MneeClient.toAtomicAmount(available);
      const fee = config.fees.find((f) => atomicAvailable >= f.min && atomicAvailable <= f.max)?.fee || 0;
      updateMneeRecipient(id, 'amount', MneeClient.fromAtomicAmount(Math.max(0, atomicAvailable - fee)));
    } catch {
      updateMneeRecipient(id, 'amount', available);
    }
  };

  const receive = (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="flex flex-col items-center w-full pt-14 pb-20 px-4 overflow-y-auto overflow-x-hidden self-start"
      style={{ height: '100%', backgroundColor: theme.color.global.walletBackground }}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 w-full mb-5">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            setPageState('main');
            getAndSetBsvBalance();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 border-0 outline-none cursor-pointer"
          style={{ background: '#17191E' }}
        >
          <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
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
        <Show when={avatarReady}>
          <motion.div
            variants={{ hidden: { opacity: 0, y: -12 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <motion.img
              whileHover={{ scale: 1.06 }}
              src={avatarUrl}
              className="w-12 h-12 rounded-full object-cover"
              style={{ outline: `2px solid ${theme.color.component.primaryButtonLeftGradient}40` }}
              alt="Profile"
            />
          </motion.div>
        </Show>

        {/* ── USD balance ── */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="flex flex-col items-center mt-1"
        >
          <div className="flex items-center gap-2">
            {balanceLoading ? (
              <Loader2 size={28} className="animate-spin" style={{ color: theme.color.global.gray }} />
            ) : (
              <h1
                title={isSyncing ? 'Syncing…' : 'Balance'}
                className="text-4xl font-bold tracking-tight select-none"
                style={{ color: theme.color.global.contrast, letterSpacing: '-0.02em' }}
              >
                {formatUSD(bsvBalance * exchangeRate + (services.mnee ? mneeBalance : 0))}
              </h1>
            )}
            <AnimatePresence>
              {isSyncing && !balanceLoading && (
                <motion.div
                  key="sync-spinner"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  title="Syncing wallet…"
                  className="flex items-center justify-center"
                >
                  <Loader2 size={18} className="animate-spin" style={{ color: theme.color.global.gray }} />
                </motion.div>
              )}
            </AnimatePresence>
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
            onClick={() => setPageState('asset-picker')}
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
            decimals={8}
            usdBalance={bsvBalance * exchangeRate}
            showPointer={true}
            onClick={() => {
              setSendSource('main');
              setPageState('send');
            }}
          />
          <Show when={services.mnee}>
            <AssetRow
              balance={mneeBalance}
              icon={MNEE_ICON_URL}
              ticker="MNEE USD"
              decimals={5}
              usdBalance={mneeBalance}
              showPointer={mneeBalance > 0 || legacyMneeBalance > 0}
              isMNEE
              onGetMneeClick={() => setPageState('getMNEE')}
              onClick={() => {
                if (legacyMneeBalance > 0) {
                  setShowLegacyMneePrompt(true);
                  return;
                }
                if (mneeBalance > 0) {
                  setSendSource('main');
                  setPageState('sendMNEE');
                }
              }}
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
                onTokenClick={(t: Bsv21Balance) => {
                  setSendSource('main');
                  handleTokenClick(t);
                }}
              />
            )}
          </motion.div>
        </Show>

        {/* ── Quick links (Manage Tokens) ── */}
        <Show when={services.bsv21}>
          <motion.div
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="w-full mt-4 px-4 flex flex-col gap-2"
          >
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
          </motion.div>
        </Show>

        {/* Bottom breathing room */}
        <div className="h-4" />
      </motion.div>
    </MainContent>
  );

  // ── Asset picker (opened by the top-level Send button) ──────────────────────
  const pickableAssets: PickableAsset[] = [
    {
      kind: 'bsv',
      ticker: 'BSV',
      icon: bsvCoin,
      balance: bsvBalance,
      usdBalance: bsvBalance * exchangeRate,
    },
    ...(services.mnee
      ? [
          {
            kind: 'mnee' as const,
            ticker: 'MNEE' as const,
            icon: MNEE_ICON_URL,
            balance: mneeBalance,
            usdBalance: mneeBalance,
          },
        ]
      : []),
    ...(services.bsv21
      ? bsv21s
          .filter((t) => t.all.confirmed > 0n)
          .map(
            (t) =>
              ({
                kind: 'bsv21' as const,
                token: t,
                icon: t.icon
                  ? isUri(t.icon)
                    ? t.icon
                    : `${ONESAT_MAINNET_CONTENT_URL}/${t.icon}`
                  : GENERIC_TOKEN_ICON,
              }) as PickableAsset,
          )
      : []),
  ];

  const handleAssetSelected = (asset: PickableAsset) => {
    setSendSource('asset-picker');
    switch (asset.kind) {
      case 'bsv':
        setPageState('send');
        return;
      case 'mnee':
        if (legacyMneeBalance > 0) {
          setShowLegacyMneePrompt(true);
          return;
        }
        setPageState('sendMNEE');
        return;
      case 'bsv21':
        setPageState('main');
        handleTokenClick(asset.token);
        return;
    }
  };

  const assetPickerView = (
    <AssetPicker assets={pickableAssets} onBack={() => setPageState('main')} onSelect={handleAssetSelected} />
  );

  const sendMNEE = (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="flex flex-col items-center w-full pt-14 pb-20 px-4 overflow-y-auto overflow-x-hidden self-start"
      style={{ height: '100%', backgroundColor: theme.color.global.walletBackground }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 w-full mb-5">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            setPageState(sendSource);
            resetMneeRecipients();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 border-0 outline-none cursor-pointer"
          style={{ background: '#17191E' }}
        >
          <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
        </motion.button>
        <div className="flex items-center gap-2 flex-1">
          <img src={MNEE_ICON_URL} className="w-6 h-6 rounded-full" alt="MNEE" />
          <h2 className="text-base font-bold tracking-tight" style={{ color: theme.color.global.contrast }}>
            Send MNEE
          </h2>
        </div>
      </div>

      {/* Balance chip (display-only; per-recipient MAX is inside each card) */}
      <div
        className="flex items-center gap-2 px-4 py-2 rounded-full mb-5"
        style={{ background: theme.color.global.row }}
      >
        <img src={MNEE_ICON_URL} alt="MNEE" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
        <span className="text-xs" style={{ color: theme.color.global.gray }}>
          Balance
        </span>
        <span className="text-sm font-semibold font-mono" style={{ color: theme.color.global.contrast }}>
          {formatNumberWithCommasAndDecimals(mneeBalance, 5)}
        </span>
        <span className="text-xs font-semibold" style={{ color: theme.color.component.primaryButtonLeftGradient }}>
          MNEE
        </span>
      </div>

      {/* Form */}
      <form noValidate onSubmit={(e) => handleSendMNEE(e)} className="flex flex-col items-center w-full gap-3">
        {/* Recipient cards */}
        <AnimatePresence>
          {mneeRecipients.map((recipient, idx) => (
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
                  {mneeRecipients.length > 1 ? `Recipient ${idx + 1}` : 'Recipient'}
                </span>
                {mneeRecipients.length > 1 && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    onClick={() => removeMneeRecipient(recipient.id)}
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
                placeholder="Enter Address"
                type="text"
                onChange={(e) => updateMneeRecipient(recipient.id, 'address', e.target.value)}
                value={recipient.address}
              />

              {/* Amount input + MAX */}
              <div
                className="flex items-center w-[85%] mx-auto rounded-xl border"
                style={{
                  backgroundColor: theme.color.global.row,
                  borderColor: theme.color.global.gray + '40',
                }}
              >
                <input
                  placeholder="Enter MNEE Amount"
                  type="number"
                  step="0.00001"
                  className="flex-1 bg-transparent h-9 px-4 text-sm outline-none border-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                  style={{
                    color: theme.color.global.contrast,
                    fontFamily: "'Inter', Arial, Helvetica, sans-serif",
                  }}
                  value={recipient.amount !== null && recipient.amount !== undefined ? recipient.amount : ''}
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    updateMneeRecipient(recipient.id, 'amount', inputValue === '' ? null : Number(inputValue));
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
                  onClick={() => handleFillMaxMnee(recipient.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 mr-1.5 rounded-lg border-0 outline-none cursor-pointer shrink-0"
                  style={{ background: `${theme.color.component.primaryButtonLeftGradient}18` }}
                  title="Fill with available MNEE (minus fee)"
                >
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: theme.color.component.primaryButtonLeftGradient }}
                  >
                    MAX
                  </span>
                </motion.button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Add recipient */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={addMneeRecipient}
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

        {/* Send button */}
        <Button
          theme={theme}
          type="primary"
          label={getMneeLabel()}
          disabled={
            isProcessing ||
            mneeTotal <= 0 ||
            mneeRecipients.some((r) => !r.address || r.amount === null || r.amount === undefined || r.amount <= 0)
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

      <CoinHistory
        filter={{ type: 'mnee', addresses: receiveAddress ? [receiveAddress] : [] }}
        refreshKey={mneeHistoryRefreshKey}
      />
    </motion.div>
  );

  const getMnee = (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="flex flex-col items-center w-full pt-14 pb-20 px-4 overflow-y-auto overflow-x-hidden self-start"
      style={{ height: '100%', backgroundColor: theme.color.global.walletBackground }}
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
      className="flex flex-col items-center w-full pt-14 pb-20 px-4 overflow-y-auto overflow-x-hidden self-start"
      style={{ height: '100%', backgroundColor: theme.color.global.walletBackground }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 w-full mb-5">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            setPageState(sendSource);
            resetRecipients();
            resetSendState();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 border-0 outline-none cursor-pointer"
          style={{ background: '#17191E' }}
        >
          <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
        </motion.button>
        <div className="flex items-center gap-2 flex-1">
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
        <img src={bsvCoin} alt="BSV" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
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

      <div className="w-full px-4">
        <CoinHistory filter={{ type: 'bsv' }} refreshKey={bsvHistoryRefreshKey} />
      </div>
    </motion.div>
  );

  if (showWelcome) {
    return <UpgradeNotification onDismiss={handleDismissWelcome} />;
  }

  return (
    <>
      <TopNav />
      {showBackupPromo && (
        <BackupPromo
          theme={theme}
          keysService={keysService}
          keysAlreadyBackedUp={keysAlreadyBackedUp}
          onKeysBackedUp={async () => {
            setKeysAlreadyBackedUp(true);
            const { account } = chromeStorageService.getCurrentAccountObject();
            if (account) {
              await chromeStorageService.updateNested('accounts', {
                [account.addresses.identityAddress]: {
                  ...account,
                  settings: { ...account.settings, keysBackedUp: true },
                },
              });
            }
          }}
          onSetup={() => {
            setShowBackupPromo(false);
            handleSelect('settings', 'storage');
          }}
          onDismiss={async () => {
            setShowBackupPromo(false);
            const { account } = chromeStorageService.getCurrentAccountObject();
            if (account) {
              await chromeStorageService.updateNested('accounts', {
                [account.addresses.identityAddress]: {
                  ...account,
                  settings: { ...account.settings, dismissedBackupPromo: true },
                },
              });
            }
          }}
        />
      )}
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
      <Show when={!!token}>
        {token && (
          <SendBsv21View
            token={token}
            onBack={(sentAtomic) => {
              // Optimistic update: if the exit was triggered by a successful send,
              // immediately decrement our cached token balance for this tokenId.
              // We already know the send succeeded — no need to wait on the
              // overlay service to catch up.
              if (sentAtomic && sentAtomic > 0n && token?.info.id) {
                const tokenId = token.info.id;
                setBsv21s((prev) =>
                  prev.map((t) =>
                    t.id === tokenId
                      ? {
                          ...t,
                          all: {
                            ...t.all,
                            confirmed: t.all.confirmed > sentAtomic ? t.all.confirmed - sentAtomic : 0n,
                          },
                        }
                      : t,
                  ),
                );
              }
              setToken(null);
              setPageState(sendSource);
              // Kick off background reconciliation with the authoritative source —
              // fire-and-forget, doesn't block the UI transition.
              Promise.all([getAndSetAccountAndBsv21s(), getAndSetBsvBalance()]).catch((err) =>
                console.error('[SendBsv21View] reconcile refresh failed:', err),
              );
            }}
          />
        )}
      </Show>
      <Show when={isProcessing && pageState === 'main'}>
        <PageLoader theme={theme} message="Loading wallet..." />
      </Show>
      <Show when={isProcessing && pageState === 'send'}>
        <PageLoader theme={theme} message="Sending BSV..." />
      </Show>
      <Show when={isProcessing && pageState === 'sendMNEE'}>
        <PageLoader theme={theme} message="Sending MNEE..." />
      </Show>
      <Show when={!isProcessing && pageState === 'main' && !token && !manageFavorites}>{main}</Show>
      <Show when={!isProcessing && pageState === 'receive'}>{receive}</Show>
      <Show when={!isProcessing && pageState === 'asset-picker'}>{assetPickerView}</Show>
      <Show when={!isProcessing && pageState === 'send'}>{send}</Show>
      <Show when={!isProcessing && pageState === 'sendMNEE'}>{sendMNEE}</Show>
      <Show when={!isProcessing && pageState === 'getMNEE'}>{getMnee}</Show>
      <SendConfirmation
        show={!!sendConfirmation}
        theme={theme}
        icon={sendConfirmation?.icon}
        lineItems={sendConfirmation?.lineItems ?? []}
        total={sendConfirmation?.total}
        isProcessing={isProcessing}
        onConfirm={() => sendConfirmation?.onConfirm()}
        onCancel={() => setSendConfirmation(null)}
      />

      {/* Legacy MNEE sweep prompt */}
      <AnimatePresence>
        {showLegacyMneePrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-center"
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: theme.color.global.walletBackground,
              zIndex: 100,
            }}
          >
            <Show
              when={legacyMneeSweeping}
              whenFalseContent={
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center text-center px-6 w-full"
                >
                  <img src={MNEE_ICON_URL} alt="MNEE" className="w-12 h-12 rounded-full mb-4" />
                  <h2 className="text-xl font-bold mb-2" style={{ color: theme.color.global.contrast }}>
                    Legacy MNEE Found
                  </h2>
                  <p className="text-sm mb-6 leading-relaxed" style={{ color: theme.color.global.gray }}>
                    You have{' '}
                    <span className="font-semibold" style={{ color: theme.color.global.contrast }}>
                      $
                      {legacyMneeBalance.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 5,
                      })}{' '}
                      MNEE
                    </span>{' '}
                    at your legacy address. Move it to your new wallet?
                  </p>
                  <div className="flex items-center gap-3 w-[87%]">
                    <div className="flex-1">
                      <Button
                        theme={theme}
                        type="secondary-outline"
                        label="Later"
                        onClick={() => {
                          setShowLegacyMneePrompt(false);
                          if (mneeBalance > 0) {
                            setSendSource('main');
                            setPageState('sendMNEE');
                          }
                        }}
                      />
                    </div>
                    <div className="flex-1">
                      <Button theme={theme} type="primary" label="Move MNEE" onClick={handleSweepLegacyMnee} />
                    </div>
                  </div>
                </motion.div>
              }
            >
              <PageLoader theme={theme} message={legacyMneeSweepMsg || 'Moving MNEE...'} />
            </Show>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
