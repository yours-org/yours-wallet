import { validate } from 'bitcoin-address-validation';
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  List,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  Trash2,
  Plus,
  ArrowUpDown,
  Loader2,
  RefreshCw,
  FlaskConical,
  ExternalLink,
  AtSign,
  ArrowLeftRight,
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
import { useHandles, useHandleAvatar } from '../hooks/useHandles';
import { useTheme } from '../hooks/useTheme';
import { BSV_DECIMAL_CONVERSION, GENERIC_TOKEN_ICON } from '../utils/constants';
import { formatUSD, formatBsv } from '../utils/format';
import { sleep } from '../utils/sleep';
import { isUri } from '../utils/uri';
import { AssetRow } from '../components/AssetRow';
import { BackupPromo } from '../components/BackupPromo';
import { TESTNET_COLOR } from '../components/TestnetBadge';
import {
  HOSTED_YOURS_IMAGE,
  TESTNET_FAUCET_URL,
  colorOverlayDefaultOf,
  swapExchangeOriginOf,
} from '../utils/constants';
import lockIcon from '../assets/lock.svg';
import { useLocation, useNavigate } from 'react-router-dom';
import { useServiceContext } from '../hooks/useServiceContext';
import {
  getBsv21Balances,
  getLockData,
  sendAllBsv,
  sendBsv,
  syncAddresses,
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
import { TokensList } from '../components/TokensList';
import { AssetRowSkeleton, Skeleton } from '../components/Skeleton';
import { ManageTokens } from '../components/ManageTokens';
import { Account } from '../services/types/chromeStorage.types';
import { SendBsv21View } from '../components/SendBsv21View';
import { SendOneColorView } from '../components/SendOneColorView';
import { OneColorDetailView } from '../components/OneColorDetailView';
import { SwapView } from '../components/SwapView';
import type { SwapTokenRef } from '../services/swapTypes';
import { onSwapProgress } from '../services/swap';
import { getOneColorBalances, oneColorTicker, type OneColorBalance } from '../services/oneColor';
import { getOneColorPrices, tokensUsdTotal } from '../services/oneColorPrices';
import { walletTokensOf, type WalletToken } from '../services/walletTokens';
import { AssetPicker, type PickableAsset } from '../components/AssetPicker';
import { SendConfirmation, type SendLineItem } from '../components/SendConfirmation';
import { CoinHistory } from '../components/CoinHistory';
import { ONESAT_MAINNET_CONTENT_URL } from '@1sat/actions';

// CopyAddressed feedback state hook — used in receive view

type PageState = 'main' | 'receive' | 'send' | 'asset-picker' | 'swap';
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
  const { updateBalance, isSyncing, syncMessage } = useSyncTracker();
  const urlParams = new URLSearchParams(location.search);
  const { handleSelect, query, showMenu, hideMenu } = useBottomMenu();
  const isReload = urlParams.get('reload') === 'true' || query === 'reload';
  urlParams.delete('reload');
  const [pageState, setPageState] = useState<PageState>('main');
  const [sendSource, setSendSource] = useState<PageState>('main');
  const [satSendAmount, setSatSendAmount] = useState<number | null>(null);
  const { addSnackbar } = useSnackbar();
  const { chromeStorageService, apiContext, keysService } = useServiceContext();
  const { profile: identityProfile } = useIdentity(apiContext, chromeStorageService);
  const { handles, defaultHandle } = useHandles(apiContext.wallet, chromeStorageService);
  const handleAvatar = useHandleAvatar(handles, defaultHandle);
  const avatarUrl = useMemo(() => {
    // The default handle's avatar first, then the BAP identity image; a custom per-account icon only as a fallback.
    if (handleAvatar && apiContext.services) return apiContext.services.ordfs.getContentUrl(handleAvatar);
    if (identityProfile.image && apiContext.services) return resolveImageUrl(identityProfile.image, apiContext);
    const icon = chromeStorageService.getCurrentAccountObject().account?.icon;
    return icon && icon !== HOSTED_YOURS_IMAGE ? icon : '';
  }, [handleAvatar, identityProfile.image, apiContext, chromeStorageService]);
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
  const [copiedHandle, setCopiedHandle] = useState(false);
  const [depositAddresses, setDepositAddresses] = useState<
    { address: string; index: number; derivationPrefix: string; derivationSuffix: string }[]
  >([]);
  const [selectedAddressIndex, setSelectedAddressIndex] = useState(0);
  const [generatingAddress, setGeneratingAddress] = useState(false);
  const [bsvBalance, setBsvBalance] = useState<number>(0);
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [lockData, setLockData] = useState<LockData>();
  const [isSendAllBsv, setIsSendAllBsv] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showBackupPromo, setShowBackupPromo] = useState(false);
  const [keysAlreadyBackedUp, setKeysAlreadyBackedUp] = useState(false);
  const [showMigrationBanner, setShowMigrationBanner] = useState(false);
  const [bsv21s, setBsv21s] = useState<Bsv21Balance[]>([]);
  // 1Color (BRC-162) tokens the color module holds; a selected one opens the send view.
  const [oneColors, setOneColors] = useState<OneColorBalance[]>([]);
  /** BSV per whole token by asset id, from the asset's exchange; a token with no pool is absent. */
  const [oneColorPrices, setOneColorPrices] = useState<Map<string, number>>(new Map());
  // The headline figure waits for every part of it to answer once (or fail),
  // so it does not show BSV alone and then jump when the token values arrive.
  const [oneColorsReady, setOneColorsReady] = useState(false);
  const [oneColorToken, setOneColorToken] = useState<OneColorBalance | null>(null);
  /** The 1Color token whose detail page is open (tapping its row on Coins). Send, Receive and Buy start from it. */
  const [oneColorDetail, setOneColorDetail] = useState<OneColorBalance | null>(null);
  /** Bumped when a send or swap finished, so the detail page's history reloads. */
  const [detailRefreshKey, setDetailRefreshKey] = useState('');
  /** The token the swap page opens with (a detail page's Buy); undefined from the Coins page Swap button. */
  const [swapToken, setSwapToken] = useState<(SwapTokenRef & { icon?: string }) | undefined>(undefined);
  /** Receive opened from a 1Color token's detail page: the page says how that token arrives. */
  const [receiveContext, setReceiveContext] = useState<OneColorBalance | null>(null);
  const [manageFavorites, setManageFavorites] = useState(false);
  const [account, setAccount] = useState<Account>();
  const [token, setToken] = useState<{ isConfirmed: boolean; info: Bsv21Balance } | null>(null);
  const isTestnet = apiContext.chain === 'test';
  /** Swaps need an exchange on this chain (none on mainnet yet). */
  const swapAvailable = !!swapExchangeOriginOf(apiContext.chain);
  /** The swap flow takes the whole popup: no top nav, no bottom menu, so its steps have room. */
  const fullScreen = pageState === 'swap';

  // A swap runs in the background and can finish after its screen was left:
  // refresh balances and the token page's history whenever one does.
  useEffect(() => {
    const seen = new Set<string>();
    return onSwapProgress((job) => {
      if ((job.phase !== 'done' && job.phase !== 'failed') || seen.has(job.id)) return;
      seen.add(job.id);
      setDetailRefreshKey(`swap-${job.id}`);
      Promise.all([getAndSetOneColors(), getAndSetBsvBalance()]).catch((err) =>
        console.error('[BsvWallet] balance refresh after swap failed:', err),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (fullScreen) hideMenu();
    else showMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullScreen]);
  const services = theme.settings.services;
  const balanceReady = !balanceLoading && oneColorsReady;
  // 1Color tokens are the wallet's own, so a held one shows even where the theme leaves BSV21 off.
  const tokensEnabled = services.bsv21 || oneColors.length > 0;
  const [filteredTokens, setFilteredTokens] = useState<WalletToken[]>([]);
  const [randomKey, setRandomKey] = useState(Math.random());
  // Bump to force a refresh of the per-coin CoinHistory list (e.g. after a successful send)
  const [bsvHistoryRefreshKey, setBsvHistoryRefreshKey] = useState(0);
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

  const BALANCE_READY_CAP_MS = 8_000;

  const resetRecipientErrors = () => {
    setRecipients((prev) => [...prev.map((r) => ({ ...r, error: undefined }))]);
  };

  const getAndSetAccountAndBsv21s = async (): Promise<Bsv21Balance[]> => {
    const res = await getBsv21Balances.execute(apiContext, {});
    setBsv21s(res);
    setAccount(chromeStorageService.getCurrentAccountObject().account);
    return res;
  };

  /** A 1Color asset's exchange: the account's overlay override, else the chain default (none on mainnet). */
  const resolveOneColorOrigin = async (assetId: string): Promise<string | undefined> => {
    const { selectedAccount } = chromeStorageService.getCurrentAccountObject();
    const overrides = selectedAccount ? await chromeStorageService.getColorOverlayOverrides(selectedAccount) : [];
    return overrides.find((o) => o.assetId === assetId)?.origin ?? colorOverlayDefaultOf(apiContext.chain);
  };

  /**
   * 1Color balances from the wallet's own storage, then their prices from
   * each asset's exchange. A failure keeps the last list and never blocks the
   * others; an exchange that is down leaves its tokens unpriced.
   */
  const getAndSetOneColors = async (): Promise<void> => {
    try {
      const balances = await getOneColorBalances(apiContext);
      setOneColors(balances);
      setOneColorPrices(await getOneColorPrices(balances, resolveOneColorOrigin));
    } catch (err) {
      console.error('[BsvWallet] 1Color balances failed:', err);
    } finally {
      setOneColorsReady(true);
    }
  };

  /** Order-independent fingerprint of token balances, for change detection. */
  const bsv21Signature = (tokens: Bsv21Balance[]) =>
    tokens
      .map((t) => `${t.id}:${t.amt}`)
      .sort()
      .join('|');

  // Every fungible token held, both kinds, as the favourites list and Manage Tokens see them.
  const walletTokens = useMemo(() => walletTokensOf(bsv21s, oneColors), [bsv21s, oneColors]);

  useEffect(() => {
    if (!account) return;
    const favorites = account.settings?.favoriteTokens ?? [];
    setFilteredTokens(walletTokens.filter((t) => favorites.includes(t.id)));
  }, [walletTokens, account]);

  useEffect(() => {
    (async () => {
      const obj = await chromeStorageService.getAndSetStorage();
      setShowWelcome(!!obj?.showWelcome);
      // Show backup promo only if not previously dismissed (per-account)
      // and no active remote. dApp prompts live in a separate prompt window,
      // so this page is always the browser-action popup.
      const acct = obj?.accounts?.[obj?.selectedAccount ?? ''];
      const dismissed = !!acct?.settings?.dismissedBackupPromo;
      const hasRemotes = (acct?.storageConfig?.remotes?.length ?? 0) > 0;
      setKeysAlreadyBackedUp(!!acct?.settings?.keysBackedUp);
      setShowBackupPromo(!dismissed && !hasRemotes);
      setShowMigrationBanner(!acct?.settings?.sweepStarted && !acct?.settings?.sweepCompleted);
      if (obj?.selectedAccount) {
        await getAndSetAccountAndBsv21s();
        void getAndSetOneColors();
      } else {
        setOneColorsReady(true);
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

  const getAndSetBsvBalance = async (): Promise<number> => {
    const satoshis = await getWalletBalance();
    setBsvBalance(satoshis / 100_000_000);
    const rate = await fetchExchangeRate(apiContext.chain, apiContext.wocApiKey);
    setExchangeRate(rate);
    setBalanceLoading(false);
    return satoshis;
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

  // Whatever is still outstanding after this long, show the figure with what we have.
  useEffect(() => {
    const cap = setTimeout(() => {
      setOneColorsReady(true);
    }, BALANCE_READY_CAP_MS);
    return () => clearTimeout(cap);
  }, []);

  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Re-sync addresses, then reload BSV, BSV-21, and 1Color balances.
   * With `notifyIfUnchanged`, tell the user when nothing moved so a manual refresh
   * that finds no new funds does not look like it silently failed.
   */
  const refreshUtxos = async ({ showLoad = false, notifyIfUnchanged = false } = {}) => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    showLoad && setIsProcessing(true);
    // Snapshot before: BSV in satoshis (not USD, so a rate tick is not "a change").
    const before = {
      sats: Math.round(bsvBalance * 100_000_000),
      tokens: bsv21Signature(bsv21s),
    };
    let synced = true;
    try {
      const { account: acct } = chromeStorageService.getCurrentAccountObject();
      const count = (acct?.settings?.maxKeyIndex ?? 4) + 1;
      if (apiContext) {
        await syncAddresses.execute(apiContext, { count });
      }
    } catch (err) {
      synced = false;
      console.error('[refreshUtxos] syncAddresses failed:', err);
    }
    try {
      const [sats, tokens] = await Promise.all([
        getAndSetBsvBalance(),
        getAndSetAccountAndBsv21s(),
        getAndSetOneColors(),
      ]);
      loadLocks && loadLocks();
      const unchanged = sats === before.sats && bsv21Signature(tokens) === before.tokens;
      if (notifyIfUnchanged && synced && unchanged) {
        addSnackbar('Balances are up to date. Incoming transactions can take one confirmation to appear.', 'info');
      }
    } finally {
      showLoad && setIsProcessing(false);
      setIsRefreshing(false);
    }
  };

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

  /** The handle as people type and share it: without the leading '@' the wallet stores. */
  const handleDisplay = defaultHandle ? defaultHandle.replace(/^@/, '') : '';

  const handleCopyHandle = () => {
    if (!defaultHandle) return;
    navigator.clipboard.writeText(handleDisplay).then(() => {
      addSnackbar('Copied!', 'success');
      setCopiedHandle(true);
      setTimeout(() => setCopiedHandle(false), 2000);
    });
  };

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address).then(() => {
      addSnackbar('Copied!', 'success');
    });
  };

  const setPrimaryAddress = (address: string) => {
    const { account, selectedAccount } = chromeStorageService.getCurrentAccountObject();
    if (account && selectedAccount) {
      chromeStorageService.updateNested('accounts', {
        [selectedAccount]: { primaryAddress: address } as unknown as Account,
      });
    }
  };

  const fetchDepositAddresses = async () => {
    try {
      const response = await sendMessageAsync<{
        success: boolean;
        data?: { address: string; index: number; derivationPrefix: string; derivationSuffix: string }[];
      }>({
        action: 'GET_DEPOSIT_ADDRESSES',
      });
      if (response?.success && response.data) {
        setDepositAddresses(response.data);
      }
    } catch (error) {
      console.error('Failed to get deposit addresses:', error);
    }
  };

  const handleGenerateAddress = async () => {
    setGeneratingAddress(true);
    try {
      const response = await sendMessageAsync<{
        success: boolean;
        data?: { address: string; index: number; derivationPrefix: string; derivationSuffix: string };
      }>({
        action: 'GENERATE_NEW_ADDRESS',
      });
      if (response?.success && response.data) {
        setDepositAddresses((prev) => [...prev, response.data!]);
        setSelectedAddressIndex(response.data.index);
        setReceiveAddress(response.data.address);
        setPrimaryAddress(response.data.address);
        addSnackbar('New address generated!', 'success');
      }
    } catch (error) {
      console.error('Failed to generate address:', error);
      addSnackbar('Failed to generate address', 'error');
    } finally {
      setGeneratingAddress(false);
    }
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
      amount: `${formatBsv(consolidated.get(addr)! / BSV_DECIMAL_CONVERSION)} BSV`,
    }));

    setSendConfirmation({
      icon: bsvCoin,
      lineItems,
      total: `${formatBsv(totalSats / BSV_DECIMAL_CONVERSION)} BSV`,
      onConfirm: async () => {
        setSendConfirmation(null);
        setIsProcessing(true);

        let sendRes;
        if (isSendAllBsv) {
          const r = sendRecipients[0];
          const destination = r.address ?? r.paymail ?? '';
          sendRes = await sendAllBsv.execute(apiContext, {
            destination,
          });
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
    const maxSats = Math.round(bsvBalance * BSV_DECIMAL_CONVERSION);
    setSatSendAmount(maxSats);
    // MAX is single-recipient only. Preserve the existing recipient's id and
    // address/paymail so we don't wipe the user's input or remount the card.
    setRecipients((prev) => [
      {
        ...(prev[0] ?? {}),
        satSendAmount: maxSats,
        usdSendAmount: null,
        amountType: 'bsv',
        error: undefined,
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

  const handleDismissWelcome = async () => {
    await chromeStorageService.update({ showWelcome: false });
    setShowWelcome(false);
  };

  const handleMigrationBannerClick = async () => {
    setShowMigrationBanner(false);
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (account) {
      await chromeStorageService.updateNested('accounts', {
        [account.addresses.identityAddress]: {
          ...account,
          settings: { ...account.settings, sweepStarted: true },
        },
      });
    }
    navigate('/sweep');
  };

  const handleTokenClick = (t: WalletToken) => {
    if (t.pending > 0n && t.confirmed === 0n && t.kind !== '1color') {
      addSnackbar('Pending tokens cannot be sent!', 'error', 2000);
      return;
    }
    if (t.kind === '1color' && t.oneColor) {
      setOneColorDetail(t.oneColor);
      return;
    }
    if (t.bsv21) setToken({ isConfirmed: true, info: t.bsv21 });
  };

  // Fetch deposit addresses when entering receive view and sync selected index to primaryAddress
  useEffect(() => {
    if (pageState === 'receive') {
      fetchDepositAddresses().then(() => {
        // Honor the persisted primaryAddress instead of defaulting to index 0
        const { account: acct } = chromeStorageService.getCurrentAccountObject();
        const primary = acct?.primaryAddress;
        if (primary) {
          setDepositAddresses((prev) => {
            const match = prev.find((d) => d.address === primary);
            if (match) {
              setSelectedAddressIndex(match.index);
              setReceiveAddress(match.address);
            }
            return prev;
          });
        }
      });
    }
  }, [pageState]);

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
            // Opened from a token's detail page: back lands on that page, which stays mounted under `main`.
            setReceiveContext(null);
            setPageState('main');
            getAndSetBsvBalance();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 border-0 outline-none cursor-pointer"
          style={{ background: '#17191E' }}
        >
          <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
        </motion.button>
        {receiveContext && (
          <img
            src={receiveContext.icon || GENERIC_TOKEN_ICON}
            alt=""
            className="w-6 h-6 rounded-full object-cover flex-shrink-0"
          />
        )}
        <h2 className="text-base font-bold tracking-tight flex-1" style={{ color: theme.color.global.contrast }}>
          {receiveContext ? `Receive ${oneColorTicker(receiveContext)}` : 'Receive Assets'}
        </h2>
      </div>

      {/* A 1Color token arrives through the handle, not an address: say so before the QR. */}
      {receiveContext && (
        <p className="text-xs text-center mb-4 max-w-[18rem]" style={{ color: theme.color.global.gray }}>
          {defaultHandle ? (
            <>Share your handle to receive {oneColorTicker(receiveContext)}.</>
          ) : (
            <>
              {oneColorTicker(receiveContext)} arrives through a handle. Register one in Settings &gt; Identity to
              receive it.
            </>
          )}
        </p>
      )}

      {/* QR code: the handle for a 1Color token, else the address */}
      {receiveContext ? (
        defaultHandle ? (
          <QrCode address={handleDisplay} onClick={handleCopyHandle} />
        ) : null
      ) : (
        <QrCode address={receiveAddress} onClick={handleCopyToClipboard} />
      )}

      {/* Address copy row (not for a 1Color token: it arrives through the handle) */}
      {!receiveContext && (
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
      )}

      {/* BRC-169 handle: the default "from" handle, receivable at its messagebox */}
      {defaultHandle && (
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleCopyHandle}
          className="flex items-center gap-2 mt-2 px-4 py-3 rounded-xl w-full border-0 outline-none cursor-pointer text-left"
          style={{ background: theme.color.global.row }}
        >
          {copiedHandle ? (
            <Check size={16} style={{ color: theme.color.component.primaryButtonLeftGradient }} />
          ) : (
            <AtSign size={16} style={{ color: theme.color.global.gray }} />
          )}
          <span className="text-xs font-mono truncate flex-1" style={{ color: theme.color.global.contrast }}>
            {handleDisplay}
          </span>
          <span className="text-xs shrink-0" style={{ color: theme.color.global.gray }}>
            {copiedHandle ? 'Copied!' : 'Copy'}
          </span>
        </motion.button>
      )}
      {defaultHandle && (
        <p className="text-[10px] text-center mt-2 max-w-[16rem]" style={{ color: theme.color.global.gray }}>
          Wallets that support handles can pay this handle directly.
        </p>
      )}

      {/* Info text */}
      {!receiveContext && (
        <p className="text-xs text-center mt-4 mb-2 max-w-[16rem]" style={{ color: theme.color.global.gray }}>
          You may safely send{' '}
          <span className="font-semibold" style={{ color: theme.color.component.primaryButtonLeftGradient }}>
            BSV and 1Sat NFTs
          </span>{' '}
          to these addresses.
        </p>
      )}

      {/* Deposit Addresses */}
      {!receiveContext && depositAddresses.length > 0 && (
        <div className="w-full mt-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold" style={{ color: theme.color.global.contrast }}>
              My Deposit Addresses
            </h3>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleGenerateAddress}
              disabled={generatingAddress}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[0.65rem] font-semibold border-0 outline-none cursor-pointer"
              style={{
                background: 'rgba(161,255,139,0.12)',
                color: '#A1FF8B',
                opacity: generatingAddress ? 0.5 : 1,
              }}
            >
              {generatingAddress ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
              New Address
            </motion.button>
          </div>

          <div className="flex flex-col gap-1.5">
            {depositAddresses.map((d) => {
              const isSelected = d.index === selectedAddressIndex;
              return (
                <motion.button
                  key={d.index}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setSelectedAddressIndex(d.index);
                    setReceiveAddress(d.address);
                    setPrimaryAddress(d.address);
                  }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg w-full border-0 outline-none cursor-pointer text-left"
                  style={{
                    background: isSelected ? 'rgba(161,255,139,0.08)' : theme.color.global.row,
                    border: isSelected ? '1px solid rgba(161,255,139,0.25)' : '1px solid transparent',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.65rem] font-mono truncate" style={{ color: theme.color.global.contrast }}>
                      {d.address}
                    </p>
                    <p className="text-[0.55rem] mt-0.5" style={{ color: theme.color.global.gray }}>
                      {d.derivationPrefix} {d.derivationSuffix}
                    </p>
                  </div>
                  <motion.div
                    whileTap={{ scale: 0.85 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      copyAddress(d.address);
                    }}
                    className="flex-shrink-0 p-1 rounded"
                    style={{ color: theme.color.global.gray }}
                  >
                    <Copy size={12} />
                  </motion.div>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}
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
        {/* ── Testnet banner + faucet ── */}
        {isTestnet && (
          <motion.div
            variants={{ hidden: { opacity: 0, y: -8 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="flex items-center justify-between gap-2 w-[92%] mb-4 px-4 py-2.5 rounded-xl"
            style={{
              background: 'rgba(253,176,34,0.08)',
              border: '1px solid rgba(253,176,34,0.2)',
            }}
          >
            <span className="flex items-center gap-2 text-xs leading-snug min-w-0" style={{ color: TESTNET_COLOR }}>
              <FlaskConical size={14} className="shrink-0" />
              <span>
                <span style={{ fontWeight: 600 }}>Testnet account.</span> Coins have no real value.
              </span>
            </span>
            <button
              type="button"
              onClick={() => window.open(TESTNET_FAUCET_URL, '_blank')}
              className="flex items-center gap-1 shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold border-0 outline-none cursor-pointer"
              style={{ background: 'rgba(253,176,34,0.18)', color: TESTNET_COLOR }}
            >
              Get coins
              <ExternalLink size={11} />
            </button>
          </motion.div>
        )}

        {/* ── Legacy migration banner ── */}
        <AnimatePresence>
          {showMigrationBanner && !isTestnet && (
            <motion.button
              key="migration-banner"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              type="button"
              onClick={handleMigrationBannerClick}
              className="flex items-center justify-between gap-2 w-[92%] mb-4 px-4 py-2.5 rounded-xl border-0 outline-none cursor-pointer text-left"
              style={{
                background: 'rgba(253,176,34,0.08)',
                border: '1px solid rgba(253,176,34,0.2)',
              }}
            >
              <span className="text-xs leading-snug" style={{ color: '#FDB022' }}>
                <span style={{ fontWeight: 600 }}>Don't see your assets?</span> Open the migration tool.
              </span>
              <ArrowRight size={14} style={{ color: '#FDB022' }} className="shrink-0" />
            </motion.button>
          )}
        </AnimatePresence>

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
            {!balanceReady ? (
              <Skeleton className="h-9 w-40 rounded-lg" />
            ) : (
              <h1
                title={isSyncing ? 'Syncing…' : 'Balance'}
                className="text-4xl font-bold tracking-tight select-none"
                style={{ color: theme.color.global.contrast, letterSpacing: '-0.02em' }}
              >
                {formatUSD(bsvBalance * exchangeRate + tokensUsdTotal(walletTokens, oneColorPrices, exchangeRate))}
              </h1>
            )}
            <AnimatePresence>
              {isSyncing && balanceReady && (
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
            {!isSyncing && balanceReady && (
              <motion.button
                whileHover={{ opacity: 1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => refreshUtxos({ notifyIfUnchanged: true })}
                disabled={isRefreshing}
                title="Refresh balances"
                className="flex items-center justify-center border-0 outline-none bg-transparent p-1 cursor-pointer"
                style={{ color: theme.color.global.gray, opacity: 0.55 }}
              >
                <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              </motion.button>
            )}
          </div>
          <AnimatePresence>
            {isSyncing && syncMessage && (
              <motion.p
                key="sync-message"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="text-xs mt-1 select-none"
                style={{ color: theme.color.global.gray }}
              >
                {syncMessage}
              </motion.p>
            )}
          </AnimatePresence>
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
          {swapAvailable && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              onClick={() => {
                setSwapToken(undefined);
                setPageState('swap');
              }}
              className="flex flex-1 items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm border-0 outline-none cursor-pointer"
              style={{
                background: `linear-gradient(135deg, ${theme.color.component.primaryButtonLeftGradient}, ${theme.color.component.primaryButtonRightGradient})`,
                color: theme.color.component.primaryButtonText,
              }}
            >
              <ArrowLeftRight size={16} strokeWidth={2.5} />
              Swap
            </motion.button>
          )}
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

        {/* ── Favorite tokens (BSV21 and 1Color) ── */}
        <Show when={tokensEnabled}>
          <motion.div
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="w-full"
          >
            {!oneColorsReady && filteredTokens.length === 0 && (
              <div className="w-full px-4 flex flex-col gap-2">
                <AssetRowSkeleton />
                <AssetRowSkeleton />
              </div>
            )}
            {filteredTokens.length > 0 && (
              <TokensList
                key={randomKey}
                tokens={filteredTokens}
                prices={oneColorPrices}
                bsvUsdRate={exchangeRate}
                theme={theme}
                onTokenClick={(t) => {
                  setSendSource('main');
                  handleTokenClick(t);
                }}
              />
            )}
          </motion.div>
        </Show>

        {/* ── Quick links (Manage Tokens) ── */}
        <Show when={tokensEnabled}>
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
    ...oneColors
      .filter((t) => t.available > 0n)
      .map((t) => ({ kind: '1color' as const, token: t, icon: t.icon || GENERIC_TOKEN_ICON }) as PickableAsset),
  ];

  const handleAssetSelected = (asset: PickableAsset) => {
    setSendSource('asset-picker');
    switch (asset.kind) {
      case 'bsv':
        setPageState('send');
        return;
      case 'bsv21':
        setPageState('main');
        setToken({ isConfirmed: true, info: asset.token });
        return;
      case '1color':
        setPageState('main');
        setOneColorToken(asset.token);
        return;
    }
  };

  const assetPickerView = (
    <AssetPicker assets={pickableAssets} onBack={() => setPageState('main')} onSelect={handleAssetSelected} />
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

      {/* Balance chip — MAX is single-recipient only */}
      {recipients.length > 1 ? (
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full mb-5"
          style={{ background: theme.color.global.row }}
        >
          <img src={bsvCoin} alt="BSV" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
          <span className="text-xs" style={{ color: theme.color.global.gray }}>
            Balance
          </span>
          <span className="text-sm font-semibold font-mono" style={{ color: theme.color.global.contrast }}>
            {formatBsv(bsvBalance)}
          </span>
          <span className="text-xs font-semibold" style={{ color: theme.color.component.primaryButtonLeftGradient }}>
            BSV
          </span>
        </div>
      ) : (
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
            {formatBsv(bsvBalance)}
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
      )}

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
      {!fullScreen && <TopNav />}
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
            // Favorites are already saved; show them now rather than after the balance fetch.
            setAccount(chromeStorageService.getCurrentAccountObject().account);
            getAndSetAccountAndBsv21s();
            void getAndSetOneColors();
            setRandomKey(Math.random());
          }}
          tokens={walletTokens}
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
      <Show when={!!oneColorToken}>
        {oneColorToken && (
          <SendOneColorView
            token={oneColorToken}
            onBack={(sentAtomic) => {
              // Optimistic: the handoff spent the inputs, so the available balance drops at once.
              if (sentAtomic && sentAtomic > 0n) {
                const { assetId } = oneColorToken;
                setOneColors((prev) =>
                  prev.map((t) =>
                    t.assetId === assetId
                      ? { ...t, available: t.available > sentAtomic ? t.available - sentAtomic : 0n }
                      : t,
                  ),
                );
              }
              setOneColorToken(null);
              setPageState(sendSource);
              if (sentAtomic && sentAtomic > 0n) setDetailRefreshKey(`send-${Date.now()}`);
              Promise.all([getAndSetOneColors(), getAndSetBsvBalance()]).catch((err) =>
                console.error(`[SendOneColorView ${oneColorTicker(oneColorToken)}] reconcile refresh failed:`, err),
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
      <Show
        when={!isProcessing && pageState === 'main' && !token && !oneColorToken && !oneColorDetail && !manageFavorites}
      >
        {main}
      </Show>
      <Show when={!isProcessing && pageState === 'main' && !!oneColorDetail && !oneColorToken && !manageFavorites}>
        {oneColorDetail && (
          <OneColorDetailView
            token={oneColors.find((t) => t.assetId === oneColorDetail.assetId) ?? oneColorDetail}
            priceBsv={oneColorPrices.get(oneColorDetail.assetId)}
            bsvUsdRate={exchangeRate}
            chain={apiContext.chain}
            refreshKey={detailRefreshKey}
            onBack={() => setOneColorDetail(null)}
            onReceive={() => {
              setReceiveContext(oneColorDetail);
              setPageState('receive');
            }}
            onSend={() => {
              if (oneColorDetail.available === 0n) {
                addSnackbar('Nothing spendable yet: the balance is pending.', 'info', 2500);
                return;
              }
              setSendSource('main');
              setOneColorToken(oneColorDetail);
            }}
            onBuy={() => {
              setSwapToken({
                tokenId: oneColorDetail.assetId,
                sym: oneColorTicker(oneColorDetail),
                dec: oneColorDetail.dec,
                icon: oneColorDetail.icon,
              });
              setPageState('swap');
            }}
          />
        )}
      </Show>
      <Show when={!isProcessing && pageState === 'swap'}>
        <SwapView
          token={swapToken}
          initialSide="buy"
          bsvBalanceSats={BigInt(Math.round(bsvBalance * 1e8))}
          bsvUsdRate={exchangeRate}
          heldTokens={oneColors}
          onBack={() => setPageState('main')}
          onFinished={() => {
            setDetailRefreshKey(`swap-${Date.now()}`);
            Promise.all([getAndSetOneColors(), getAndSetBsvBalance()]).catch((err) =>
              console.error('[SwapView] balance refresh failed:', err),
            );
          }}
        />
      </Show>
      <Show when={!isProcessing && pageState === 'receive'}>{receive}</Show>
      <Show when={!isProcessing && pageState === 'asset-picker'}>{assetPickerView}</Show>
      <Show when={!isProcessing && pageState === 'send'}>{send}</Show>
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
    </>
  );
};
