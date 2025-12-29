import validate from 'bitcoin-address-validation';
import { useEffect, useState } from 'react';
import { PurchaseOrdinal } from 'yours-wallet-provider';
import type { Txo } from '@1sat/wallet-toolbox';
import type { WalletOutput } from '@bsv/sdk';
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
import { getErrorMessage } from '../../utils/tools';

/** Convert Txo to minimal WalletOutput for Ordinal component */
const txoToWalletOutput = (txo: Txo): WalletOutput => {
  const originData = txo.data?.origin?.data as
    | { outpoint?: string; map?: Record<string, unknown>; insc?: { file?: { type?: string } } }
    | undefined;
  const tags: string[] = [];
  if (originData?.outpoint) tags.push(`origin:${originData.outpoint}`);
  if (originData?.insc?.file?.type) tags.push(`type:${originData.insc.file.type}`);
  if (originData?.map?.name) tags.push(`name:${originData.map.name}`);

  return {
    satoshis: txo.output.satoshis ?? 1,
    spendable: true,
    outpoint: txo.outpoint.toString(),
    tags,
  };
};

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
  const { ordinalService, chromeStorageService, wallet } = useServiceContext();
  const [listingTxo, setListingTxo] = useState<Txo | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const marketplaceAddress = request.marketplaceAddress ?? YOURS_DEV_WALLET;
  const marketplaceRate = request.marketplaceRate ?? GLOBAL_ORDERBOOK_MARKET_RATE;
  const outpoint = request.outpoint;
  const isPasswordRequired = chromeStorageService.isPasswordRequired();
  const baseUrl = wallet.services.baseUrl;

  // Extract token data from Txo
  const bsv21Data = listingTxo?.data?.bsv21?.data as
    | { id?: string; sym?: string; icon?: string; amt?: bigint }
    | undefined;
  const hasTokenData = !!bsv21Data;

  useEffect(() => {
    hideMenu();
    if (!request.outpoint) return;
    const getOrigin = async () => {
      setIsProcessing(true);
      const txo = await wallet.loadTxo(request.outpoint);
      setListingTxo(txo);
      setIsProcessing(false);
      setIsLoaded(true);
    };

    getOrigin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.outpoint]);

  const handlePurchaseOrdinal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!listingTxo) {
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
    const purchaseRes = await ordinalService.purchaseGlobalOrderbookListing(purchaseListing, listingTxo);

    if (!purchaseRes.txid || purchaseRes.error) {
      addSnackbar(getErrorMessage(purchaseRes.error), 'error');
      setIsProcessing(false);
      return;
    }

    addSnackbar('Purchase Successful!', 'success');
    await sleep(2000);
    sendMessage({
      action: 'purchaseOrdinalResponse',
      txid: purchaseRes.txid,
    });
    onResponse();
  };

  const clearRequest = async () => {
    sendMessage({
      action: 'purchaseOrdinalResponse',
      error: 'User cancelled the request',
    });
    await chromeStorageService.remove('purchaseOrdinalRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  // Extract origin data for content URL
  const originData = listingTxo?.data?.origin?.data as { outpoint?: string; map?: Record<string, unknown> } | undefined;
  const originOutpoint = originData?.outpoint;
  const listData = listingTxo?.data?.list?.data as { price?: number } | undefined;
  const price = listData?.price ?? 0;
  const tokenName = bsv21Data?.sym || (originData?.map?.name as string) || 'Unknown Token';

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message={isLoaded ? 'Purchasing Ordinal...' : 'Processing...'} />
      </Show>

      <Show when={!isProcessing && !!request && !!listingTxo}>
        <ConfirmContent>
          <Show
            when={!hasTokenData}
            whenFalseContent={
              <TokenIcon src={bsv21Data?.icon ? `${baseUrl}/content/${bsv21Data.icon}` : GENERIC_TOKEN_ICON} />
            }
          >
            <Ordinal
              output={txoToWalletOutput(listingTxo!)}
              theme={theme}
              url={`${baseUrl}/content/${originOutpoint}`}
              selected={true}
            />
          </Show>
          <HeaderText theme={theme}>Purchase Request</HeaderText>
          <Show when={hasTokenData}>
            <Text theme={theme} style={{ color: theme.color.global.gray }}>
              {tokenName}
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
                (price * (1 + marketplaceRate) + (hasTokenData ? BSV20_INDEX_FEE : 0)) /
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
