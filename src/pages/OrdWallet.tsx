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

type Addresses = Record<string, string>;

const OrdinalsList = styled.div`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  overflow-y: auto;
  width: 100%;
  margin-top: 4.5rem;
  height: 20rem;
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

const Label = styled.div<WhiteLabelTheme>`
  color: ${({ theme }) => theme.color.global.contrast};
  text-align: right;
`;

const OrdinalWrapper = styled.div<WhiteLabelTheme>`
  display: grid;
  width: 100%;
  max-width: 320px;
  gap: 5px;
  grid-template-columns: repeat(2, 1fr);
  justify-items: center;
`;

const OrdinalItem = styled.div<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background-color: #f9f9f9;
  width: 150px;
  flex-direction: column;
  box-sizing: border-box;
  margin-bottom: 5px;
`;

const OrdinalDetails = styled.div<WhiteLabelTheme>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 100%;
  box-sizing: border-box;
`;

const OrdinalTitle = styled.div<WhiteLabelTheme>`
  font-size: 0.8rem;
  font-weight: 600;
  color: #333;
`;

const ReceiverInput = styled.input<WhiteLabelTheme>`
  width: 100%;
  max-width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.color.global.gray};
  transition: border-color 0.2s ease;
  box-sizing: border-box;

  &:focus {
    border-color: #007bff;
    outline: none;
  }
`;

type PageState = 'main' | 'transfer' | 'list' | 'cancel';

export const OrdWallet = () => {
  const { theme } = useTheme();
  const [pageState, setPageState] = useState<PageState>('main');
  const { chromeStorageService, ordinalService, gorillaPoolService } = useServiceContext();
  const [isProcessing, setIsProcessing] = useState(false);
  const { listOrdinalOnGlobalOrderbook, cancelGlobalOrderbookListing, getOrdinals, transferOrdinalsMulti } =
    ordinalService;
  const isPasswordRequired = chromeStorageService.isPasswordRequired();
  const network = chromeStorageService.getNetwork();
  const [selectedOrdinals, setSelectedOrdinals] = useState<OrdinalType[]>([]);
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [bsvListAmount, setBsvListAmount] = useState<number | null>();
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const [ordinals, setOrdinals] = useState<OrdType[]>([]);
  const [from, setFrom] = useState<string>();
  const listedOrdinals = ordinals && ordinals.filter((o) => o?.data?.list);
  const myOrdinals = ordinals && ordinals.filter((o) => !o?.data?.list);
  const [useSameAddress, setUseSameAddress] = useState(false);
  const [addresses, setAddresses] = useState<Addresses>({});
  const [addressErrors, setAddressErrors] = useState<Addresses>({});
  const [commonAddress, setCommonAddress] = useState('');

  const toggleOrdinalSelection = (ord: OrdinalType) => {
    const isSelected = selectedOrdinals.some((selected) => selected.outpoint === ord.outpoint);
    if (isSelected) {
      // Deselect if already selected
      setSelectedOrdinals(selectedOrdinals.filter((selected) => selected !== ord));
    } else {
      // Add to selection
      setSelectedOrdinals([...selectedOrdinals, ord]);
    }
  };

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
    setPasswordConfirm('');
    setSuccessTxId('');
    setBsvListAmount(undefined);
    setIsProcessing(false);
    setSelectedOrdinals([]);
    setUseSameAddress(false);
    setCommonAddress('');
  };

  const refreshOrdinals = async () => {
    const data = await getOrdinals();
    setOrdinals(data.ordinals);
    setFrom(data.from);
  };

  const handleMultiTransferOrdinal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    const destinationAddresses = Object.values(addresses);
    const outpoints = Object.keys(addresses);

    const transferRes = await transferOrdinalsMulti({ outpoints, destinationAddresses, password: passwordConfirm });

    if (!transferRes.txid || transferRes.error) {
      addSnackbar(getErrorMessage(transferRes.error), 'error');
      setIsProcessing(false);
      return;
    }

    setSuccessTxId(transferRes.txid);
    addSnackbar('Transfer Successful!', 'success');
    refreshOrdinals();
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
      outpoint: selectedOrdinals[0].outpoint,
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
    refreshOrdinals();
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

    const ordinalOutpoint = selectedOrdinals[0].outpoint;

    const cancelRes = await cancelGlobalOrderbookListing(ordinalOutpoint, passwordConfirm);

    if (!cancelRes.txid || cancelRes.error) {
      addSnackbar(getErrorMessage(cancelRes.error), 'error');
      setIsProcessing(false);
      return;
    }

    setSuccessTxId(cancelRes.txid);
    addSnackbar('Successfully canceled the listing!', 'success');
    refreshOrdinals();
  };

  const handleAddressChange = useCallback((outpoint: string, address: string) => {
    setAddresses((prev) => ({ ...prev, [outpoint]: address }));
    setAddressErrors((prev) => ({
      ...prev,
      [outpoint]: validate(address) ? '' : 'Invalid 1sat address format',
    }));
  }, []);

  const handleCommonAddressChange = useCallback(
    (address: string) => {
      setCommonAddress(address);
      if (useSameAddress) {
        const newAddresses = selectedOrdinals.reduce<Addresses>((acc, ordinal) => {
          acc[ordinal.outpoint] = address;
          return acc;
        }, {});
        setAddresses(newAddresses);
      }

      if (address) {
        const isValid = validate(address);
        setAddressErrors(
          selectedOrdinals.reduce<Addresses>((acc, ordinal) => {
            acc[ordinal.outpoint] = isValid ? '' : 'Invalid 1sat address format';
            return acc;
          }, {}),
        );
      }
    },
    [useSameAddress, selectedOrdinals],
  );

  const toggleUseSameAddress = useCallback(() => {
    setUseSameAddress((prev) => !prev);
    if (!useSameAddress) {
      handleCommonAddressChange(commonAddress);
    }
  }, [commonAddress, useSameAddress, handleCommonAddressChange]);

  const transferAndListButtons = (
    <>
      <Button
        theme={theme}
        type="primary"
        label="Transfer"
        disabled={ordinals.length === 0 || !selectedOrdinals.length}
        onClick={async () => {
          if (!selectedOrdinals.length) {
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
        disabled={ordinals.length === 0 || !selectedOrdinals.length}
        onClick={async () => {
          if (!selectedOrdinals.length) {
            addSnackbar('You must select an ordinal to list!', 'info');
            return;
          }
          setPageState('list');
        }}
      />
    </>
  );

  const renderTransfers = (selectedOrdinals: OrdType[]) => {
    return selectedOrdinals.map((ordinal) => (
      <OrdinalItem key={ordinal.origin?.outpoint}>
        <Ordinal
          theme={theme}
          inscription={ordinal as OrdinalType}
          url={`${gorillaPoolService.getBaseUrl(network)}/content/${ordinal.origin?.outpoint}`}
          isTransfer
          size="3rem"
        />
        <OrdinalDetails>
          <OrdinalTitle>
            {`${ordinal?.origin?.data?.map?.name ?? ordinal?.origin?.data?.map?.subTypeData?.name ?? 'ID'}`}
          </OrdinalTitle>
          <Show when={!useSameAddress}>
            <ReceiverInput
              theme={theme}
              placeholder="Receiver Address"
              type="text"
              onChange={(e) => handleAddressChange(ordinal.outpoint, e.target.value)}
              value={addresses[ordinal.outpoint] || ''}
            />
            {addressErrors[ordinal.outpoint] && <span style={{ color: 'red' }}>{addressErrors[ordinal.outpoint]}</span>}
          </Show>
        </OrdinalDetails>
      </OrdinalItem>
    ));
  };

  const MultiSendUI = (
    <ContentWrapper>
      <ConfirmContent
        style={{
          height: '20rem',
          overflowY: 'auto',
        }}
      >
        <FormContainer noValidate onSubmit={(e) => handleMultiTransferOrdinal(e)}>
          <HeaderText style={{ fontSize: '1.35rem' }} theme={theme}>
            Transfer Ordinals
          </HeaderText>

          <Show when={selectedOrdinals.length > 1}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Label theme={theme}>Use the same address for all transfers</Label>
              <Input
                theme={theme}
                name="sameAddress"
                type="checkbox"
                checked={useSameAddress}
                onChange={toggleUseSameAddress}
                size={5}
                style={{ transform: 'scale(0.8)', width: '20px', height: '20px' }}
              />
            </div>
          </Show>
          <div></div>
          <OrdinalWrapper>{renderTransfers(selectedOrdinals)}</OrdinalWrapper>

          <Show when={useSameAddress && selectedOrdinals.length > 1}>
            <Input
              theme={theme}
              placeholder="Receiver Address"
              type="text"
              onChange={(e) => handleCommonAddressChange(e.target.value)}
              value={commonAddress}
            />
            {addressErrors[selectedOrdinals[0]?.outpoint] && (
              <span style={{ color: 'red' }}>{addressErrors[selectedOrdinals[0]?.outpoint]}</span>
            )}
          </Show>

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
        <Ordinal
          theme={theme}
          inscription={selectedOrdinals[0] as OrdinalType}
          url={`${gorillaPoolService.getBaseUrl(network)}/content/${selectedOrdinals[0]?.origin?.outpoint}`}
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
          selected={selectedOrdinals.some((selected) => selected.outpoint === ord.outpoint)}
          onClick={() => toggleOrdinalSelection(ord)}
        />
      ));
  };

  const nft = (
    <>
      <Show
        when={ordinals.filter((o) => o.origin?.data?.insc?.file?.type !== 'application/bsv-20').length > 0}
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
      <OrdButtonContainer theme={theme} $blur={selectedOrdinals.length > 0}>
        <Show
          when={!selectedOrdinals.length}
          whenFalseContent={
            <Show when={pageState === 'list'} whenFalseContent={transferAndListButtons}>
              <Button
                theme={theme}
                type="warn"
                label="Cancel Listing"
                onClick={async () => {
                  if (!selectedOrdinals.length) {
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
          selectedOrdinals[0]?.origin?.data?.map?.name ??
          selectedOrdinals[0]?.origin?.data?.map?.subTypeData?.name ??
          'List Ordinal'
        }`}</HeaderText>
        <Text style={{ margin: 0 }} theme={theme}>{`#${selectedOrdinals[0]?.origin?.num}`}</Text>
        <Ordinal
          theme={theme}
          inscription={selectedOrdinals[0] as OrdinalType}
          url={`${gorillaPoolService.getBaseUrl(network)}/content/${selectedOrdinals[0]?.origin?.outpoint}`}
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
      <Show when={!isProcessing && pageState === 'transfer'}>{MultiSendUI}</Show>
      <Show when={!isProcessing && pageState === 'list'}>{list}</Show>
      <Show when={!isProcessing && pageState === 'cancel'}>{cancel}</Show>
    </>
  );
};
