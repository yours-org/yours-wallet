import validate from 'bitcoin-address-validation';
import { TokenType } from 'js-1sat-ord';
import { useEffect, useState } from 'react';
import { styled } from 'styled-components';
import { Bsv20 } from 'yours-wallet-provider';
import { useServiceContext } from '../hooks/useServiceContext';
import { useSnackbar } from '../hooks/useSnackbar';
import { useTheme } from '../hooks/useTheme';
import { OrdOperationResponse } from '../services/types/ordinal.types';
import { ONE_SAT_MARKET_URL } from '../utils/constants';
import { formatNumberWithCommasAndDecimals } from '../utils/format';
import { isBSV20v2, normalize, showAmount } from '../utils/ordi';
import { sleep } from '../utils/sleep';
import { BSV20Id } from './BSV20Id';
import { Button } from './Button';
import { Input } from './Input';
import { ConfirmContent, FormContainer, HeaderText, Text } from './Reusable';
import { Show } from './Show';

const TransferBSV20Header = styled(HeaderText)`
  overflow: hidden;
  max-width: 16rem;
  white-space: nowrap;
  text-overflow: ellipsis;
  margin: 0;
`;

const TokenIcon = styled.img`
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  object-fit: cover;
`;

const Balance = styled(Text)`
  font-size: 0.85rem;
  white-space: pre-wrap;
  margin: 0.5rem 0 0 0;
  width: fit-content;
  cursor: pointer;
  text-align: center;
  width: 100%;
`;

const BSV20Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-direction: row;
  width: 80%;
  margin: 0 0 0.75rem 0;
  padding: 0 0;
`;

export interface Token {
  isConfirmed: boolean;
  info: Bsv20;
}

export type SendBsv20ViewProps = {
  token: Token;
  onBack: () => void;
};

export const SendBsv20View = ({ token, onBack }: SendBsv20ViewProps) => {
  const { ordinalService, chromeStorageService, gorillaPoolService } = useServiceContext();
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const { getTokenName, sendBSV20 } = ordinalService;
  const isPasswordRequired = chromeStorageService.isPasswordRequired();
  const tokenType = token && (token.info.id || token.info.tick || '').length > 64 ? TokenType.BSV21 : TokenType.BSV20;
  const [tokenSendAmount, setTokenSendAmount] = useState<bigint | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [receiveAddress, setReceiveAddress] = useState('');
  const [successTxId, setSuccessTxId] = useState('');
  const network = chromeStorageService.getNetwork();

  useEffect(() => {
    if (!successTxId) return;
    resetSendState();
    onBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId]);

  const userSelectedAmount = (inputValue: string, token: Token) => {
    const amtStr = normalize(inputValue, token.info.dec);

    const amt = BigInt(amtStr);
    setTokenSendAmount(amt);
    const total = token.isConfirmed ? token.info.all.confirmed : token.info.all.pending;
    if (amt > total) {
      setTimeout(() => {
        setTokenSendAmount(total);
      }, 500);
    }
  };

  const resetSendState = () => {
    setReceiveAddress('');
    setPasswordConfirm('');
    setSuccessTxId('');
    setIsProcessing(false);
    setTokenSendAmount(null);
  };

  //TODO: This pattern (response.error) is used in a number of other places in the codebase. It should be refactored into a common function.
  const getErrorMessage = (response: OrdOperationResponse) => {
    return response.error === 'invalid-password'
      ? 'Invalid Password!'
      : response.error === 'no-keys'
        ? 'No keys were found!'
        : response.error === 'insufficient-funds'
          ? 'Insufficient Funds!'
          : response.error === 'fee-too-high'
            ? 'Miner fee too high!'
            : response.error === 'no-bsv20-utxo'
              ? 'No bsv20 token found!'
              : response.error === 'token-details'
                ? 'Could not gather token details!'
                : response.error === 'no-ord-utxo'
                  ? 'Could not locate the ordinal!'
                  : response.error === 'broadcast-error'
                    ? 'There was an error broadcasting the tx!'
                    : 'An unknown error has occurred! Try again.';
  };

  const handleSendBSV20 = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);
    if (!validate(receiveAddress)) {
      addSnackbar('You must enter a valid 1Sat Ordinal address.', 'info');
      setIsProcessing(false);
      return;
    }

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    if (token === null || tokenSendAmount === null) {
      setIsProcessing(false);
      return;
    }

    if (!token.info.tick && !token.info.id) {
      addSnackbar('Missing token ID!', 'error');
      setIsProcessing(false);
      return;
    }

    const sendBSV20Res = await sendBSV20(
      token.info?.tick || token.info?.id || '',
      receiveAddress,
      BigInt(tokenSendAmount),
      passwordConfirm,
    );

    if (!sendBSV20Res.txid || sendBSV20Res.error) {
      const message = getErrorMessage(sendBSV20Res);
      setIsProcessing(false);
      addSnackbar(message, 'error');
      return;
    }

    setSuccessTxId(sendBSV20Res.txid);
    addSnackbar('Tokens Sent!', 'success');
  };

  return (
    <Show when={token !== null}>
      {token ? (
        <ConfirmContent>
          <Show when={!!token.info.icon && token.info.icon.length > 0}>
            <TokenIcon
              style={{ marginBottom: '0.5rem' }}
              src={`${gorillaPoolService.getBaseUrl(network)}/content/${token.info.icon}`}
            />
          </Show>
          <TransferBSV20Header theme={theme}>Send {getTokenName(token.info)}</TransferBSV20Header>
          <BSV20Container>
            <Balance theme={theme} onClick={() => userSelectedAmount(String(Number(token.info.all.confirmed)), token)}>
              {`Balance: ${formatNumberWithCommasAndDecimals(
                Number(showAmount(token.info.all.confirmed, token.info.dec)),
                token.info.dec,
              )}`}
            </Balance>
          </BSV20Container>
          <Show when={isBSV20v2(token.info.id ?? '')}>
            <BSV20Container>
              <BSV20Id
                theme={theme}
                id={token.info.id ?? ''}
                onCopyTokenId={() => {
                  addSnackbar('Copied', 'success');
                }}
              ></BSV20Id>
            </BSV20Container>
          </Show>
          <FormContainer noValidate onSubmit={(e) => handleSendBSV20(e)}>
            <Input
              theme={theme}
              name="address"
              placeholder="Receive Address"
              type="text"
              onChange={(e) => setReceiveAddress(e.target.value)}
              value={receiveAddress}
            />
            <Input
              name="amt"
              theme={theme}
              placeholder="Enter Token Amount"
              type="number"
              step={'1'}
              value={tokenSendAmount !== null ? showAmount(tokenSendAmount, token.info.dec) : ''}
              onChange={(e) => {
                const inputValue = e.target.value;

                if (inputValue === '') {
                  setTokenSendAmount(null);
                } else {
                  userSelectedAmount(inputValue, token);
                }
              }}
            />
            <Show when={isPasswordRequired}>
              <Input
                theme={theme}
                name="password"
                placeholder="Password"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </Show>
            <Button theme={theme} type="primary" label="Send" disabled={isProcessing} isSubmit />
          </FormContainer>
          <Button
            theme={theme}
            type="secondary-outline"
            label="Trade"
            onClick={() =>
              window.open(
                `${ONE_SAT_MARKET_URL}/${tokenType === TokenType.BSV20 ? 'bsv20' : 'bsv21'}/${tokenType === TokenType.BSV20 ? token.info.tick : token.info.id}`,
                '_blank',
              )
            }
          />
          <Button
            theme={theme}
            type="secondary"
            label="Go back"
            style={{ marginTop: '0.5rem' }}
            disabled={isProcessing}
            onClick={() => {
              setTokenSendAmount(null);
              resetSendState();
              onBack();
            }}
          />
        </ConfirmContent>
      ) : (
        <></>
      )}
    </Show>
  );
};
