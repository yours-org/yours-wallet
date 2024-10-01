import { styled } from 'styled-components';
import { Text } from './Reusable';
import { Show } from './Show';
import { Bsv20 } from 'yours-wallet-provider';
import { Theme } from '../theme.types';
import { SubHeaderText } from './Reusable';
import { AssetRow } from './AssetRow';
import { showAmount } from '../utils/ordi';
import { useServiceContext } from '../hooks/useServiceContext';
import { truncate } from '../utils/format';
import { BSV_DECIMAL_CONVERSION, GENERIC_TOKEN_ICON } from '../utils/constants';
import { useEffect, useState } from 'react';

const NoInscriptionWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 8rem;
  width: 100%;
`;

const BSV20List = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  height: calc(100% - 4rem);
`;

export const BSV20Header = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  margin-left: 1rem;
`;

type PriceData = {
  id: string;
  satPrice: number;
};

export type Bsv20TokensListProps = {
  bsv20s: Bsv20[];
  theme: Theme;
  hideStatusLabels?: boolean;
  onTokenClick: (token: Bsv20) => void;
};

export const Bsv20TokensList = (props: Bsv20TokensListProps) => {
  const { bsv20s, theme, onTokenClick, hideStatusLabels = false } = props;
  const { gorillaPoolService, ordinalService, bsvService, chromeStorageService } = useServiceContext();
  const network = chromeStorageService.getNetwork();
  const [priceData, setPriceData] = useState<PriceData[]>([]);

  useEffect(() => {
    if (!bsv20s.length) return;
    (async () => {
      const data = await gorillaPoolService.getTokenPriceInSats(bsv20s.map((d) => d?.id || ''));
      setPriceData(data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bsv20s]);

  return (
    <>
      <Show
        when={bsv20s.length > 0 || hideStatusLabels}
        whenFalseContent={
          <NoInscriptionWrapper>
            <Text
              theme={theme}
              style={{
                color: theme.color.global.gray,
                fontSize: '1rem',
                marginTop: '4rem',
              }}
            >
              {theme.settings.services.bsv20
                ? "You don't have any tokens"
                : 'Wallet configuration does not support tokens!'}
            </Text>
          </NoInscriptionWrapper>
        }
      >
        <BSV20List>
          <>
            <Show when={!hideStatusLabels}>
              <BSV20Header>
                <SubHeaderText style={{ margin: '0.5rem 0 0 1rem', color: theme.color.global.gray }} theme={theme}>
                  Confirmed
                </SubHeaderText>
              </BSV20Header>
            </Show>
            <div style={{ width: '100%' }}>
              {bsv20s
                .filter((d) => d.all.confirmed > 0n)
                .map((b) => {
                  return (
                    <div
                      key={b.id}
                      style={{ display: 'flex', justifyContent: 'center', width: '100%' }}
                      onClick={() => onTokenClick(b)}
                    >
                      <AssetRow
                        animate
                        balance={Number(showAmount(b.all.confirmed, b.dec))}
                        showPointer={true}
                        icon={
                          b.icon ? `${gorillaPoolService.getBaseUrl(network)}/content/${b.icon}` : GENERIC_TOKEN_ICON
                        }
                        ticker={truncate(ordinalService.getTokenName(b), 10, 0)}
                        usdBalance={
                          (priceData.find((p) => p.id === b.id)?.satPrice ?? 0) *
                          (bsvService.getExchangeRate() / BSV_DECIMAL_CONVERSION) *
                          Number(showAmount(b.all.confirmed, b.dec))
                        }
                      />
                    </div>
                  );
                })}
            </div>

            <Show when={bsv20s.filter((d) => d.all.pending > 0n).length > 0}>
              <Show when={!hideStatusLabels}>
                <BSV20Header style={{ marginTop: '2rem' }}>
                  <SubHeaderText style={{ marginLeft: '1rem', color: theme.color.global.gray }} theme={theme}>
                    Pending
                  </SubHeaderText>
                </BSV20Header>
              </Show>
              <div style={{ width: '100%' }}>
                {bsv20s
                  .filter((d) => d.all.pending > 0n)
                  .map((b) => {
                    return (
                      <div
                        style={{ display: 'flex', justifyContent: 'center', width: '100%' }}
                        onClick={() => onTokenClick(b)}
                      >
                        <AssetRow
                          animate
                          balance={Number(showAmount(b.all.pending, b.dec))}
                          showPointer={true}
                          icon={
                            b.icon ? `${gorillaPoolService.getBaseUrl(network)}/content/${b.icon}` : GENERIC_TOKEN_ICON
                          }
                          ticker={ordinalService.getTokenName(b)}
                          usdBalance={
                            (priceData.find((p) => p.id === b.id)?.satPrice ?? 0) *
                            (bsvService.getExchangeRate() / BSV_DECIMAL_CONVERSION) *
                            Number(showAmount(b.all.confirmed, b.dec))
                          }
                        />
                      </div>
                    );
                  })}
              </div>
            </Show>
          </>
        </BSV20List>
      </Show>
    </>
  );
};
