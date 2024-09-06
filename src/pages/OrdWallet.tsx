import validate from 'bitcoin-address-validation';
import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Ordinal } from '../components/Ordinal';
import { Ordinal as OrdType } from 'yours-wallet-provider';
import { PageLoader } from '../components/PageLoader';
import {
  ButtonContainer,
  ConfirmContent,
  FormContainer,
  HeaderText,
  SubHeaderText,
  Text,
} from '../components/Reusable';
import { Show } from '../components/Show';
import Tabs from '../components/Tabs';
import { useBottomMenu } from '../hooks/useBottomMenu';
import { useSnackbar } from '../hooks/useSnackbar';
import { useTheme } from '../hooks/useTheme';
import { useServiceContext } from '../hooks/useServiceContext';
import { BSV_DECIMAL_CONVERSION } from '../utils/constants';
import { isBSV20v2, normalize, showAmount } from '../utils/ordi';
import { sleep } from '../utils/sleep';
import { BSV20Id } from '../components/BSV20Id';
import { TopNav } from '../components/TopNav';
import { AssetRow } from '../components/AssetRow';
import { formatNumberWithCommasAndDecimals, truncate } from '../utils/format';
import { ListOrdinal, OrdOperationResponse } from '../services/types/ordinal.types';
import { Bsv20, Bsv21, Ordinal as OrdinalType } from 'yours-wallet-provider';

const OrdinalsList = styled.div`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  overflow-y: auto;
  width: 100%;
  margin-top: 0.5rem;
  height: 25rem;
  padding-bottom: 8rem;
`;

const BSV20List = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  margin-top: 0.5rem;
  height: calc(100% - 4rem);
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
  position: absolute;
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
  margin: 0 0 0.75rem 0;
  padding: 0 0;
`;

type PageState = 'main' | 'transfer' | 'list' | 'cancel' | 'sendBSV20';

interface Token {
  isConfirmed: boolean;
  info: Bsv20;
}

export const OrdWallet = () => {
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [pageState, setPageState] = useState<PageState>('main');
  const { chromeStorageService, ordinalService, gorillaPoolService, bsvService } = useServiceContext();
  const [isProcessing, setIsProcessing] = useState(false);
  const { transferOrdinal, getBsv20s, listOrdinalOnGlobalOrderbook, cancelGlobalOrderbookListing, getTokenName } =
    ordinalService;
  const isPasswordRequired = chromeStorageService.isPasswordRequired();
  const network = chromeStorageService.getNetwork();
  const [selectedOrdinal, setSelectedOrdinal] = useState<OrdinalType | undefined>();
  const [tabIndex, selectTab] = useState(0);
  const [ordinalOutpoint, setOrdinalOutpoint] = useState('');
  const [receiveAddress, setReceiveAddress] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [bsvListAmount, setBsvListAmount] = useState<number | null>();
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const [token, setToken] = useState<Token | null>(null);
  const [tokenSendAmount, setTokenSendAmount] = useState<bigint | null>(null);
  const [priceData, setPriceData] = useState<{ id: string; satPrice: number }[]>([]);
  const [ordinals, setOrdinals] = useState<OrdType[]>([]);
  const [bsv20s, setBsv20s] = useState<(Bsv20 | Bsv21)[]>([]);
  // const bsv20s = getBsv20s(); //TODO: this... david

  useEffect(() => {
    if (!bsv20s.length) return;
    (async () => {
      const data = await gorillaPoolService.getTokenPriceInSats(bsv20s.map((d) => (d as Bsv21)?.id || ''));
      setPriceData(data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bsv20s]);

  useEffect(() => {
    setSelected('ords');
  }, [setSelected]);

  useEffect(() => {
    if (!successTxId) return;
    // if (!message) {
    resetSendState();
    setPageState('main');
    // }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId, message]);

  const loadBsv20s = async () => {
    if (!ordinalService) return;
    const bsv20s = await ordinalService.getBsv20s();
    console.log({ bsv20s });
    setBsv20s(bsv20s);
  };

  const loadOrdinals = async () => {
    if (!ordinalService) return;
    const ordinals = await ordinalService.getOrdinals();
    setOrdinals(ordinals);
  };

  useEffect(() => {
    loadOrdinals();
    loadBsv20s();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetSendState = () => {
    setReceiveAddress('');
    setPasswordConfirm('');
    setSuccessTxId('');
    setBsvListAmount(undefined);
    setIsProcessing(false);
    setSelectedOrdinal(undefined);
    setTokenSendAmount(null);
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
    loadOrdinals();
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

    if (!bsvListAmount) {
      addSnackbar('You must enter a valid BSV amount!', 'error');
      setIsProcessing(false);
      return;
    }

    const listing: ListOrdinal = {
      outpoint: ordinalOutpoint,
      password: passwordConfirm,
      price: Math.ceil(bsvListAmount * BSV_DECIMAL_CONVERSION),
    };

    const listRes = await listOrdinalOnGlobalOrderbook(listing);

    if (!listRes.txid || listRes.error) {
      const errorMessage = getErrorMessage(listRes);
      addSnackbar(errorMessage, 'error');
      return;
    }

    setSuccessTxId(listRes.txid);
    addSnackbar('Listing Successful!', 'success');
    loadOrdinals();
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
    loadOrdinals();
  };

  const handleSendBSV20 = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    //TODO: this
    // setIsProcessing(true);

    // await sleep(25);
    // if (!validate(receiveAddress)) {
    //   addSnackbar('You must enter a valid 1Sat Ordinal address.', 'info');
    //   setIsProcessing(false);
    //   return;
    // }

    // if (!passwordConfirm && isPasswordRequired) {
    //   addSnackbar('You must enter a password!', 'error');
    //   setIsProcessing(false);
    //   return;
    // }

    // if (token === null || tokenSendAmount === null) {
    //   setIsProcessing(false);
    //   return;
    // }

    // if (!token.info.id) {
    //   addSnackbar('Missing token ID!', 'error');
    //   setIsProcessing(false);
    //   return;
    // }

    // const sendBSV20Res = await sendBSV20(token.info.id, receiveAddress, BigInt(tokenSendAmount), passwordConfirm);

    // if (!sendBSV20Res.txid || sendBSV20Res.error) {
    //   const message = getErrorMessage(sendBSV20Res);

    //   addSnackbar(message, 'error');
    //   return;
    // }

    // setSuccessTxId(sendBSV20Res.txid);
    // addSnackbar('Tokens Sent!', 'success');
    // loadOrdinals();
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
        disabled={ordinals.length === 0 || !selectedOrdinal}
        onClick={async () => {
          if (!selectedOrdinal?.outpoint) {
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
        disabled={ordinals.length === 0 || !selectedOrdinal}
        onClick={async () => {
          if (!selectedOrdinal?.outpoint) {
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
        when={bsv20s.length > 0}
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
            <SubHeaderText style={{ marginLeft: '1rem', color: theme.gray }} theme={theme}>
              Confirmed
            </SubHeaderText>
          </BSV20Header>
          <div style={{ width: '100%' }}>
            {bsv20s
              .filter((d) => d.all.confirmed > 0n)
              .map((b) => {
                return (
                  <div
                    key={(b as Bsv21).id}
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
                      animate
                      balance={Number(showAmount(b.all.confirmed, b.dec))}
                      showPointer={true}
                      icon={b.icon ? `${gorillaPoolService.getBaseUrl(network)}/content/${b.icon}` : ''}
                      ticker={truncate(getTokenName(b), 10, 0)}
                      usdBalance={
                        (priceData.find((p) => p.id === (b as Bsv21).id)?.satPrice ?? 0) *
                        (bsvService.getExchangeRate() / BSV_DECIMAL_CONVERSION) *
                        Number(showAmount(b.all.confirmed, b.dec))
                      }
                    />
                  </div>
                );
              })}
          </div>

          <Show when={bsv20s.filter((d) => d.all.pending > 0n).length > 0}>
            <BSV20Header style={{ marginTop: '2rem' }}>
              <SubHeaderText style={{ marginLeft: '1rem', color: theme.gray }} theme={theme}>
                Pending
              </SubHeaderText>
            </BSV20Header>
            <div style={{ width: '100%' }}>
              {bsv20s
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
                        animate
                        balance={Number(showAmount(b.all.pending, b.dec))}
                        showPointer={true}
                        icon={b.icon ? `${gorillaPoolService.getBaseUrl(network)}/content/${b.icon}` : ''}
                        ticker={getTokenName(b)}
                        usdBalance={
                          (priceData.find((p) => p.id === (b as Bsv21).id)?.satPrice ?? 0) *
                          (bsvService.getExchangeRate() / BSV_DECIMAL_CONVERSION) *
                          Number(showAmount(b.all.confirmed, b.dec))
                        }
                      />
                    </div>
                  );
                })}
            </div>
          </Show>
        </BSV20List>
      </Show>
    </>
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
          inscription={selectedOrdinal as OrdinalType}
          url={`${gorillaPoolService.getBaseUrl(network)}/content/${selectedOrdinal?.origin?.outpoint}`}
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
          inscription={selectedOrdinal as OrdinalType}
          url={`${gorillaPoolService.getBaseUrl(network)}/content/${selectedOrdinal?.origin?.outpoint}`}
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
        when={ordinals.length > 0}
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
          {ordinals
            .filter((o) => o.origin?.data?.insc?.file.type !== 'application/bsv-20')
            .map((ord) => {
              return (
                <Ordinal
                  theme={theme}
                  inscription={ord}
                  size={'5.5rem'}
                  key={ord.origin?.outpoint}
                  url={`${gorillaPoolService.getBaseUrl(network)}/content/${ord.origin?.outpoint}`}
                  selected={selectedOrdinal?.origin?.outpoint === ord.origin?.outpoint}
                  onClick={() => {
                    setSelectedOrdinal(ord);
                    setOrdinalOutpoint(ord.outpoint);
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
                  if (!selectedOrdinal?.outpoint) {
                    addSnackbar('You must select an ordinal to transfer!', 'info');
                    return;
                  }
                  setPageState('cancel');
                }}
              />
            </Show>
          }
        ></Show>
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
          <Show when={isBSV20v2((token.info as Bsv21).id ?? '')}>
            <BSV20Container>
              <BSV20Id
                theme={theme}
                id={(token.info as Bsv21).id ?? ''}
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
            type="secondary"
            label="Go back"
            style={{ marginTop: '0.5rem' }}
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
          inscription={selectedOrdinal as OrdinalType}
          url={`${gorillaPoolService.getBaseUrl(network)}/content/${selectedOrdinal?.origin?.outpoint}`}
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
      <Show when={!isProcessing && pageState === 'transfer'}>{transfer}</Show>
      <Show when={!isProcessing && pageState === 'sendBSV20'}>{sendBSV20View}</Show>
      <Show when={!isProcessing && pageState === 'list'}>{list}</Show>
      <Show when={!isProcessing && pageState === 'cancel'}>{cancel}</Show>
    </>
  );
};
