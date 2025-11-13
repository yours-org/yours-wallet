import { validate } from 'bitcoin-address-validation';
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import bsvCoin from '../assets/bsv-coin.svg';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { PageLoader } from '../components/PageLoader';
import { QrCode } from '../components/QrCode';
import {
  ButtonContainer,
  ConfirmContent,
  FormContainer,
  HeaderText,
  MainContent,
  ReceiveContent,
  Text,
  Warning,
} from '../components/Reusable';
import { Show } from '../components/Show';
import { TopNav } from '../components/TopNav';
import { useBottomMenu } from '../hooks/useBottomMenu';
import { useSnackbar } from '../hooks/useSnackbar';
import { useSocialProfile } from '../hooks/useSocialProfile';
import { useTheme } from '../hooks/useTheme';
import { WhiteLabelTheme } from '../theme.types';
import {
  BSV_DECIMAL_CONVERSION,
  HOSTED_YOURS_IMAGE,
  MNEE_ICON_URL,
  MNEE_MOBILE_REFERRAL_LINK,
} from '../utils/constants';
import { formatNumberWithCommasAndDecimals, formatUSD } from '../utils/format';
import { sleep } from '../utils/sleep';
import copyIcon from '../assets/copy.svg';
import { AssetRow } from '../components/AssetRow';
import lockIcon from '../assets/lock.svg';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWeb3RequestContext } from '../hooks/useWeb3RequestContext';
import { useServiceContext } from '../hooks/useServiceContext';
import { LockData } from '../services/types/bsv.types';
import { sendMessage } from '../utils/chromeHelpers';
import { YoursEventName } from '../inject';
import { InWalletBsvResponse } from '../services/types/bsv.types';
import { useQueueTracker } from '../hooks/useQueueTracker';
import { getErrorMessage, isValidEmail } from '../utils/tools';
import { UpgradeNotification } from '../components/UpgradeNotification';
import { Bsv20 } from 'yours-wallet-provider';
import { Bsv20TokensList } from '../components/Bsv20TokensList';
import { FaListAlt, FaTrash, FaExternalLinkAlt } from 'react-icons/fa';
import { FaArrowRightArrowLeft } from 'react-icons/fa6';
import { FaHistory } from 'react-icons/fa';
import { ManageTokens } from '../components/ManageTokens';
import { Account, ChromeStorageObject } from '../services/types/chromeStorage.types';
import { SendBsv20View } from '../components/SendBsv20View';
import { FaucetButton } from '../components/FaucetButton';
import { TxHistory } from '../components/TxHistory';
import { MNEEFee } from '@mnee/ts-sdk';

const MiddleContainer = styled.div<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  width: 100%;
  padding: 3.5rem 1rem 2.75rem 1rem;
`;

const ProfileImage = styled.img`
  width: 3.5rem;
  height: 3.5rem;
  margin: 0;
  border-radius: 100%;
  transition: transform 0.3s ease;

  &:hover {
    transform: scale(1.05);
  }
`;

const BalanceContainer = styled.div`
  display: flex;
  align-items: center;
`;

const Icon = styled.img<{ size?: string }>`
  width: ${(props) => props.size ?? '1.5rem'};
  height: ${(props) => props.size ?? '1.5rem'};
  margin: 0 0.5rem 0 0;
`;

const CopyAddressWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin: 2rem 0;
`;

const StyledCopy = styled.img`
  width: 1rem;
  height: 1rem;
  margin-right: 0.25rem;
`;

const ManageTokenListWrapper = styled.div`
  display: flex;
  align-items: center;
  margin-top: 1rem;
  cursor: pointer;
`;

const RecipientRow = styled.div<WhiteLabelTheme>`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 1rem;
  border-top: 1px solid ${({ theme }) => theme.color.global.gray + 80};
  border-radius: 0.5rem;
`;

const RecipientInputs = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const InputWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  position: relative;
  width: 100%;
`;

const SwapAndBridgeButtonContainer = styled.div`
  display: flex;
  justify-content: center;
  width: 100%;
`;

const SwapAndBridgeButton = styled.button<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 87%;
  height: 2.25rem;
  background: linear-gradient(45deg, #ff9500, #ffb800);
  color: #000000;
  border: none;
  border-radius: 0.25rem;
  font-family: 'Inter', Arial, Helvetica, sans-serif;
  font-size: 0.85rem;
  font-weight: 700;
  margin: 0.5rem;
  cursor: pointer;
  transition: 0.3s ease-in-out;
  transform: scale(1);

  &:hover {
    transform: scale(1.02);
  }
`;

const ScrollableConfirmContent = styled(ConfirmContent)`
  max-height: calc(100vh - 150px);
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
`;

const UnitSwitcher = styled.div<WhiteLabelTheme>`
  color: ${({ theme }) => theme.color.global.gray};
  position: absolute;
  display: flex;
  align-items: center;
  right: 2.25rem;
  top: 50%;
  transform: translateY(-50%);
  cursor: pointer;
`;

const GetMneeContainer = styled(ReceiveContent)<WhiteLabelTheme>`
  height: 100%;
  background-color: ${({ theme }) => theme.color.global.walletBackground};
  z-index: 9999;
`;

type PageState = 'main' | 'receive' | 'send' | 'sendMNEE' | 'getMNEE';
type AmountType = 'bsv' | 'usd';

export type BsvWalletProps = {
  isOrdRequest: boolean;
};

export type Recipient = {
  id: string;
  address: string;
  satSendAmount: number | null;
  usdSendAmount: number | null;
  amountType: AmountType;
  error?: string;
};

export const BsvWallet = (props: BsvWalletProps) => {
  const { isOrdRequest } = props;
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { updateBalance, isSyncing } = useQueueTracker();
  const urlParams = new URLSearchParams(location.search);
  const { handleSelect, query } = useBottomMenu();
  const isReload = urlParams.get('reload') === 'true' || query === 'reload';
  urlParams.delete('reload');
  const [pageState, setPageState] = useState<PageState>('main');
  const [satSendAmount, setSatSendAmount] = useState<number | null>(null);
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const { addSnackbar } = useSnackbar();
  const { chromeStorageService, keysService, bsvService, ordinalService, oneSatSPV, mneeService } = useServiceContext();
  const { socialProfile } = useSocialProfile(chromeStorageService);
  const [unlockAttempted, setUnlockAttempted] = useState(false);
  const { connectRequest } = useWeb3RequestContext();
  const isPasswordRequired = chromeStorageService.isPasswordRequired();
  const [isProcessing, setIsProcessing] = useState(false);
  const { bsvAddress, identityAddress } = keysService;
  const { getBsvBalance, getExchangeRate, getLockData, unlockLockedCoins, updateBsvBalance, sendBsv, sendAllBsv } =
    bsvService;
  const [bsvBalance, setBsvBalance] = useState<number>(getBsvBalance());
  const [exchangeRate, setExchangeRate] = useState<number>(getExchangeRate());
  const [lockData, setLockData] = useState<LockData>();
  const [isSendAllBsv, setIsSendAllBsv] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [bsv20s, setBsv20s] = useState<Bsv20[]>([]);
  const [manageFavorites, setManageFavorites] = useState(false);
  const [historyTx, setHistoryTx] = useState(false);
  const [account, setAccount] = useState<Account>();
  const [token, setToken] = useState<{ isConfirmed: boolean; info: Bsv20 } | null>(null);
  const services = theme.settings.services;
  const [filteredTokens, setFilteredTokens] = useState<Bsv20[]>([]);
  const [randomKey, setRandomKey] = useState(Math.random());
  const isTestnet = chromeStorageService.getNetwork() === 'testnet' ? true : false;
  const [mneeBalance, setMneeBalance] = useState(0);
  const [mneeRecipient, setMneeRecipient] = useState('');
  const [mneeReciepientAmount, setMneeRecipientAmount] = useState<number | null>(null);

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
    if (!mneeService) return;
    const res = await mneeService.balance(bsvAddress);
    if (res) {
      setMneeBalance(res.decimalAmount);

      // Update MNEE balance in Chrome storage
      const { account } = chromeStorageService.getCurrentAccountObject();
      if (!account) return;

      const key: keyof ChromeStorageObject = 'accounts';
      const update: Partial<ChromeStorageObject['accounts']> = {
        [identityAddress]: {
          ...account,
          mneeBalance: {
            amount: res.amount,
            decimalAmount: res.decimalAmount,
          },
        },
      };
      await chromeStorageService.updateNested(key, update);
    }
  };

  const resetRecipientErrors = () => {
    setRecipients((prev) => [...prev.map((r) => ({ ...r, error: undefined }))]);
  };

  const getAndSetAccountAndBsv20s = async () => {
    const res = await ordinalService.getBsv20s();
    setBsv20s(res);
    setAccount(chromeStorageService.getCurrentAccountObject().account);
  };

  useEffect(() => {
    if (!bsv20s || !account) return;
    const filtered = bsv20s.filter((t) => t.id && account?.settings?.favoriteTokens?.includes(t.id));
    setFilteredTokens(filtered);
  }, [bsv20s, account]);

  useEffect(() => {
    (async () => {
      const obj = await chromeStorageService.getAndSetStorage();
      obj && !obj.hasUpgradedToSPV ? setShowUpgrade(true) : setShowUpgrade(false);
      if (obj?.selectedAccount) {
        oneSatSPV.stores.txos?.syncTxLogs();
        if (!ordinalService) return;
        await getAndSetAccountAndBsv20s();
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const bsvBalanceInSats = bsvBalance * BSV_DECIMAL_CONVERSION;
    setIsSendAllBsv(satSendAmount === bsvBalanceInSats);
  }, [satSendAmount, bsvBalance]);

  const getAndSetBsvBalance = async () => {
    await updateBsvBalance();
    setBsvBalance(getBsvBalance());
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
    if (!bsvService) return;
    const lockData = await getLockData();
    setLockData(lockData);
  };

  useEffect(() => {
    loadLocks && loadLocks();
    getAndSetBsvBalance();
    updateMneeBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshUtxos = async (showLoad = false) => {
    showLoad && setIsProcessing(true);
    await updateBsvBalance();
    setBsvBalance(getBsvBalance());
    setExchangeRate(getExchangeRate());
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
    if (!unlockAttempted && lockData?.unlockable) {
      (async () => {
        const res = await unlockLockedCoins();
        setUnlockAttempted(true);
        if (res) {
          if (res.error) addSnackbar('Error unlocking coins!', 'error');
          if (res.txid) {
            await refreshUtxos();
            await unlockLockedCoins();
            await sleep(1000);
            addSnackbar('Successfully unlocked coins!', 'success');
          }
        }
      })();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityAddress, isSyncing, lockData]);

  useEffect(() => {
    if (isOrdRequest) {
      handleSelect('ords');
    }
  }, [isOrdRequest, handleSelect]);

  const resetSendState = () => {
    setPasswordConfirm('');
    setIsProcessing(false);
    resetRecipients();
    setIsSendAllBsv(false);
    setSatSendAmount(null);
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(bsvAddress).then(() => {
      addSnackbar('Copied!', 'success');
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

    if (!passwordConfirm) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
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

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    //? multi-send calculate all amounts
    const sendRecipients = recipients.map((r) => {
      let satoshis = r.satSendAmount ?? 0;
      if (r.amountType === 'usd' && r.usdSendAmount) {
        satoshis = Math.ceil((r.usdSendAmount / exchangeRate) * BSV_DECIMAL_CONVERSION);
      }
      return isValidEmail(r.address) ? { paymail: r.address, satoshis } : { address: r.address, satoshis };
    });

    let sendRes: InWalletBsvResponse;
    if (isSendAllBsv) {
      const r = sendRecipients[0];
      sendRes = await sendAllBsv(r.address ?? r.paymail, r.address ? 'address' : 'paymail', passwordConfirm);
    } else {
      sendRes = await sendBsv(sendRecipients, passwordConfirm);
    }

    if (!sendRes.txid || sendRes.error) {
      addSnackbar(getErrorMessage(sendRes.error), 'error');
      setPasswordConfirm('');
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

  const handleSync = async () => {
    await refreshUtxos();
    await chromeStorageService.update({ hasUpgradedToSPV: true });
    window.location.reload();
  };

  const handleBsv20TokenClick = (token: Bsv20) => {
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
    const config = await mneeService.config();
    if (!config) {
      setMneeRecipientAmount(mneeBalance);
      return;
    }
    const atomicBalance = mneeService.toAtomicAmount(mneeBalance);
    const fee = config.fees.find((fee: MNEEFee) => atomicBalance >= fee.min && atomicBalance <= fee.max)?.fee || 0;
    setMneeRecipientAmount((atomicBalance - fee) / 10 ** config.decimals);
  };

  const receive = (
    <ReceiveContent>
      <HeaderText style={{ marginTop: '1rem' }} theme={theme}>
        Receive Assets
      </HeaderText>
      <Show
        when={services.ordinals || services.bsv20}
        whenFalseContent={
          <Text style={{ marginBottom: '1.25rem' }} theme={theme}>
            You may safely send <Warning theme={theme}>Bitcoin SV (BSV)</Warning> to this address.
          </Text>
        }
      >
        <Text style={{ marginBottom: '1.25rem' }} theme={theme}>
          You may safely send <Warning theme={theme}>BSV, MNEE, and Ordinals</Warning> to this address.
        </Text>
      </Show>

      <QrCode address={bsvAddress} onClick={handleCopyToClipboard} />
      <Text theme={theme} style={{ margin: '1rem 0 -1.25rem 0', fontWeight: 700 }}>
        Scan or copy the address
      </Text>
      <CopyAddressWrapper onClick={handleCopyToClipboard}>
        <StyledCopy src={copyIcon} />
        <Text
          theme={theme}
          style={{
            margin: '0',
            color: theme.color.global.contrast,
            fontSize: '0.75rem',
          }}
        >
          {bsvAddress}
        </Text>
      </CopyAddressWrapper>
      <Button
        label="Go back"
        theme={theme}
        type="secondary"
        onClick={() => {
          setPageState('main');
          updateBsvBalance();
        }}
      />
    </ReceiveContent>
  );

  const main = (
    <MainContent>
      <MiddleContainer theme={theme}>
        <Show when={socialProfile.avatar !== HOSTED_YOURS_IMAGE}>
          <ProfileImage src={socialProfile.avatar} />
        </Show>
        <HeaderText
          title={'Sync Transactions'}
          style={{ fontSize: '2rem', cursor: 'pointer' }}
          theme={theme}
          onClick={() => oneSatSPV.stores.txos?.syncTxLogs()}
        >
          {formatUSD(bsvBalance * exchangeRate)}
        </HeaderText>
        <BalanceContainer>
          <Icon src={bsvCoin} size="1rem" />
          <Text theme={theme} style={{ margin: '0' }}>
            {bsvBalance.toFixed(8)}
          </Text>
        </BalanceContainer>
        <ButtonContainer>
          <Button theme={theme} type="primary" label="Receive" onClick={() => setPageState('receive')} />
          <Button theme={theme} type="primary" label="Send" onClick={() => setPageState('send')} />
        </ButtonContainer>
        <FaucetButton onConfirmation={handleTestNetFaucetConfirmation} address={bsvAddress} isTestnet={isTestnet} />
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
        <Show when={services.bsv20}>
          {filteredTokens.length > 0 && (
            <Bsv20TokensList
              key={randomKey}
              hideStatusLabels
              bsv20s={filteredTokens}
              theme={theme}
              onTokenClick={(t: Bsv20) => handleBsv20TokenClick(t)}
            />
          )}
          <ManageTokenListWrapper onClick={() => setManageFavorites(!manageFavorites)}>
            <FaListAlt size="1rem" color={theme.color.global.gray} />
            <Text theme={theme} style={{ margin: '0 0 0 0.5rem', fontWeight: 700, color: theme.color.global.gray }}>
              Manage Tokens List
            </Text>
          </ManageTokenListWrapper>
          <ManageTokenListWrapper onClick={() => setHistoryTx(!historyTx)}>
            <FaHistory size="1rem" color={theme.color.global.gray} />
            <Text theme={theme} style={{ margin: '0 0 0 0.5rem', fontWeight: 700, color: theme.color.global.gray }}>
              Recent Activity
            </Text>
          </ManageTokenListWrapper>
        </Show>
      </MiddleContainer>
    </MainContent>
  );

  const sendMNEE = (
    <>
      <ScrollableConfirmContent>
        <Icon src={MNEE_ICON_URL} size="3rem" style={{ margin: 0, borderRadius: '50%' }} />
        <HeaderText theme={theme}>Send MNEE</HeaderText>
        <Text
          theme={theme}
          style={{ cursor: 'pointer' }}
          onClick={handleSendAllMnee}
        >{`Balance: ${formatNumberWithCommasAndDecimals(mneeBalance, 5)}`}</Text>
        <FormContainer noValidate onSubmit={(e) => handleSendMNEE(e)}>
          <InputWrapper>
            <Input
              theme={theme}
              placeholder="Enter Address"
              type="text"
              onChange={(e) => setMneeRecipient(e.target.value)}
              value={mneeRecipient}
            />
          </InputWrapper>
          <InputWrapper>
            <Input
              theme={theme}
              placeholder={'Enter MNEE Amount'}
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
          </InputWrapper>

          <Input
            theme={theme}
            placeholder="Enter Wallet Password"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />

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
        </FormContainer>

        <SwapAndBridgeButtonContainer>
          <SwapAndBridgeButton theme={theme} onClick={() => window.open('https://swap-user.mnee.net', '_blank')}>
            Swap & Bridge
            <FaExternalLinkAlt size="0.85rem" />
          </SwapAndBridgeButton>
        </SwapAndBridgeButtonContainer>

        <Button
          label="Go back"
          theme={theme}
          type="secondary"
          onClick={() => {
            setPageState('main');
            setMneeRecipient('');
            setMneeRecipientAmount(null);
            setPasswordConfirm('');
          }}
        />
      </ScrollableConfirmContent>
    </>
  );

  const getMnee = (
    <GetMneeContainer theme={theme}>
      <Icon src={MNEE_ICON_URL} size="3rem" style={{ margin: 0, borderRadius: '50%' }} />
      <HeaderText style={{ marginTop: '1rem' }} theme={theme}>
        Get Started with MNEE
      </HeaderText>
      <Text style={{ marginBottom: '1.25rem' }} theme={theme}>
        MNEE is the <Warning theme={theme}>first USD backed stablecoin</Warning> to leverage the BSV blockchain. Each
        token is equal to $1.00 USD and is fully collateralized with US T-bills and cash equivalents.
      </Text>

      <QrCode link={MNEE_MOBILE_REFERRAL_LINK} onClick={handleCopyToClipboard} />
      <Text theme={theme} style={{ margin: '1rem 0', fontWeight: 700 }}>
        Scan with your mobile device
      </Text>
      <Button
        label="Go back"
        theme={theme}
        type="secondary"
        onClick={() => {
          setPageState('main');
        }}
      />
    </GetMneeContainer>
  );

  const send = (
    <>
      <ScrollableConfirmContent>
        <HeaderText theme={theme}>Send BSV</HeaderText>
        <Text
          theme={theme}
          style={{ cursor: 'pointer' }}
          onClick={fillInputWithAllBsv}
        >{`Balance: ${bsvBalance}`}</Text>
        <FormContainer noValidate onSubmit={(e) => handleSendBsv(e)}>
          {recipients.map((recipient) => (
            <RecipientRow key={recipient.id} theme={theme}>
              <RecipientInputs>
                <InputWrapper>
                  <Input
                    theme={theme}
                    placeholder="Enter Address or Paymail"
                    type="text"
                    onChange={(e) => updateRecipient(recipient.id, 'address', e.target.value)}
                    value={recipient.address}
                  />
                  {recipients.length > 1 && (
                    <FaTrash
                      size="1rem"
                      color={theme.color.global.gray}
                      style={{
                        position: 'absolute',
                        right: '2.25rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        cursor: 'pointer',
                      }}
                      onClick={() => removeRecipient(recipient.id)}
                    />
                  )}
                </InputWrapper>
                <InputWrapper>
                  <Input
                    theme={theme}
                    placeholder={recipient.amountType === 'bsv' ? 'Enter BSV Amount' : 'Enter USD Amount'}
                    type="number"
                    step="0.00000001"
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
                  />
                  <UnitSwitcher theme={theme}>
                    {recipient.amountType === 'bsv' ? 'BSV' : 'USD'}
                    <FaArrowRightArrowLeft
                      size="1rem"
                      style={{ marginLeft: '0.5rem' }}
                      color={theme.color.global.gray}
                      onClick={() => toggleRecipientAmountType(recipient.id)}
                    />
                  </UnitSwitcher>
                </InputWrapper>
              </RecipientInputs>
            </RecipientRow>
          ))}
          <Show when={!isSendAllBsv}>
            <Button type="secondary-outline" label="+ Add Recipient" onClick={addRecipient} theme={theme} />
          </Show>
          <Show when={isPasswordRequired}>
            <Input
              theme={theme}
              placeholder="Enter Wallet Password"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
          </Show>
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
        </FormContainer>

        <Button
          label="Go back"
          theme={theme}
          type="secondary"
          onClick={() => {
            setPageState('main');
            resetRecipients();
            resetSendState();
          }}
        />
      </ScrollableConfirmContent>
    </>
  );

  if (token) {
    return <SendBsv20View token={token} onBack={() => setToken(null)} />;
  }

  if (showUpgrade) {
    return <UpgradeNotification onSync={handleSync} />;
  }

  return (
    <>
      <Show when={manageFavorites}>
        <ManageTokens
          onBack={() => {
            setManageFavorites(false);
            getAndSetAccountAndBsv20s();
            setRandomKey(Math.random());
          }}
          bsv20s={bsv20s}
          theme={theme}
        />
      </Show>
      <Show when={historyTx}>
        <TxHistory
          onBack={() => {
            setHistoryTx(false);
            getAndSetAccountAndBsv20s();
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
