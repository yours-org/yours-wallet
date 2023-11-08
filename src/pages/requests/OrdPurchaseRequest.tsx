import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { PurchaseOrdinal, useOrds } from '../../hooks/useOrds';
import { Show } from '../../components/Show';
import { useSnackbar } from '../../hooks/useSnackbar';
import { PageLoader } from '../../components/PageLoader';
import validate from 'bitcoin-address-validation';
import { sleep } from '../../utils/sleep';
import { useTheme } from '../../hooks/useTheme';
import { Input } from '../../components/Input';
import { Ordinal } from '../../components/Ordinal';
import { useWeb3Context } from '../../hooks/useWeb3Context';
import { BSV_DECIMAL_CONVERSION, GLOBAL_ORDERBOOK_MARKET_RATE, PANDA_DEV_WALLET } from '../../utils/constants';
import { useGorillaPool } from '../../hooks/useGorillaPool';
import { OrdinalTxo } from '../../hooks/ordTypes';
import { storage } from '../../utils/storage';

export type Web3PurchaseOrdinalRequest = {
  outpoint: string;
  marketplaceRate?: number;
  marketplaceAddress?: string;
};

export type OrdPurchaseRequestProps = {
  web3Request: Web3PurchaseOrdinalRequest;
  popupId: number | undefined;
  onResponse: () => void;
};

export const OrdPurchaseRequest = (props: OrdPurchaseRequestProps) => {
  const { web3Request, popupId, onResponse } = props;
  const { theme } = useTheme();
  const { ordAddress, getOrdinals, isProcessing, purchaseGlobalOrderbookListing, setIsProcessing, getOrdinalsBaseUrl } =
    useOrds();
  const { getUtxoByOutpoint } = useGorillaPool();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const { isPasswordRequired } = useWeb3Context();
  const [inscription, setInscription] = useState<OrdinalTxo | undefined>();
  const marketplaceAddress = web3Request.marketplaceAddress ?? PANDA_DEV_WALLET;
  const marketplaceRate = web3Request.marketplaceRate ?? GLOBAL_ORDERBOOK_MARKET_RATE;
  const outpoint = web3Request.outpoint;

  useEffect(() => {
    if (!web3Request.outpoint) return;
    const getOrigin = async () => {
      const res = await getUtxoByOutpoint(web3Request.outpoint);
      setInscription(res);
    };

    getOrigin();
  }, [getUtxoByOutpoint, web3Request.outpoint]);

  useEffect(() => {
    if (!successTxId) return;
    if (!message && ordAddress) {
      resetSendState();
      getOrdinals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId, message, getOrdinals, ordAddress]);

  useEffect(() => {

    const onbeforeunloadFn = () => {
      storage.remove('purchaseOrdinalRequest');
    }

    window.addEventListener('beforeunload', onbeforeunloadFn);
    return () => {
      window.removeEventListener('beforeunload', onbeforeunloadFn);
    }
  }, [])

  const resetSendState = () => {
    setPasswordConfirm('');
    setSuccessTxId('');
    setInscription(undefined);
    setIsProcessing(false);
  };

  const handlePurchaseOrdinal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);
    if (!validate(marketplaceAddress)) {
      addSnackbar('Invalid address detected!', 'info');
      setIsProcessing(false);
      return;
    }

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    const purchaseListing: PurchaseOrdinal = {
      marketplaceAddress,
      marketplaceRate,
      outpoint,
      password: passwordConfirm,
    };
    const purchaseRes = await purchaseGlobalOrderbookListing(purchaseListing);

    if (!purchaseRes.txid || purchaseRes.error) {
      const message =
        purchaseRes.error === 'invalid-password'
          ? 'Invalid Password!'
          : purchaseRes.error === 'insufficient-funds'
          ? 'Insufficient Funds!'
          : purchaseRes.error === 'no-ord-utxo'
          ? 'Could not locate the ordinal!'
          : 'An unknown error has occurred! Try again.';

      addSnackbar(message, 'error');
      setIsProcessing(false);
      return;
    }

    chrome.runtime.sendMessage({
      action: 'purchaseOrdinalResponse',
      txid: purchaseRes.txid,
    });

    setSuccessTxId(purchaseRes.txid);
    addSnackbar('Purchase Successful!', 'success');
    setTimeout(async () => {
      onResponse();
      storage.remove('purchaseOrdinalRequest');
      if (popupId) chrome.windows.remove(popupId);
    }, 2000);

  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Purchasing Ordinal..." />
      </Show>

      <Show when={!isProcessing && !!web3Request && !!inscription}>
        <ConfirmContent>
          <HeaderText theme={theme}>Purchase Request</HeaderText>
          <Ordinal
            inscription={inscription as OrdinalTxo}
            theme={theme}
            url={`${getOrdinalsBaseUrl()}/content/${inscription?.origin?.outpoint.toString()}`}
            selected={true}
          />
          <FormContainer noValidate onSubmit={(e) => handlePurchaseOrdinal(e)}>
            <Show when={isPasswordRequired}>
              <Input
                theme={theme}
                placeholder="Password"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </Show>
            <Text theme={theme} style={{ margin: '1rem 0 1rem' }}>
              Double check details before sending.
            </Text>
            <Button
              theme={theme}
              type="primary"
              label={`Pay ${(
                (Number(inscription?.data?.list?.price) * (1 + marketplaceRate)) /
                BSV_DECIMAL_CONVERSION
              ).toFixed(8)} BSV`}
              disabled={isProcessing}
              isSubmit
            />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
