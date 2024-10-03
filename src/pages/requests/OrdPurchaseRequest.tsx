import validate from 'bitcoin-address-validation';
import { useEffect, useState } from 'react';
import { Ordinal as OrdinalType, PurchaseOrdinal } from 'yours-wallet-provider';
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
import {
  BSV20_INDEX_FEE,
  BSV_DECIMAL_CONVERSION,
  GENERIC_TOKEN_ICON,
  GLOBAL_ORDERBOOK_MARKET_RATE,
  YOURS_DEV_WALLET,
} from '../../utils/constants';
import { sleep } from '../../utils/sleep';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { styled } from 'styled-components';
import { Token } from '../../services/types/gorillaPool.types';

const TokenIcon = styled.img`
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
`;

export type OrdPurchaseRequestProps = {
  request: PurchaseOrdinal & { password?: string };
  popupId: number | undefined;
  onResponse: () => void;
};

export const OrdPurchaseRequest = (props: OrdPurchaseRequestProps) => {
  const { request, popupId, onResponse } = props;
  const { theme } = useTheme();
  const { hideMenu } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const { addSnackbar } = useSnackbar();
  const { gorillaPoolService, ordinalService, chromeStorageService } = useServiceContext();
  const [inscription, setInscription] = useState<OrdinalType | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [tokenDetails, setTokenDetails] = useState<Token>();
  const [isLoaded, setIsLoaded] = useState(false);
  const marketplaceAddress = request.marketplaceAddress ?? YOURS_DEV_WALLET;
  const marketplaceRate = request.marketplaceRate ?? GLOBAL_ORDERBOOK_MARKET_RATE;
  const outpoint = request.outpoint;
  const isPasswordRequired = chromeStorageService.isPasswordRequired();
  const network = chromeStorageService.getNetwork();

  useEffect(() => {
    hideMenu();
    if (!request.outpoint) return;
    const getOrigin = async () => {
      setIsProcessing(true);
      const res = await gorillaPoolService.getUtxoByOutpoint(request.outpoint);
      setInscription(res);
      if (res?.data?.bsv20) {
        const tokenDetails = await gorillaPoolService.getBsv20Details(
          res?.data.bsv20?.id || res.data.bsv20?.tick || '',
        );
        setTokenDetails(tokenDetails);
      }
      setIsProcessing(false);
      setIsLoaded(true);
    };

    getOrigin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.outpoint]);

  const handlePurchaseOrdinal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inscription) {
      addSnackbar('Could not locate the ordinal!', 'error');
      return;
    }
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
    const purchaseRes = await ordinalService.purchaseGlobalOrderbookListing(purchaseListing, inscription, tokenDetails);

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

    addSnackbar('Purchase Successful!', 'success');
    await sleep(2000);
    sendMessage({
      action: 'purchaseOrdinalResponse',
      txid: purchaseRes.txid,
    });
    setIsProcessing(false);
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
        <PageLoader theme={theme} message={isLoaded ? 'Purchasing Ordinal...' : 'Processing...'} />
      </Show>

      <Show when={!isProcessing && !!request && !!inscription}>
        <ConfirmContent>
          <Show
            when={!tokenDetails}
            whenFalseContent={
              <TokenIcon
                src={
                  tokenDetails?.icon
                    ? `${gorillaPoolService.getBaseUrl(chromeStorageService.getNetwork())}/content/${tokenDetails.icon}`
                    : GENERIC_TOKEN_ICON
                }
              />
            }
          >
            <Ordinal
              inscription={inscription as OrdinalType}
              theme={theme}
              url={`${gorillaPoolService.getBaseUrl(network)}/content/${inscription?.origin?.outpoint}`}
              selected={true}
            />
          </Show>
          <HeaderText theme={theme}>Purchase Request</HeaderText>
          <Show when={!!tokenDetails}>
            <Text theme={theme} style={{ color: theme.color.global.gray }}>
              {tokenDetails?.sym || tokenDetails?.tick || inscription?.origin?.data?.map?.name || 'Unknown Token'}
            </Text>
          </Show>
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
                (Number(inscription?.data?.list?.price) * (1 + marketplaceRate) +
                  (tokenDetails ? BSV20_INDEX_FEE : 0)) /
                BSV_DECIMAL_CONVERSION
              ).toFixed(8)} BSV`}
              disabled={isProcessing}
              isSubmit
            />
            <Button theme={theme} type="secondary" label="Cancel" onClick={clearRequest} disabled={isProcessing} />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
