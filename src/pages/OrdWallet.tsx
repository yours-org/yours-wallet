import validate from 'bitcoin-address-validation';
import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Ordinal } from '../components/Ordinal';
import { Ordinal as OrdType } from 'yours-wallet-provider';
import { PageLoader } from '../components/PageLoader';
import { ButtonContainer, ConfirmContent, FormContainer, HeaderText, Text } from '../components/Reusable';
import { Show } from '../components/Show';
import { useSnackbar } from '../hooks/useSnackbar';
import { useTheme } from '../hooks/useTheme';
import { useServiceContext } from '../hooks/useServiceContext';
import { BSV_DECIMAL_CONVERSION } from '../utils/constants';
import { sleep } from '../utils/sleep';
import { TopNav } from '../components/TopNav';
import { ListOrdinal } from '../services/types/ordinal.types';
import { Ordinal as OrdinalType } from 'yours-wallet-provider';
import { WhiteLabelTheme } from '../theme.types';
import { getErrorMessage } from '../utils/tools';
import { useIntersectionObserver } from '../hooks/useIntersectObserver';

const OrdinalsList = styled.div`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  overflow-y: auto;
  width: 100%;
  margin-top: 4.5rem;
  height: 25rem;
  padding-bottom: 8rem;
`;

const NoInscriptionWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
`;

export const CheckBox = styled.div`
  margin: 0.5rem 0.5rem;
`;

const ContentWrapper = styled.div`
  width: 100%;
`;

export const OrdButtonContainer = styled(ButtonContainer)<WhiteLabelTheme & { $blur: boolean }>`
  margin: 0;
  position: absolute;
  bottom: 3.75rem;
  height: 5rem;
  width: 100%;
  background-color: ${({ theme, $blur }) => ($blur ? theme.color.global.walletBackground + '95' : 'transparent')};
  backdrop-filter: ${({ $blur }) => ($blur ? 'blur(8px)' : 'none')};
`;

export const BSV20Header = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  margin-left: 1rem;
`;

const SectionHeader = styled.h2<WhiteLabelTheme>`
  width: 100%;
  text-align: left;
  padding-left: 1rem;
  font-size: 1.25rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: ${({ theme }) => theme.color.global.gray};
`;

type PageState = 'main' | 'transfer' | 'list' | 'cancel';

export const OrdWallet = () => {
  const { theme } = useTheme();
  const [pageState, setPageState] = useState<PageState>('main');
  const { chromeStorageService, ordinalService, gorillaPoolService } = useServiceContext();
  const [isProcessing, setIsProcessing] = useState(false);
  const { transferOrdinal, listOrdinalOnGlobalOrderbook, cancelGlobalOrderbookListing, getOrdinals } = ordinalService;
  const isPasswordRequired = chromeStorageService.isPasswordRequired();
  const network = chromeStorageService.getNetwork();
  const [selectedOrdinal, setSelectedOrdinal] = useState<OrdinalType | undefined>();
  const [ordinalOutpoint, setOrdinalOutpoint] = useState('');
  const [receiveAddress, setReceiveAddress] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [bsvListAmount, setBsvListAmount] = useState<number | null>();
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const [ordinals, setOrdinals] = useState<OrdType[]>([]);
  const [from, setFrom] = useState<string>();

  const { isIntersecting, elementRef } = useIntersectionObserver({
    root: null,
    threshold: 1.0,
  });

  const loadOrdinals = useCallback(async () => {
    if (!ordinalService) return;
    if (ordinals.length === 0) setIsProcessing(true);
    const data = await getOrdinals(from);
    setFrom(data.from);
    setOrdinals((prev) => [...prev, ...data.ordinals]);
    setIsProcessing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordinalService, getOrdinals, from]);

  useEffect(() => {
    if (isIntersecting && from) {
      loadOrdinals();
    }
  }, [isIntersecting, from, loadOrdinals]);

  const listedOrdinals = ordinals.filter((o) => o?.data?.list);
  const myOrdinals = ordinals.filter((o) => !o?.data?.list);

  useEffect(() => {
    if (!successTxId) return;
    resetSendState();
    setPageState('main');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId, message]);

  useEffect(() => {
    loadOrdinals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetSendState = () => {
    setReceiveAddress('');
    setPasswordConfirm('');
    setSuccessTxId('');
    setBsvListAmount(undefined);
    setIsProcessing(false);
    setSelectedOrdinal(undefined);
  };

  const handleTransferOrdinal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);
    // if (!isValidEmail(receiveAddress) && !validate(receiveAddress)) {
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
      addSnackbar(getErrorMessage(transferRes.error), 'error');
      setIsProcessing(false);
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
      addSnackbar(getErrorMessage(listRes.error), 'error');
      setIsProcessing(false);
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
      addSnackbar(getErrorMessage(cancelRes.error), 'error');
      setIsProcessing(false);
      return;
    }

    setSuccessTxId(cancelRes.txid);
    addSnackbar('Successfully canceled the listing!', 'success');
    loadOrdinals();
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
          <Button
            theme={theme}
            type="secondary"
            label="Go Back"
            onClick={() => {
              setPageState('main');
              resetSendState();
            }}
            disabled={isProcessing}
          />
        </FormContainer>
      </ConfirmContent>
    </ContentWrapper>
  );

  const renderOrdinals = (list: OrdType[]) => {
    return list
      .filter((l) => l.origin?.data?.insc?.file?.type !== 'application/bsv-20')
      .map((ord) => (
        <Ordinal
          theme={theme}
          inscription={ord}
          key={ord.origin?.outpoint}
          url={`${gorillaPoolService.getBaseUrl(network)}/content/${ord.origin?.outpoint}`}
          selected={selectedOrdinal?.origin?.outpoint === ord.origin?.outpoint}
          onClick={() => {
            setSelectedOrdinal(ord);
            setOrdinalOutpoint(ord.outpoint);
          }}
        />
      ));
  };

  const nft = (
    <>
      <Show
        when={ordinals.length > 0}
        whenFalseContent={
          <NoInscriptionWrapper>
            <Text
              theme={theme}
              style={{
                color: theme.color.global.gray,
                fontSize: '1rem',
              }}
            >
              {theme.settings.services.ordinals
                ? "You don't have any NFTs"
                : 'Wallet configuration does not support NFTs!'}
            </Text>
          </NoInscriptionWrapper>
        }
      >
        <OrdinalsList>
          <Show when={listedOrdinals.length > 0}>
            <SectionHeader theme={theme}>My Listings</SectionHeader>
            {renderOrdinals(listedOrdinals)}
            <SectionHeader theme={theme}>My Ordinals</SectionHeader>
          </Show>
          {renderOrdinals(myOrdinals)}
          <div ref={elementRef} style={{ height: '1px' }} />
        </OrdinalsList>
      </Show>
      <OrdButtonContainer theme={theme} $blur={!!selectedOrdinal}>
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

  const main = <Show when={theme.settings.services.ordinals}>{nft}</Show>;

  const list = (
    <ContentWrapper>
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
          <Button
            theme={theme}
            type="secondary"
            label="Go back"
            onClick={() => {
              setPageState('main');
              setBsvListAmount(null);
              resetSendState();
            }}
          />
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
      <Show when={!isProcessing && pageState === 'main'}>{main}</Show>
      <Show when={!isProcessing && pageState === 'transfer'}>{transfer}</Show>
      <Show when={!isProcessing && pageState === 'list'}>{list}</Show>
      <Show when={!isProcessing && pageState === 'cancel'}>{cancel}</Show>
    </>
  );
};
