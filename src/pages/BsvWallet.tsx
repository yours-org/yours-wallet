import { validate } from 'bitcoin-address-validation';
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import bsvCoin from '../assets/bsv-coin.svg';
import switchAsset from '../assets/switch-asset.svg';
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
import { BSV_DECIMAL_CONVERSION, HOSTED_YOURS_IMAGE } from '../utils/constants';
import { formatUSD } from '../utils/format';
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
import { FaListAlt } from 'react-icons/fa';
import { FaHistory } from 'react-icons/fa';
import { ManageTokens } from '../components/ManageTokens';
import { Account } from '../services/types/chromeStorage.types';
import { SendBsv20View } from '../components/SendBsv20View';
import { TxHistory } from '../components/TxHistory';

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

const InputAmountWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
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

type PageState = 'main' | 'receive' | 'send';
type AmountType = 'bsv' | 'usd';

export type BsvWalletProps = {
  isOrdRequest: boolean;
};

export const BsvWallet = (props: BsvWalletProps) => {
  const { isOrdRequest } = props;
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { updateBalance, isSyncing } = useQueueTracker();
  const urlParams = new URLSearchParams(location.search);
  const isReload = urlParams.get('reload') === 'true';
  urlParams.delete('reload');
  const { handleSelect } = useBottomMenu();
  const [pageState, setPageState] = useState<PageState>('main');
  const [satSendAmount, setSatSendAmount] = useState<number | null>(null);
  const [usdSendAmount, setUsdSendAmount] = useState<number | null>(null);
  const [receiveAddress, setReceiveAddress] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [amountType, setAmountType] = useState<AmountType>('bsv');
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar } = useSnackbar();
  const { chromeStorageService, keysService, bsvService, ordinalService, oneSatSPV } = useServiceContext();
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

  const getAndSetAccountAndBsv20s = async () => {
    const res = await ordinalService.getBsv20s();
    setBsv20s(res);
    setAccount(chromeStorageService.getCurrentAccountObject().account);
  };

  useEffect(() => {
    if (!bsv20s || !account) return;
    setFilteredTokens(bsv20s.filter((t) => t.id && account?.settings?.favoriteTokens?.includes(t.id)));
  }, [bsv20s, account]);

  useEffect(() => {
    (async () => {
      const obj = await chromeStorageService.getAndSetStorage();
      obj && !obj.hasUpgradedToSPV ? setShowUpgrade(true) : setShowUpgrade(false);
      oneSatSPV.stores.txos?.syncTxLogs();
      if (!ordinalService) return;
      await getAndSetAccountAndBsv20s();
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
  }, [identityAddress, isSyncing]);

  useEffect(() => {
    if (isOrdRequest) {
      handleSelect('ords');
    }
  }, [isOrdRequest, handleSelect]);

  useEffect(() => {
    if (!successTxId) return;
    resetSendState();
    setPageState('main');
    setTimeout(() => refreshUtxos(), 1000); // slight delay to allow for transaction to be processed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId]);

  const resetSendState = () => {
    setSatSendAmount(null);
    setUsdSendAmount(null);
    setAmountType('bsv');
    setReceiveAddress('');
    setPasswordConfirm('');
    setSuccessTxId('');
    setIsProcessing(false);
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(bsvAddress).then(() => {
      addSnackbar('Copied!', 'success');
    });
  };

  const toggleAmountType = () => {
    if (amountType === 'bsv') {
      setAmountType('usd');
    } else {
      setAmountType('bsv');
    }
    setUsdSendAmount(null);
    setSatSendAmount(null);
  };

  const handleSendBsv = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);
    let isPaymail = false;
    if (!isValidEmail(receiveAddress) && !validate(receiveAddress)) {
      addSnackbar('You must enter a valid BSV or Paymail address.', 'info');
      setIsProcessing(false);
      return;
    }

    if (isValidEmail(receiveAddress)) {
      isPaymail = true;
    }

    if (!satSendAmount && !usdSendAmount) {
      addSnackbar('You must enter an amount.', 'info');
      setIsProcessing(false);
      return;
    }

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    let satoshis = satSendAmount ?? 0;
    if (amountType === 'usd' && usdSendAmount) {
      satoshis = Math.ceil((usdSendAmount / exchangeRate) * BSV_DECIMAL_CONVERSION);
    }

    let sendRes: InWalletBsvResponse | undefined;
    if (isPaymail) {
      sendRes = isSendAllBsv
        ? await sendAllBsv(receiveAddress, 'paymail', passwordConfirm)
        : await sendBsv([{ paymail: receiveAddress, satoshis }], passwordConfirm);
    } else {
      sendRes = isSendAllBsv
        ? await sendAllBsv(receiveAddress, 'address', passwordConfirm)
        : await sendBsv([{ address: receiveAddress, satoshis }], passwordConfirm);
    }

    if (!sendRes.txid || sendRes.error) {
      addSnackbar(getErrorMessage(sendRes.error), 'error');
      setPasswordConfirm('');
      setIsProcessing(false);
      return;
    }

    setSuccessTxId(sendRes.txid);
    addSnackbar('Transaction Successful!', 'success');
  };

  const fillInputWithAllBsv = () => {
    setSatSendAmount(Math.round(bsvBalance * BSV_DECIMAL_CONVERSION));
  };

  useEffect(() => {
    const calcValue = () => {
      return amountType === 'bsv'
        ? satSendAmount
          ? satSendAmount / BSV_DECIMAL_CONVERSION
          : undefined
        : amountType === 'usd'
          ? usdSendAmount
            ? usdSendAmount
            : undefined
          : undefined;
    };

    calcValue();
  }, [satSendAmount, usdSendAmount, amountType]);

  const getLabel = () => {
    return amountType === 'bsv' && satSendAmount
      ? `Send ${(satSendAmount / BSV_DECIMAL_CONVERSION).toFixed(8)}`
      : amountType === 'usd' && usdSendAmount
        ? `Send ${formatUSD(usdSendAmount)}`
        : 'Enter Send Details';
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
          You may safely send <Warning theme={theme}>BSV and Ordinals</Warning> to this address.
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
          onClick={() => {
            oneSatSPV.stores.txos?.syncTxLogs();
          }}
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
        <AssetRow
          balance={bsvBalance}
          icon={bsvCoin}
          ticker="BSV"
          usdBalance={bsvBalance * exchangeRate}
          showPointer={false}
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

  const send = (
    <>
      <ConfirmContent>
        <HeaderText theme={theme}>Send BSV</HeaderText>
        <Text
          theme={theme}
          style={{ cursor: 'pointer' }}
          onClick={fillInputWithAllBsv}
        >{`Balance: ${bsvBalance}`}</Text>
        <FormContainer noValidate onSubmit={(e) => handleSendBsv(e)}>
          <Input
            theme={theme}
            placeholder="Enter Address or Paymail"
            type="text"
            onChange={(e) => setReceiveAddress(e.target.value)}
            value={receiveAddress}
          />
          <InputAmountWrapper>
            <Input
              theme={theme}
              placeholder={amountType === 'bsv' ? 'Enter BSV Amount' : 'Enter USD Amount'}
              type="number"
              step="0.00000001"
              value={
                satSendAmount !== null && satSendAmount !== undefined
                  ? satSendAmount / BSV_DECIMAL_CONVERSION
                  : usdSendAmount !== null && usdSendAmount !== undefined
                    ? usdSendAmount
                    : ''
              }
              onChange={(e) => {
                const inputValue = e.target.value;

                // Check if the input is empty and if so, set the state to null
                if (inputValue === '') {
                  setSatSendAmount(null);
                  setUsdSendAmount(null);
                } else {
                  // Existing logic for setting state
                  if (amountType === 'bsv') {
                    setSatSendAmount(Math.round(Number(inputValue) * BSV_DECIMAL_CONVERSION));
                  } else {
                    setUsdSendAmount(Number(inputValue));
                  }
                }
              }}
            />
            <Icon
              src={switchAsset}
              size="1rem"
              style={{
                position: 'absolute',
                right: '2.25rem',
                cursor: 'pointer',
              }}
              onClick={toggleAmountType}
            />
          </InputAmountWrapper>
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
            disabled={isProcessing || (!usdSendAmount && !satSendAmount)}
            isSubmit
          />
        </FormContainer>
        <Button
          label="Go back"
          theme={theme}
          type="secondary"
          onClick={() => {
            setPageState('main');
            resetSendState();
          }}
        />
      </ConfirmContent>
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
      <Show when={!isProcessing && pageState === 'main'}>{main}</Show>
      <Show when={!isProcessing && pageState === 'receive'}>{receive}</Show>
      <Show when={!isProcessing && pageState === 'send'}>{send}</Show>
    </>
  );
};
