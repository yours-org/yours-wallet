import validate from 'bitcoin-address-validation';
import { Fragment, useEffect, useState } from 'react';
import styled from 'styled-components';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Ordinal } from '../components/Ordinal';
import { PageLoader } from '../components/PageLoader';
import { QrCode } from '../components/QrCode';
import {
  ButtonContainer,
  ConfirmContent,
  FormContainer,
  HeaderText,
  ReceiveContent,
  SubHeaderText,
  Text,
  Warning,
} from '../components/Reusable';
import { Show } from '../components/Show';
import Tabs from '../components/Tabs';
import { OrdinalTxo } from '../hooks/ordTypes';
import { useBottomMenu } from '../hooks/useBottomMenu';
import { BSV20, getTokenName, ListOrdinal, OrdOperationResponse, useOrds } from '../hooks/useOrds';
import { useSnackbar } from '../hooks/useSnackbar';
import { useTheme } from '../hooks/useTheme';
import { useWeb3Context } from '../hooks/useWeb3Context';
import { BSV_DECIMAL_CONVERSION } from '../utils/constants';
import { isBSV20v2, normalize, showAmount } from '../utils/ordi';
import { sleep } from '../utils/sleep';
import { BSV20Id } from '../components/BSV20Id';
import checkboxChecked from '../assets/checkbox-checked.png';
import checkboxunChecked from '../assets/checkbox-unchecked.png';
import { IconButton } from '../components/IconButton';
import copyIcon from '../assets/copy.svg';
import { TopNav } from '../components/TopNav';
import { AssetRow } from '../components/AssetRow';
import { formatNumberWithCommasAndDecimals } from '../utils/format';

const OrdinalsList = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  overflow-y: auto;
  width: 100%;
  margin-top: 0.5rem;
`;

const BSV20List = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  overflow-y: auto;
  width: 100%;
  margin-top: 0.5rem;
  height: calc(100% - 10rem);
`;

const NoInscriptionWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 8rem;
  width: 100%;
`;

export const CheckBox = styled.div`
  margin: 0.5rem 0.5rem;
`;

const ContentWrapper = styled.div`
  margin-top: -2rem;
  width: 100%;
`;

const TransferBSV20Header = styled(HeaderText)`
  overflow: hidden;
  max-width: 16rem;
  white-space: nowrap;
  text-overflow: ellipsis;
  margin: 0;
`;

export const OrdButtonContainer = styled(ButtonContainer)`
  margin: 0.5rem 0 0.5rem 0;
  position: fixed;
  bottom: 4.5rem;
`;

export const BSV20Header = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  margin-left: 1rem;
`;

const TokenIcon = styled.img`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  object-fit: cover;
`;

const Balance = styled(Text)`
  font-size: 0.85rem;
  white-space: pre-wrap;
  margin: 0;
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
  margin: 0.25rem 0 0.75rem 0;
  padding: 0 0;
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

type PageState = 'main' | 'receive' | 'transfer' | 'list' | 'cancel' | 'sendBSV20';

interface Token {
  isConfirmed: boolean;
  info: BSV20;
}

export const OrdWallet = () => {
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [pageState, setPageState] = useState<PageState>('main');
  const {
    bsv20s,
    ordAddress,
    ordinals,
    getOrdinals,
    isProcessing,
    transferOrdinal,
    setIsProcessing,
    getOrdinalsBaseUrl,
    sendBSV20,
    listOrdinalOnGlobalOrderbook,
    cancelGlobalOrderbookListing,
    getTokenPriceInSats,
  } = useOrds();
  const [selectedOrdinal, setSelectedOrdinal] = useState<OrdinalTxo | undefined>();
  const [tabIndex, selectTab] = useState(0);
  const [ordinalOutpoint, setOrdinalOutpoint] = useState('');
  const [receiveAddress, setReceiveAddress] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [bsvListAmount, setBsvListAmount] = useState<number | null>();
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const { isPasswordRequired, exchangeRate } = useWeb3Context();

  const [token, setToken] = useState<Token | null>(null);
  const [showConfirmed, setShowConfirmed] = useState(true);
  const [showPending, setShowPending] = useState(true);
  const [tokenSendAmount, setTokenSendAmount] = useState<bigint | null>(null);
  const [priceData, setPriceData] = useState<{ id: string; satPrice: number }[]>([]);

  useEffect(() => {
    if (!bsv20s.data.length) return;
    (async () => {
      const data = await getTokenPriceInSats(bsv20s.data.map((d) => d.id));
      setPriceData(data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bsv20s]);

  useEffect(() => {
    setSelected('ords');
  }, [setSelected]);

  useEffect(() => {
    if (ordAddress) {
      getOrdinals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordAddress]);

  useEffect(() => {
    if (!successTxId) return;
    if (!message) {
      resetSendState();
      setPageState('main');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId, message]);

  const resetSendState = () => {
    setReceiveAddress('');
    setPasswordConfirm('');
    setSuccessTxId('');
    setBsvListAmount(undefined);
    setIsProcessing(false);
    setSelectedOrdinal(undefined);
    setTokenSendAmount(null);
    setTimeout(() => {
      getOrdinals(false);
    }, 500);
  };

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

  const handleTransferOrdinal = async (e: React.FormEvent<HTMLFormElement>) => {
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

    const transferRes = await transferOrdinal(receiveAddress, ordinalOutpoint, passwordConfirm);

    if (!transferRes.txid || transferRes.error) {
      const errorMessage = getErrorMessage(transferRes);
      addSnackbar(errorMessage, 'error');
      return;
    }

    setSuccessTxId(transferRes.txid);
    addSnackbar('Transfer Successful!', 'success');
  };

  const handleListOrdinal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);
    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    if (Number(bsvListAmount) < 0.00000001) {
      addSnackbar('Must be more than 1 sat', 'error');
      setIsProcessing(false);
      return;
    }

    const listing: ListOrdinal = {
      outpoint: ordinalOutpoint,
      password: passwordConfirm,
      price: Math.ceil(bsvListAmount! * BSV_DECIMAL_CONVERSION),
    };

    const listRes = await listOrdinalOnGlobalOrderbook(listing);

    if (!listRes.txid || listRes.error) {
      const errorMessage = getErrorMessage(listRes);
      addSnackbar(errorMessage, 'error');
      return;
    }

    setSuccessTxId(listRes.txid);
    addSnackbar('Listing Successful!', 'success');
  };

  const handleCancelListing = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);
    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    const cancelRes = await cancelGlobalOrderbookListing(ordinalOutpoint, passwordConfirm);

    if (!cancelRes.txid || cancelRes.error) {
      const errorMessage = getErrorMessage(cancelRes);
      addSnackbar(errorMessage, 'error');
      return;
    }

    setSuccessTxId(cancelRes.txid);
    addSnackbar('Successfully canceled the listing!', 'success');
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

    const sendBSV20Res = await sendBSV20(token.info.id, receiveAddress, BigInt(tokenSendAmount), passwordConfirm);

    if (!sendBSV20Res.txid || sendBSV20Res.error) {
      const message = getErrorMessage(sendBSV20Res);

      addSnackbar(message, 'error');
      return;
    }

    setSuccessTxId(sendBSV20Res.txid);
    addSnackbar('Tokens Sent!', 'success');
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(ordAddress).then(() => {
      addSnackbar('Copied!', 'success');
    });
  };

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

  const transferAndListButtons = (
    <>
      <Button
        theme={theme}
        type="primary"
        label="Transfer"
        disabled={ordinals.data.length === 0 || !selectedOrdinal}
        onClick={async () => {
          if (!selectedOrdinal?.outpoint.toString()) {
            addSnackbar('You must select an ordinal to transfer!', 'info');
            return;
          }
          setPageState('transfer');
        }}
      />
      <Button
        theme={theme}
        type="primary"
        label="List"
        disabled={ordinals.data.length === 0 || !selectedOrdinal}
        onClick={async () => {
          if (!selectedOrdinal?.outpoint.toString()) {
            addSnackbar('You must select an ordinal to list!', 'info');
            return;
          }
          setPageState('list');
        }}
      />
    </>
  );

  const ft = (
    <>
      <Show
        when={bsv20s.initialized && bsv20s.data.length > 0}
        whenFalseContent={
          <NoInscriptionWrapper>
            <Text
              style={{
                color: theme.gray,
                fontSize: '1rem',
                marginTop: '4rem',
              }}
            >
              You don't have any tokens
            </Text>
          </NoInscriptionWrapper>
        }
      >
        <BSV20List>
          <BSV20Header>
            <CheckBox>
              <IconButton
                icon={showConfirmed ? checkboxChecked : checkboxunChecked}
                onClick={() => {
                  setShowConfirmed(!showConfirmed);
                }}
              />
            </CheckBox>
            <SubHeaderText theme={theme}>Confirmed</SubHeaderText>
          </BSV20Header>
          <Show when={showConfirmed}>
            {bsv20s.data
              .filter((d) => d.all.confirmed > 0n)
              .map((b) => {
                return (
                  <div
                    style={{ display: 'flex', justifyContent: 'center', width: '100%' }}
                    onClick={async () => {
                      setToken({
                        isConfirmed: true,
                        info: b,
                      });
                      setPageState('sendBSV20');
                    }}
                  >
                    <AssetRow
                      balance={Number(showAmount(b.all.confirmed, b.dec))}
                      icon={b.icon ? `${getOrdinalsBaseUrl()}/content/${b.icon}` : ''}
                      ticker={getTokenName(b)}
                      usdBalance={
                        (priceData.find((p) => p.id === b.id)?.satPrice ?? 0) *
                        (exchangeRate / BSV_DECIMAL_CONVERSION) *
                        Number(showAmount(b.all.confirmed, b.dec))
                      }
                    />
                  </div>
                );
              })}
          </Show>

          <Show when={bsv20s.data.filter((d) => d.all.pending > 0n).length > 0}>
            <BSV20Header style={{ marginTop: '2rem' }}>
              <CheckBox>
                <IconButton
                  icon={showPending ? checkboxChecked : checkboxunChecked}
                  onClick={() => {
                    setShowPending(!showPending);
                  }}
                />
              </CheckBox>
              <SubHeaderText theme={theme}>Pending</SubHeaderText>
            </BSV20Header>
            <Show when={showPending}>
              {bsv20s.data
                .filter((d) => d.all.pending > 0n)
                .map((b) => {
                  return (
                    <div
                      style={{ display: 'flex', justifyContent: 'center', width: '100%' }}
                      onClick={async () => {
                        addSnackbar('Pending tokens cannot be sent!', 'error', 1000);
                      }}
                    >
                      <AssetRow
                        balance={Number(showAmount(b.all.pending, b.dec))}
                        icon={b.icon ? `${getOrdinalsBaseUrl()}/content/${b.icon}` : ''}
                        ticker={getTokenName(b)}
                        usdBalance={
                          (priceData.find((p) => p.id === b.id)?.satPrice ?? 0) *
                          (exchangeRate / BSV_DECIMAL_CONVERSION) *
                          Number(showAmount(b.all.confirmed, b.dec))
                        }
                      />
                    </div>
                  );
                })}
            </Show>
          </Show>
        </BSV20List>
      </Show>
      <OrdButtonContainer>
        <Button theme={theme} type="primary" label="Receive" onClick={() => setPageState('receive')} />
      </OrdButtonContainer>
    </>
  );

  const receive = (
    <ReceiveContent>
      <HeaderText style={{ marginTop: '1rem' }} theme={theme}>
        Receive Ordinals
      </HeaderText>
      <Text style={{ marginBottom: '1.25rem' }} theme={theme}>
        Only send Ordinals and BSV20 to this address. <Warning theme={theme}>Do not send BSV here.</Warning>
      </Text>
      <QrCode address={ordAddress} onClick={handleCopyToClipboard} />
      <CopyAddressWrapper onClick={handleCopyToClipboard}>
        <StyledCopy src={copyIcon} />
        <Text theme={theme} style={{ margin: '0', color: theme.white, fontSize: '0.75rem' }}>
          {ordAddress}
        </Text>
      </CopyAddressWrapper>
      <Button
        label="Go back"
        theme={theme}
        type="secondary"
        onClick={() => {
          setPageState('main');
          setTimeout(() => {
            getOrdinals(false);
          }, 500);
        }}
      />
    </ReceiveContent>
  );

  const transfer = (
    <ContentWrapper>
      <ConfirmContent>
        <HeaderText style={{ fontSize: '1.35rem' }} theme={theme}>{`${
          selectedOrdinal?.origin?.data?.map?.name ??
          selectedOrdinal?.origin?.data?.map?.subTypeData?.name ??
          'Transfer Ordinal'
        }`}</HeaderText>
        <Ordinal
          theme={theme}
          inscription={selectedOrdinal as OrdinalTxo}
          url={`${getOrdinalsBaseUrl()}/content/${selectedOrdinal?.origin?.outpoint.toString()}`}
          isTransfer
        />
        <FormContainer noValidate onSubmit={(e) => handleTransferOrdinal(e)}>
          <Input
            theme={theme}
            placeholder="Receive Address"
            type="text"
            name="address"
            onChange={(e) => setReceiveAddress(e.target.value)}
            value={receiveAddress}
          />
          <Show when={isPasswordRequired}>
            <Input
              theme={theme}
              placeholder="Password"
              name="password"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
          </Show>
          <Button theme={theme} type="primary" label="Transfer Now" disabled={isProcessing} isSubmit />
        </FormContainer>
        <Button
          style={{ marginTop: '1rem' }}
          theme={theme}
          type="secondary"
          label="Go back"
          onClick={() => {
            setPageState('main');
            resetSendState();
          }}
        />
      </ConfirmContent>
    </ContentWrapper>
  );

  const cancel = (
    <ContentWrapper>
      <BackButton
        onClick={() => {
          setPageState('main');
          resetSendState();
        }}
      />
      <ConfirmContent>
        <HeaderText style={{ fontSize: '1.35rem' }} theme={theme}>
          {'Cancel Listing'}
        </HeaderText>
        <Text style={{ margin: 0 }} theme={theme}>{`#${selectedOrdinal?.origin?.num}`}</Text>
        <Ordinal
          theme={theme}
          inscription={selectedOrdinal as OrdinalTxo}
          url={`${getOrdinalsBaseUrl()}/content/${selectedOrdinal?.origin?.outpoint.toString()}`}
          selected
          isTransfer
        />
        <FormContainer noValidate onSubmit={(e) => handleCancelListing(e)}>
          <Show when={isPasswordRequired}>
            <Input
              theme={theme}
              placeholder="Password"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
          </Show>
          <Button theme={theme} type="primary" label="Cancel Now" disabled={isProcessing} isSubmit />
        </FormContainer>
      </ConfirmContent>
    </ContentWrapper>
  );

  const nft = (
    <>
      <Show
        when={ordinals.initialized && ordinals.data.length > 0}
        whenFalseContent={
          <NoInscriptionWrapper>
            <Text
              style={{
                color: theme.gray,
                fontSize: '1rem',
                marginTop: '4rem',
              }}
            >
              You don't have any NFTs
            </Text>
          </NoInscriptionWrapper>
        }
      >
        <OrdinalsList>
          {ordinals.data
            .filter((o) => o.origin?.data?.insc?.file.type !== 'application/bsv-20')
            .map((ord) => {
              return (
                <Ordinal
                  theme={theme}
                  inscription={ord}
                  key={ord.origin?.outpoint.toString()}
                  url={`${getOrdinalsBaseUrl()}/content/${ord.origin?.outpoint.toString()}`}
                  selected={selectedOrdinal?.origin?.outpoint.toString() === ord.origin?.outpoint.toString()}
                  onClick={() => {
                    setSelectedOrdinal(ord);
                    setOrdinalOutpoint(ord.outpoint.toString());
                  }}
                />
              );
            })}
        </OrdinalsList>
      </Show>
      <OrdButtonContainer>
        <Show
          when={!selectedOrdinal}
          whenFalseContent={
            <Show when={!!selectedOrdinal?.data?.list} whenFalseContent={transferAndListButtons}>
              <Button
                theme={theme}
                type="warn"
                label="Cancel Listing"
                onClick={async () => {
                  if (!selectedOrdinal?.outpoint.toString()) {
                    addSnackbar('You must select an ordinal to transfer!', 'info');
                    return;
                  }
                  setPageState('cancel');
                }}
              />
            </Show>
          }
        >
          <Button theme={theme} type="primary" label="Receive" onClick={() => setPageState('receive')} />
        </Show>
      </OrdButtonContainer>
    </>
  );

  const main = (
    <Tabs tabIndex={tabIndex} selectTab={selectTab} theme={theme}>
      <Tabs.Panel theme={theme} label="NFT">
        {nft}
      </Tabs.Panel>
      <Tabs.Panel theme={theme} label="Tokens">
        {ft}
      </Tabs.Panel>
    </Tabs>
  );

  const sendBSV20View = (
    <Show when={token !== null}>
      {token ? (
        <ConfirmContent>
          <Show when={!!token.info.icon && token.info.icon.length > 0}>
            <TokenIcon style={{ marginBottom: '0.5rem' }} src={`${getOrdinalsBaseUrl()}/content/${token.info.icon}`} />
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
          <Show when={isBSV20v2(token.info.id)}>
            <BSV20Container>
              <BSV20Id
                theme={theme}
                id={token.info.id}
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
            style={{ marginTop: '1rem' }}
            theme={theme}
            type="secondary"
            label="Go back"
            disabled={isProcessing}
            onClick={() => {
              setTokenSendAmount(null);
              setPageState('main');
              resetSendState();
            }}
          />
        </ConfirmContent>
      ) : (
        <></>
      )}
    </Show>
  );

  const list = (
    <ContentWrapper>
      <BackButton
        onClick={() => {
          setPageState('main');
          resetSendState();
        }}
      />
      <ConfirmContent>
        <HeaderText style={{ fontSize: '1.35rem' }} theme={theme}>{`List ${
          selectedOrdinal?.origin?.data?.map?.name ??
          selectedOrdinal?.origin?.data?.map?.subTypeData?.name ??
          'List Ordinal'
        }`}</HeaderText>
        <Text style={{ margin: 0 }} theme={theme}>{`#${selectedOrdinal?.origin?.num}`}</Text>
        <Ordinal
          theme={theme}
          inscription={selectedOrdinal as OrdinalTxo}
          url={`${getOrdinalsBaseUrl()}/content/${selectedOrdinal?.origin?.outpoint.toString()}`}
          selected
          isTransfer
        />
        <FormContainer noValidate onSubmit={(e) => handleListOrdinal(e)}>
          <Input
            theme={theme}
            placeholder="Enter BSV Amount"
            type="number"
            step="0.00000001"
            onChange={(e) => {
              const inputValue = e.target.value;

              // Check if the input is empty and if so, set the state to null
              if (inputValue === '') {
                setBsvListAmount(null);
              } else {
                setBsvListAmount(Number(inputValue));
              }
            }}
            value={bsvListAmount !== null && bsvListAmount !== undefined ? bsvListAmount : ''}
          />
          <Show when={isPasswordRequired}>
            <Input
              theme={theme}
              placeholder="Password"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
          </Show>
          <Text theme={theme} style={{ margin: '1rem 0 0 0' }}>
            Confirm global orderbook listing
          </Text>
          <Button theme={theme} type="primary" label="List Now" disabled={isProcessing} isSubmit />
        </FormContainer>
      </ConfirmContent>
    </ContentWrapper>
  );

  return (
    <>
      <TopNav />
      <Show when={isProcessing && pageState === 'main'}>
        <PageLoader theme={theme} message="Loading ordinals..." />
      </Show>
      <Show when={isProcessing && pageState === 'transfer'}>
        <PageLoader theme={theme} message="Transferring ordinal..." />
      </Show>
      <Show when={isProcessing && pageState === 'list'}>
        <PageLoader theme={theme} message="Listing ordinal..." />
      </Show>
      <Show when={isProcessing && pageState === 'cancel'}>
        <PageLoader theme={theme} message="Cancelling listing..." />
      </Show>
      <Show when={isProcessing && pageState === 'sendBSV20'}>
        <PageLoader theme={theme} message="Sending BSV20..." />
      </Show>
      <Show when={!isProcessing && pageState === 'main'}>{main}</Show>
      <Show when={!isProcessing && pageState === 'receive'}>{receive}</Show>
      <Show when={!isProcessing && pageState === 'transfer'}>{transfer}</Show>
      <Show when={!isProcessing && pageState === 'sendBSV20'}>{sendBSV20View}</Show>
      <Show when={!isProcessing && pageState === 'list'}>{list}</Show>
      <Show when={!isProcessing && pageState === 'cancel'}>{cancel}</Show>
    </>
  );
};
