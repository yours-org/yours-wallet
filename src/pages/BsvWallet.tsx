import { validate } from 'bitcoin-address-validation';
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import bsvCoin from '../assets/bsv-coin.svg';
import switchAsset from '../assets/switch-asset.svg';
import { BackButton } from '../components/BackButton';
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
} from '../components/Reusable';
import { Show } from '../components/Show';
import { useBottomMenu } from '../hooks/useBottomMenu';
import { useBsv } from '../hooks/useBsv';
import { useSnackbar } from '../hooks/useSnackbar';
import { useSocialProfile } from '../hooks/useSocialProfile';
import { useTheme } from '../hooks/useTheme';
import { useWeb3Context } from '../hooks/useWeb3Context';
import { ColorThemeProps } from '../theme';
import { BSV_DECIMAL_CONVERSION, HOSTED_PANDA_IMAGE } from '../utils/constants';
import { formatUSD } from '../utils/format';
import { sleep } from '../utils/sleep';

const MiddleContainer = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  width: 80%;
  padding: 2.75rem 1rem;
  border-radius: 1rem;
  border: 0.25rem solid ${({ theme }) => theme.mainBackground + '70'};
  background-color: ${({ theme }) => theme.darkAccent};
`;

const ProfileImageContainer = styled.div`
  position: absolute;
  top: 10rem;
  right: 2.25rem;
`;

const ProfileImage = styled.img`
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 100%;
  cursor: pointer;
`;

const BalanceContainer = styled.div`
  display: flex;
  align-items: center;
`;

const NumberWrapper = styled.span<ColorThemeProps>`
  font-size: 2.5rem;
  color: ${({ theme }) => theme.white};
  font-family: Arial, Helvetica, sans-serif;
  font-weight: 600;
  margin: 0.25rem 0;
  text-align: center;
`;

const Major = styled.span`
  font-size: inherit;
`;

const Minor = styled.span<ColorThemeProps>`
  font-size: 1rem;
  color: ${({ theme }) => theme.white + '80'};
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

type PageState = 'main' | 'receive' | 'send';
type AmountType = 'bsv' | 'usd';

export const BsvWallet = () => {
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [pageState, setPageState] = useState<PageState>('main');
  const [satSendAmount, setSatSendAmount] = useState<number | null>(null);
  const [usdSendAmount, setUsdSendAmount] = useState<number | null>(null);
  const [receiveAddress, setReceiveAddress] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [amountType, setAmountType] = useState<AmountType>('bsv');
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const { socialProfile } = useSocialProfile();
  const { isPasswordRequired } = useWeb3Context();

  const { bsvAddress, bsvBalance, isProcessing, setIsProcessing, sendBsv, updateBsvBalance, exchangeRate } = useBsv();

  useEffect(() => {
    setSelected('bsv');
  }, [setSelected]);

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
          : sendRes.error === 'fee-to-high'
          ? 'Miner fee to high!'
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

  const formatBalance = (number: number) => {
    // Convert the number to string with fixed 8 decimal places
    const numStr = number.toFixed(8);

    const [whole, decimal] = numStr.split('.');

    const [firstChar, secondChar, ...rest] = decimal.split('');

    const firstTwoDecimal = `${firstChar}${secondChar}`;
    const nextThreeDecimal = rest.slice(0, 3).join('');
    const lastThreeDecimal = rest.slice(3, 6).join('');

    return (
      <NumberWrapper theme={theme}>
        <Major theme={theme}>{`${whole}.${firstTwoDecimal}`}</Major>
        <Minor theme={theme}>{` ${nextThreeDecimal} ${lastThreeDecimal}`}</Minor>
      </NumberWrapper>
    );
  };

  const receive = (
    <ReceiveContent>
      <BackButton
        onClick={() => {
          setPageState('main');
          updateBsvBalance(true);
        }}
      />
      <Icon size={'2.5rem'} src={bsvCoin} />
      <HeaderText style={{ marginTop: '1rem' }} theme={theme}>
        BSV Address
      </HeaderText>
      <Text style={{ marginBottom: '1.25rem', fontSize: '1rem', fontWeight: 700, color: theme.errorRed }}>
        Do not send 1Sat Ordinals or BSV20 to this address!
      </Text>
      <QrCode address={bsvAddress} onClick={handleCopyToClipboard} />
      <Text theme={theme} style={{ marginTop: '1.5rem', cursor: 'pointer' }} onClick={handleCopyToClipboard}>
        {bsvAddress}
      </Text>
    </ReceiveContent>
  );

  const main = (
    <MainContent>
      <ProfileImageContainer>
        <ProfileImage
          title="Refresh balance"
          src={socialProfile?.avatar ? socialProfile.avatar : HOSTED_PANDA_IMAGE}
          onClick={() => updateBsvBalance(true)}
        />
      </ProfileImageContainer>
      <MiddleContainer theme={theme}>
        <BalanceContainer>
          <Icon src={bsvCoin} />
          {formatBalance(bsvBalance)}
        </BalanceContainer>
        <Text theme={theme} style={{ margin: '0.5rem 0 0 0' }}>
          {formatUSD(bsvBalance * exchangeRate)}
        </Text>
      </MiddleContainer>
      <ButtonContainer>
        <Button theme={theme} type="primary" label="Receive" onClick={() => setPageState('receive')} />
        <Button theme={theme} type="primary" label="Send" onClick={() => setPageState('send')} />
      </ButtonContainer>
    </MainContent>
  );

  const send = (
    <>
      <BackButton
        onClick={() => {
          setPageState('main');
          resetSendState();
        }}
      />
      <ConfirmContent>
        <HeaderText theme={theme}>Send BSV</HeaderText>
        <Text
          theme={theme}
          style={{ cursor: 'pointer' }}
          onClick={fillInputWithAllBsv}
        >{`Available Balance: ${bsvBalance}`}</Text>
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
          <Text theme={theme} style={{ margin: '3rem 0 1rem' }}>
            Double check details before sending.
          </Text>
          <Button
            theme={theme}
            type="primary"
            label={getLabel()}
            disabled={isProcessing || (!usdSendAmount && !satSendAmount)}
            isSubmit
          />
        </FormContainer>
      </ConfirmContent>
    </>
  );

  return (
    <>
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
