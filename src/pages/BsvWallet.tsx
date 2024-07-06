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
import { ColorThemeProps } from '../theme';
import { BSV_DECIMAL_CONVERSION, HOSTED_YOURS_IMAGE } from '../utils/constants';
import { formatUSD } from '../utils/format';
import { sleep } from '../utils/sleep';
import copyIcon from '../assets/copy.svg';
import { AssetRow } from '../components/AssetRow';
import lockIcon from '../assets/lock.svg';
import { useNavigate } from 'react-router-dom';
import { useWeb3RequestContext } from '../hooks/useWeb3RequestContext';
import { useServiceContext } from '../hooks/useServiceContext';

const MiddleContainer = styled.div<ColorThemeProps>`
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
  const { setSelected, handleSelect } = useBottomMenu();
  const [pageState, setPageState] = useState<PageState>('main');
  const [satSendAmount, setSatSendAmount] = useState<number | null>(null);
  const [usdSendAmount, setUsdSendAmount] = useState<number | null>(null);
  const [receiveAddress, setReceiveAddress] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [amountType, setAmountType] = useState<AmountType>('bsv');
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const { chromeStorageService, keysService, bsvService } = useServiceContext();
  const { socialProfile } = useSocialProfile(chromeStorageService);
  const [unlockAttempted, setUnlockAttempted] = useState(false);
  const { connectRequest } = useWeb3RequestContext();
  const isPasswordRequired = chromeStorageService.isPasswordRequired();
  const [isProcessing, setIsProcessing] = useState(false);
  const { bsvAddress, identityAddress } = keysService;
  const { bsvBalance, exchangeRate, lockData, unlockLockedCoins, updateBsvBalance, sendBsv } = bsvService;

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
            nukeUtxos();
            await unlockLockedCoins(true);
            await sleep(1000);
            addSnackbar('Successfully unlocked coins!', 'success');
          }
        }
      })();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockData, identityAddress]);

  useEffect(() => {
    if (isOrdRequest) {
      setSelected('ords');
    } else {
      setSelected('bsv');
    }
  }, [isOrdRequest, setSelected]);

  useEffect(() => {
    if (!successTxId) return;
    if (!message && bsvAddress) {
      resetSendState();
      setPageState('main');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId, message, bsvAddress]);

  const resetSendState = () => {
    setSatSendAmount(null);
    setUsdSendAmount(null);
    setAmountType('bsv');
    setReceiveAddress('');
    setPasswordConfirm('');
    setSuccessTxId('');
    setIsProcessing(false);

    setTimeout(() => {
      updateBsvBalance(true);
    }, 500);
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
    if (!validate(receiveAddress)) {
      addSnackbar('You must enter a valid BSV address. Paymail not yet supported.', 'info');
      setIsProcessing(false);
      return;
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

    const sendRes = await sendBsv([{ address: receiveAddress, satoshis }], passwordConfirm);
    if (!sendRes.txid || sendRes.error) {
      const message =
        sendRes.error === 'invalid-password'
          ? 'Invalid Password!'
          : sendRes.error === 'insufficient-funds'
            ? 'Insufficient Funds!'
            : sendRes.error === 'fee-too-high'
              ? 'Miner fee too high!'
              : 'An unknown error has occurred! Try again.';

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

  const nukeUtxos = () => {
    chromeStorageService.remove('paymentUtxos');
    // Give enough time for storage to remove
    setTimeout(() => {
      updateBsvBalance(true);
    }, 50);
  };

  const receive = (
    <ReceiveContent>
      <HeaderText style={{ marginTop: '1rem' }} theme={theme}>
        Receive BSV
      </HeaderText>
      <Text style={{ marginBottom: '1.25rem' }} theme={theme}>
        Only send BSV to this address. <Warning theme={theme}>Do not send Ordinals or BSV20 here.</Warning>
      </Text>
      <QrCode address={bsvAddress} onClick={handleCopyToClipboard} />
      <CopyAddressWrapper onClick={handleCopyToClipboard}>
        <StyledCopy src={copyIcon} />
        <Text theme={theme} style={{ margin: '0', color: theme.white, fontSize: '0.75rem' }}>
          {bsvAddress}
        </Text>
      </CopyAddressWrapper>
      <Button
        label="Go back"
        theme={theme}
        type="secondary"
        onClick={() => {
          setPageState('main');
          updateBsvBalance(true);
        }}
      />
    </ReceiveContent>
  );

  const main = (
    <MainContent>
      <MiddleContainer theme={theme}>
        <Show when={socialProfile.avatar !== HOSTED_YOURS_IMAGE}>
          <ProfileImage title="Refresh balance" src={socialProfile.avatar} onClick={nukeUtxos} />
        </Show>
        <HeaderText style={{ fontSize: '2rem', cursor: 'pointer' }} theme={theme} onClick={nukeUtxos}>
          {formatUSD(bsvBalance * exchangeRate)}
        </HeaderText>
        <BalanceContainer>
          <Icon src={bsvCoin} size="1rem" />
          <Text theme={theme} style={{ margin: '0' }}>
            {bsvBalance}
          </Text>
        </BalanceContainer>
        <ButtonContainer>
          <Button theme={theme} type="primary" label="Receive" onClick={() => setPageState('receive')} />
          <Button theme={theme} type="primary" label="Send" onClick={() => setPageState('send')} />
        </ButtonContainer>
        <AssetRow balance={bsvBalance} icon={bsvCoin} ticker="BSV" usdBalance={bsvBalance * exchangeRate} />
        <Show when={lockData.totalLocked > 0}>
          <AssetRow
            ticker="Total Locked"
            balance={lockData.totalLocked / BSV_DECIMAL_CONVERSION}
            usdBalance={Number((lockData.unlockable / BSV_DECIMAL_CONVERSION).toFixed(3))}
            icon={lockIcon}
            isLock
            nextUnlock={lockData?.nextUnlock}
            onClick={() => handleSelect('apps', 'pending-locks')}
          />
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
            placeholder="Enter Address"
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
