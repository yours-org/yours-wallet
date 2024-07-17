import validate from 'bitcoin-address-validation';
import { useEffect, useState } from 'react';
import { Ordinal as OrdinalType, PurchaseOrdinal } from 'yours-wallet-provider';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Ordinal } from '../../components/Ordinal';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useServiceContext } from '../../hooks/useServiceContext';
import { removeWindow, sendMessage } from '../../utils/chromeHelpers';
import { BSV_DECIMAL_CONVERSION, GLOBAL_ORDERBOOK_MARKET_RATE, YOURS_DEV_WALLET } from '../../utils/constants';
import { sleep } from '../../utils/sleep';

export type OrdPurchaseRequestProps = {
  request: PurchaseOrdinal & { password?: string };
  popupId: number | undefined;
  onResponse: () => void;
};

export const OrdPurchaseRequest = (props: OrdPurchaseRequestProps) => {
  const { request, popupId, onResponse } = props;
  const { theme } = useTheme();
  // const { ordAddress, getOrdinals, isProcessing, purchaseGlobalOrderbookListing, setIsProcessing, getOrdinalsBaseUrl } =
  //   useOrds();
  // const { getUtxoByOutpoint } = useGorillaPool();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const { gorillaPoolService, ordinalService, chromeStorageService, keysService } = useServiceContext();
  const { ordAddress } = keysService;
  const [inscription, setInscription] = useState<OrdinalType | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const marketplaceAddress = request.marketplaceAddress ?? YOURS_DEV_WALLET;
  const marketplaceRate = request.marketplaceRate ?? GLOBAL_ORDERBOOK_MARKET_RATE;
  const outpoint = request.outpoint;
  const isPasswordRequired = chromeStorageService.isPasswordRequired();
  const network = chromeStorageService.getNetwork();

  useEffect(() => {
    if (!request.outpoint) return;
    const getOrigin = async () => {
      const res = await gorillaPoolService.getUtxoByOutpoint(request.outpoint);
      setInscription(res);
    };

    getOrigin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.outpoint]);

  // useEffect(() => {
  //   if (!successTxId) return;
  //   if (!message && ordAddress) {
  //     resetSendState();
  //     ordinalService.getAndSetOrdinals(ordAddress);
  //   }
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [successTxId, message, ordAddress]);

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

    const purchaseListing: PurchaseOrdinal & { password: string } = {
      marketplaceAddress,
      marketplaceRate,
      outpoint,
      password: passwordConfirm,
    };
    const purchaseRes = await ordinalService.purchaseGlobalOrderbookListing(purchaseListing);

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

    sendMessage({
      action: 'purchaseOrdinalResponse',
      txid: purchaseRes.txid,
    });

    setSuccessTxId(purchaseRes.txid);
    addSnackbar('Purchase Successful!', 'success');
    onResponse();
  };

  const clearRequest = async () => {
    await chromeStorageService.remove('purchaseOrdinalRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Purchasing Ordinal..." />
      </Show>

      <Show when={!isProcessing && !!request && !!inscription}>
        <ConfirmContent>
          <BackButton onClick={clearRequest} />
          <HeaderText theme={theme}>Purchase Request</HeaderText>
          <Ordinal
            inscription={inscription as OrdinalType}
            theme={theme}
            url={`${gorillaPoolService.getBaseUrl(network)}/content/${inscription?.origin?.outpoint.toString()}`}
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
