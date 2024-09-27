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
import { isValidEmail } from '../utils/tools';
import { UpgradeNotification } from '../components/UpgradeNotification';

const MiddleContainer = styled.div<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  width: 100%;
  padding: 2.75rem 1rem;
`;

const ProfileImage = styled.img`
  width: 4rem;
  height: 4rem;
  margin: 0.25rem;
  border-radius: 100%;
  cursor: pointer;
  transition: transform 0.3s ease;

  &:hover {
    transform: scale(1.2);
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
  const { updateBalance } = useQueueTracker();
  const urlParams = new URLSearchParams(location.search);
  const isReload = urlParams.get('reload') === 'true';
  urlParams.delete('reload');
  const { setSelected, handleSelect } = useBottomMenu();
  const [pageState, setPageState] = useState<PageState>('main');
  const [satSendAmount, setSatSendAmount] = useState<number | null>(null);
  const [usdSendAmount, setUsdSendAmount] = useState<number | null>(null);
  const [receiveAddress, setReceiveAddress] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [amountType, setAmountType] = useState<AmountType>('bsv');
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar } = useSnackbar();
  const { chromeStorageService, keysService, bsvService } = useServiceContext();
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

  useEffect(() => {
    setTimeout(async () => {
      const obj = await chromeStorageService.getAndSetStorage();
      obj && !obj.hasUpgradedToSPV ? setShowUpgrade(true) : setShowUpgrade(false);
    }, 500);

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
    if (!identityAddress) return;
    if (!unlockAttempted) {
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
  }, [identityAddress]);

  useEffect(() => {
    if (isOrdRequest) {
      setSelected('ords');
    } else {
      setSelected('bsv');
    }
  }, [isOrdRequest, setSelected]);

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
      const message =
        sendRes.error === 'invalid-password'
          ? 'Invalid Password!'
          : sendRes.error === 'insufficient-funds'
            ? 'Insufficient Funds!'
            : sendRes.error === 'fee-too-high'
              ? 'Miner fee too high!'
              : sendRes.error === 'no-wallet-address'
                ? 'No wallet address found!'
                : sendRes.error === 'invalid-data'
                  ? 'Invalid data!'
                  : sendRes.error === 'invalid-request'
                    ? 'Invalid request!'
                    : sendRes.error === 'source-tx-not-found'
                      ? 'Source transaction not found!'
                      : sendRes.error === 'no-account'
                        ? 'No account found!'
                        : 'An unknown error has occurred! Try again.';

      setIsProcessing(false);
      addSnackbar(message, 'error');
      setPasswordConfirm('');
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
    chromeStorageService.update({ hasUpgradedToSPV: true });
    window.location.reload();
  };

  const receive = (
    <ReceiveContent>
      <HeaderText style={{ marginTop: '1rem' }} theme={theme}>
        Receive Assets
      </HeaderText>
      <Text style={{ marginBottom: '1.25rem' }} theme={theme}>
        You may safely send <Warning theme={theme}>BSV and Ordinals</Warning> to this address.
      </Text>
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
            color:
              theme.color.global.primaryTheme === 'light' ? theme.color.global.neutral : theme.color.global.contrast,
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
          <ProfileImage title="Refresh Wallet Balance" src={socialProfile.avatar} onClick={() => refreshUtxos(true)} />
        </Show>
        <HeaderText
          title="Refresh Wallet Balance"
          style={{ fontSize: '2rem', cursor: 'pointer' }}
          theme={theme}
          onClick={() => refreshUtxos(true)}
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
          <Show when={theme.settings.services.locks && lockData.totalLocked > 0}>
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

  if (showUpgrade) {
    return <UpgradeNotification onSync={handleSync} />;
  }

  return (
    <>
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
