import validate from 'bitcoin-address-validation';
import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { Beef, type WalletOutput } from '@bsv/sdk';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Ordinal } from '../components/Ordinal';
import { PageLoader } from '../components/PageLoader';
import { ButtonContainer, ConfirmContent, FormContainer, HeaderText, Text } from '../components/Reusable';
import { Show } from '../components/Show';
import { useSnackbar } from '../hooks/useSnackbar';
import { useTheme } from '../hooks/useTheme';
import { useServiceContext } from '../hooks/useServiceContext';
import { cancelListing, getOrdinals, listOrdinal, ONESAT_MAINNET_CONTENT_URL, transferOrdinals } from '@1sat/actions';

const getContentUrl = (outpoint: string) => `${ONESAT_MAINNET_CONTENT_URL}/${outpoint}`;
import { BSV_DECIMAL_CONVERSION } from '../utils/constants';
import { sleep } from '../utils/sleep';
import { TopNav } from '../components/TopNav';
import { WhiteLabelTheme } from '../theme.types';
import { getErrorMessage } from '../utils/tools';
import { useIntersectionObserver } from '../hooks/useIntersectObserver';
import { truncate, getTagValue, getOutputName, hasTag } from '../utils/format';

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
  display: flex;
  width: 87%;
  gap: 5px;
  justify-items: center;
  flex-wrap: wrap;
`;

const OrdinalItem = styled.div<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
  min-width: 10.5rem;
  border: ${({ theme }) => `1px solid ${theme.color.global.gray}`};
  border-radius: 0.5rem;
  background-color: ${({ theme }) => theme.color.global.row};
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
  color: ${({ theme }) => theme.color.global.contrast};
`;

const ReceiverInput = styled.input<WhiteLabelTheme>`
  width: 100%;
  max-width: 100%;
  padding: 0.5rem;
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
  const { apiContext } = useServiceContext();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedOrdinals, setSelectedOrdinals] = useState<WalletOutput[]>([]);
  const [bsvListAmount, setBsvListAmount] = useState<number | null>();
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const [ordinals, setOrdinals] = useState<WalletOutput[]>([]);
  const [ordinalsBEEFs, setOrdinalsBEEFs] = useState<number[][]>([]);
  const [from, setFrom] = useState<string>();
  const listedOrdinals = ordinals.filter((o) => hasTag(o.tags, 'list'));
  const myOrdinals = ordinals.filter((o) => !hasTag(o.tags, 'list'));
  const [useSameAddress, setUseSameAddress] = useState(false);
  const [addresses, setAddresses] = useState<Addresses>({});
  const [addressErrors, setAddressErrors] = useState<Addresses>({});
  const [commonAddress, setCommonAddress] = useState('');

  const toggleOrdinalSelection = (ord: WalletOutput) => {
    const outpoint = ord.outpoint;
    const isSelected = selectedOrdinals.some((selected) => selected.outpoint === outpoint);
    const isListing = hasTag(ord.tags, 'list');

    if (isSelected) {
      setSelectedOrdinals(selectedOrdinals.filter((selected) => selected.outpoint !== outpoint));
    } else {
      const hasListingsSelected = selectedOrdinals.some((selected) => hasTag(selected.tags, 'list'));
      const hasNonListingsSelected = selectedOrdinals.some((selected) => !hasTag(selected.tags, 'list'));

      if (isListing) {
        if (selectedOrdinals.length === 0) {
          setSelectedOrdinals([ord]);
        } else if (hasNonListingsSelected) {
          addSnackbar('Multiselect listings not supported!', 'info');
        } else if (selectedOrdinals.length === 1) {
          addSnackbar('You can only select one listing at a time!', 'info');
        } else {
          setSelectedOrdinals([ord]);
        }
      } else {
        if (hasListingsSelected) {
          addSnackbar('Multiselect listings not supported!', 'info');
        } else {
          setSelectedOrdinals([...selectedOrdinals, ord]);
        }
      }
    }
  };

  const { isIntersecting, elementRef } = useIntersectionObserver({
    root: null,
    threshold: 1.0,
  });

  const loadOrdinals = useCallback(async () => {
    if (!apiContext) return;
    if (ordinals.length === 0) setIsProcessing(true);
    const offset = from ? parseInt(from, 10) : 0;
    const { outputs, BEEF } = await getOrdinals.execute(apiContext, { limit: 50, offset });

    // Store BEEF arrays as loaded - merge at transfer time
    if (BEEF) {
      setOrdinalsBEEFs((prev) => [...prev, BEEF]);
    }

    // Filter out panda/tag and yours/tag types
    const filtered = outputs.filter((o) => {
      const contentType = getTagValue(o.tags, 'type');
      return contentType !== 'panda/tag' && contentType !== 'yours/tag';
    });

    setFrom((offset + outputs.length).toString());
    setOrdinals((prev) => [...prev, ...filtered]);
    setIsProcessing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiContext, from]);

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
    setSuccessTxId('');
    setBsvListAmount(undefined);
    setIsProcessing(false);
    setSelectedOrdinals([]);
    setUseSameAddress(false);
    setCommonAddress('');
  };

  const refreshOrdinals = async () => {
    const { outputs, BEEF } = await getOrdinals.execute(apiContext, { limit: 50, offset: 0 });

    // Reset BEEFs with fresh data
    setOrdinalsBEEFs(BEEF ? [BEEF] : []);

    const filtered = outputs.filter((o) => {
      const contentType = getTagValue(o.tags, 'type');
      return contentType !== 'panda/tag' && contentType !== 'yours/tag';
    });

    setOrdinals(filtered);
    setFrom(outputs.length.toString());
  };

  // Merge stored BEEFs to extract only transactions needed for selected ordinals
  const getMergedBeefForOrdinals = (selected: WalletOutput[]): number[] | undefined => {
    if (ordinalsBEEFs.length === 0) return undefined;

    const neededTxids = new Set(selected.map((o) => o.outpoint.split('.')[0]));
    const merged = new Beef();

    for (const beefBytes of ordinalsBEEFs) {
      const beef = Beef.fromBinary(beefBytes);
      for (const txid of neededTxids) {
        if (beef.findTxid(txid)?.tx) {
          merged.mergeBeef(beef);
          break;
        }
      }
    }

    return merged.toBinary();
  };

  const handleMultiTransferOrdinal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);

    try {
      const inputBEEF = getMergedBeefForOrdinals(selectedOrdinals);
      if (!inputBEEF) {
        console.error('[OrdWallet] No BEEF available');
        addSnackbar('No transaction data available', 'error');
        setIsProcessing(false);
        return;
      }

      // Build transfer items from selected ordinals + addresses
      const transfers = selectedOrdinals.map((ordinal) => ({
        ordinal,
        address: addresses[ordinal.outpoint],
      }));

      const transferRes = await transferOrdinals.execute(apiContext, {
        transfers,
        inputBEEF,
      });

      if (!transferRes.txid || transferRes.error) {
        console.error('[OrdWallet] Transfer failed:', transferRes.error);
        addSnackbar(getErrorMessage(transferRes.error), 'error');
        setIsProcessing(false);
        return;
      }

      console.log('[OrdWallet] Transfer success:', transferRes.txid);
      setSuccessTxId(transferRes.txid);
      addSnackbar('Transfer Successful!', 'success');
      refreshOrdinals();
    } catch (error) {
      console.error('[OrdWallet] Transfer exception:', error);
      addSnackbar(error instanceof Error ? error.message : 'Transfer failed', 'error');
      setIsProcessing(false);
    }
  };

  const handleListOrdinal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);

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

    const inputBEEF = getMergedBeefForOrdinals(selectedOrdinals);
    if (!inputBEEF) {
      addSnackbar('No transaction data available', 'error');
      setIsProcessing(false);
      return;
    }

    // TODO: Get payAddress from BRC-29 receive address
    // For now, we need to implement this - the payAddress should come from the wallet's receive address
    const payAddress = ''; // Placeholder - needs proper implementation

    const listRes = await listOrdinal.execute(apiContext, {
      ordinal: selectedOrdinals[0],
      inputBEEF,
      price: Math.ceil(bsvListAmount * BSV_DECIMAL_CONVERSION),
      payAddress,
    });

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

    const inputBEEF = getMergedBeefForOrdinals(selectedOrdinals);
    if (!inputBEEF) {
      addSnackbar('No transaction data available', 'error');
      setIsProcessing(false);
      return;
    }

    const cancelRes = await cancelListing.execute(apiContext, {
      listing: selectedOrdinals[0],
      inputBEEF,
    });

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
      <Show when={selectedOrdinals.length === 1}>
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
      </Show>
    </>
  );

  const renderTransfers = (outputs: WalletOutput[]) => {
    return outputs.map((output) => {
      const originOutpoint = getTagValue(output.tags, 'origin');
      const outpoint = output.outpoint;
      const name = getOutputName(output);

      return (
        <OrdinalItem theme={theme} key={originOutpoint}>
          <Ordinal
            theme={theme}
            output={output}
            url={`${getContentUrl(originOutpoint || '')}?outpoint=${outpoint}`}
            isTransfer
            size="3rem"
          />
          <OrdinalDetails>
            <OrdinalTitle theme={theme}>{truncate(name, 15, 0)}</OrdinalTitle>
            <Show when={!useSameAddress}>
              <ReceiverInput
                theme={theme}
                placeholder="Receiver Address"
                type="text"
                onChange={(e) => handleAddressChange(outpoint, e.target.value)}
                value={addresses[outpoint] || ''}
              />
              {addressErrors[outpoint] && <span style={{ color: 'red' }}>{addressErrors[outpoint]}</span>}
            </Show>
          </OrdinalDetails>
        </OrdinalItem>
      );
    });
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
                style={{ transform: 'scale(0.8)', width: '1.25rem', height: '1.25rem' }}
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

  const cancelOriginOutpoint = getTagValue(selectedOrdinals[0]?.tags, 'origin');
  const cancel = (
    <ContentWrapper>
      <ConfirmContent>
        <HeaderText style={{ fontSize: '1.35rem' }} theme={theme}>
          {'Cancel Listing'}
        </HeaderText>
        <Ordinal
          theme={theme}
          output={selectedOrdinals[0]}
          url={`${getContentUrl(cancelOriginOutpoint || '')}?outpoint=${selectedOrdinals[0]?.outpoint}`}
          selected
          isTransfer
        />
        <FormContainer noValidate onSubmit={(e) => handleCancelListing(e)}>
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

  const renderOrdinals = (list: WalletOutput[]) => {
    return list
      .filter((output) => {
        const contentType = getTagValue(output.tags, 'type');
        return contentType !== 'application/bsv-20';
      })
      .map((output) => {
        const originOutpoint = getTagValue(output.tags, 'origin');
        const outpoint = output.outpoint;
        return (
          <Ordinal
            theme={theme}
            output={output}
            key={originOutpoint}
            url={`${getContentUrl(originOutpoint || '')}?outpoint=${outpoint}`}
            selected={selectedOrdinals.some((selected) => selected.outpoint === outpoint)}
            onClick={() => toggleOrdinalSelection(output)}
          />
        );
      });
  };

  const nft = (
    <>
      <Show
        when={
          ordinals.filter((output) => {
            const contentType = getTagValue(output.tags, 'type');
            return contentType !== 'application/bsv-20';
          }).length > 0
        }
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
        <Show when={!!selectedOrdinals.length}>
          <Show
            when={selectedOrdinals.length === 1 && hasTag(selectedOrdinals[0].tags, 'list')}
            whenFalseContent={transferAndListButtons}
          >
            <Button
              theme={theme}
              type="warn"
              label="Cancel Listing"
              onClick={async () => {
                if (!selectedOrdinals.length) {
                  addSnackbar('You must select an ordinal!', 'info');
                  return;
                }
                setPageState('cancel');
              }}
            />
          </Show>
        </Show>
      </OrdButtonContainer>
    </>
  );

  const main = <Show when={theme.settings.services.ordinals}>{nft}</Show>;

  const listOriginOutpoint = getTagValue(selectedOrdinals[0]?.tags, 'origin');
  const listName = selectedOrdinals[0] ? getOutputName(selectedOrdinals[0], 'Ordinal') : 'Ordinal';
  const list = (
    <ContentWrapper>
      <ConfirmContent>
        <HeaderText style={{ fontSize: '1.35rem' }} theme={theme}>{`List ${listName}`}</HeaderText>
        <Ordinal
          theme={theme}
          output={selectedOrdinals[0]}
          url={`${getContentUrl(listOriginOutpoint || '')}?outpoint=${selectedOrdinals[0]?.outpoint}`}
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
