import validate from 'bitcoin-address-validation';
import { useEffect, useState } from 'react';
import { styled } from 'styled-components';
import { useServiceContext } from '../hooks/useServiceContext';
import { useSnackbar } from '../hooks/useSnackbar';
import { useTheme } from '../hooks/useTheme';
import { ONE_SAT_MARKET_URL } from '../utils/constants';
import { formatNumberWithCommasAndDecimals, normalize, showAmount } from '../utils/format';
import { sleep } from '../utils/sleep';
import { getErrorMessage } from '../utils/tools';
import { BSV21Id } from './BSV21Id';
import { Button } from './Button';
import { Input } from './Input';
import { ConfirmContent, FormContainer, HeaderText, Text } from './Reusable';
import { Show } from './Show';
import { ONESAT_MAINNET_CONTENT_URL, sendBsv21, type Bsv21Balance } from '@1sat/wallet-toolbox';

const TransferHeader = styled(HeaderText)`
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

const TokenIdContainer = styled.div`
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
  info: Bsv21Balance;
}

export type SendBsv21ViewProps = {
  token: Token;
  onBack: () => void;
};

export const SendBsv21View = ({ token, onBack }: SendBsv21ViewProps) => {
  const { apiContext } = useServiceContext();
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const getTokenName = (b: { sym?: string }): string => b.sym || 'Null';
  const [tokenSendAmount, setTokenSendAmount] = useState<bigint | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiveAddress, setReceiveAddress] = useState('');
  const [successTxId, setSuccessTxId] = useState('');
  const baseUrl = ONESAT_MAINNET_CONTENT_URL;

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
    setSuccessTxId('');
    setIsProcessing(false);
    setTokenSendAmount(null);
  };

  const handleSendBSV21 = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);
    if (!validate(receiveAddress)) {
      addSnackbar('You must enter a valid 1Sat Ordinal address.', 'info');
      setIsProcessing(false);
      return;
    }

    if (token === null || tokenSendAmount === null) {
      setIsProcessing(false);
      return;
    }

    if (!token.info.id) {
      addSnackbar('Missing token ID!', 'error');
      setIsProcessing(false);
      return;
    }

    let sendRes: Awaited<ReturnType<typeof sendBsv21.execute>>;
    try {
      sendRes = await sendBsv21.execute(apiContext, {
        tokenId: token.info.id,
        address: receiveAddress,
        amount: tokenSendAmount,
      });
    } catch (error) {
      console.error('[SendBsv21View] sendBsv21.execute threw:', error);
      setIsProcessing(false);
      addSnackbar(getErrorMessage(undefined), 'error');
      return;
    }

    if (!sendRes.txid || sendRes.error) {
      console.error('[SendBsv21View] sendBsv21 error:', sendRes.error);
      setIsProcessing(false);
      addSnackbar(getErrorMessage(sendRes.error), 'error');
      return;
    }

    setSuccessTxId(sendRes.txid);
    addSnackbar('Tokens Sent!', 'success');
  };

  return (
    <Show when={token !== null}>
      {token ? (
        <ConfirmContent>
          <Show when={!!token.info.icon && token.info.icon.length > 0}>
            <TokenIcon style={{ marginBottom: '0.5rem' }} src={`${baseUrl}/${token.info.icon}`} />
          </Show>
          <TransferHeader theme={theme}>Send {getTokenName(token.info)}</TransferHeader>
          <TokenIdContainer>
            <Balance theme={theme} onClick={() => userSelectedAmount(String(Number(token.info.all.confirmed)), token)}>
              {`Balance: ${formatNumberWithCommasAndDecimals(
                Number(showAmount(token.info.all.confirmed, token.info.dec)),
                token.info.dec,
              )}`}
            </Balance>
          </TokenIdContainer>
          <TokenIdContainer>
            <BSV21Id
              theme={theme}
              id={token.info.id}
              onCopyTokenId={() => {
                addSnackbar('Copied', 'success');
              }}
            />
          </TokenIdContainer>
          <FormContainer noValidate onSubmit={(e) => handleSendBSV21(e)}>
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
            <Button theme={theme} type="primary" label="Send" disabled={isProcessing} isSubmit />
          </FormContainer>
          <Button
            theme={theme}
            type="secondary-outline"
            label="Trade"
            onClick={() => window.open(`${ONE_SAT_MARKET_URL}/bsv21/${token.info.id}`, '_blank')}
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
