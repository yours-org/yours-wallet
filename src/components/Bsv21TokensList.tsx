import { styled } from 'styled-components';
import { Text } from './Reusable';
import { Show } from './Show';
import { Theme } from '../theme.types';
import { SubHeaderText } from './Reusable';
import { AssetRow } from './AssetRow';
import { showAmount } from '../utils/format';
import { useServiceContext } from '../hooks/useServiceContext';
import { truncate } from '../utils/format';
import { BSV_DECIMAL_CONVERSION, GENERIC_TOKEN_ICON } from '../utils/constants';
import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { ChromeStorageObject } from '../services/types/chromeStorage.types';
import { ONESAT_MAINNET_CONTENT_URL, type Bsv21Balance } from '@1sat/actions';
import { fetchExchangeRate } from '../utils/wallet';

const getContentUrl = (outpoint: string) => `${ONESAT_MAINNET_CONTENT_URL}/${outpoint}`;

const NoInscriptionWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 8rem;
  width: 100%;
`;

const TokenList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  height: calc(100% - 4rem);
`;

const TokenHeader = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  margin-left: 1rem;
`;

type PriceData = {
  id: string;
  satPrice: number;
};

export type Bsv21TokensListProps = {
  tokens: Bsv21Balance[];
  theme: Theme;
  hideStatusLabels?: boolean;
  onTokenClick: (token: Bsv21Balance) => void;
};

const getTokenName = (b: Bsv21Balance): string => b.sym || 'Null';

export const Bsv21TokensList = (props: Bsv21TokensListProps) => {
  const { tokens: tokensProp, theme, onTokenClick, hideStatusLabels = false } = props;
  const { chromeStorageService, apiContext } = useServiceContext();
  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [tokens, setTokens] = useState<Bsv21Balance[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(0);

  useEffect(() => {
    const loadExchangeRate = async () => {
      const rate = await fetchExchangeRate(apiContext.chain, apiContext.wocApiKey);
      setExchangeRate(rate);
    };
    loadExchangeRate();
  }, [apiContext]);

  useEffect(() => {
    const loadSavedTokens = async () => {
      if (!tokensProp.length) return;
      const { account } = chromeStorageService.getCurrentAccountObject();
      if (!account) return;
      const favoriteTokenIds = account?.settings?.favoriteTokens || [];

      const orderedTokens = favoriteTokenIds
        .map((id) => tokensProp.find((token) => token.id === id))
        .filter(Boolean) as Bsv21Balance[];

      // TODO: Re-implement token price fetching with new API
      const data: PriceData[] = [];
      setTokens(orderedTokens.length ? orderedTokens : tokensProp);
      setPriceData(data);
    };

    loadSavedTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle drag end event
  const handleOnDragEnd = async (result: DropResult) => {
    if (!result.destination) return; // dropped outside the list

    const reorderedTokens = Array.from(tokens);
    const [removed] = reorderedTokens.splice(result.source.index, 1);
    reorderedTokens.splice(result.destination.index, 0, removed);

    setTokens(reorderedTokens);
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) return;
    const key: keyof ChromeStorageObject = 'accounts';

    const favoriteTokens = reorderedTokens.map((t) => t.id).filter((t) => t) as string[];

    const update: Partial<ChromeStorageObject['accounts']> = {
      [account.addresses.identityAddress]: {
        ...account,
        settings: {
          ...account.settings,
          favoriteTokens,
        },
      },
    };

    await chromeStorageService.updateNested(key, update); // Save the new order
  };

  return (
    <>
      <Show
        when={tokens.length > 0 || hideStatusLabels}
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
              {theme.settings.services.bsv21
                ? "You don't have any tokens"
                : 'Wallet configuration does not support tokens!'}
            </Text>
          </NoInscriptionWrapper>
        }
      >
        <DragDropContext onDragEnd={handleOnDragEnd}>
          <Droppable droppableId="bsv21-list">
            {(provided) => (
              <TokenList ref={provided.innerRef} {...provided.droppableProps}>
                <>
                  <Show when={!hideStatusLabels}>
                    <TokenHeader>
                      <SubHeaderText
                        style={{ margin: '0.5rem 0 0 1rem', color: theme.color.global.gray }}
                        theme={theme}
                      >
                        Confirmed
                      </SubHeaderText>
                    </TokenHeader>
                  </Show>
                  <div style={{ width: '100%' }}>
                    {tokens
                      .filter((t) => t.all.confirmed > 0n)
                      .map(
                        (t, index) =>
                          t.id && (
                            <Draggable key={t.id} draggableId={t.id} index={index}>
                              {(provided) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  style={{
                                    ...provided.draggableProps.style,
                                    display: 'flex',
                                    justifyContent: 'center',
                                    width: '100%',
                                  }}
                                  onClick={() => onTokenClick(t)}
                                >
                                  <AssetRow
                                    animate
                                    balance={Number(showAmount(t.all.confirmed, t.dec))}
                                    showPointer={true}
                                    icon={t.icon ? getContentUrl(t.icon) : GENERIC_TOKEN_ICON}
                                    ticker={truncate(getTokenName(t), 10, 0)}
                                    usdBalance={
                                      (priceData.find((p) => p.id === t.id)?.satPrice ?? 0) *
                                      (exchangeRate / BSV_DECIMAL_CONVERSION) *
                                      Number(showAmount(t.all.confirmed, t.dec))
                                    }
                                  />
                                </div>
                              )}
                            </Draggable>
                          ),
                      )}
                  </div>
                  <Show when={tokensProp.filter((d) => d.all.pending > 0n).length > 0}>
                    <Show when={!hideStatusLabels}>
                      <TokenHeader style={{ marginTop: '2rem' }}>
                        <SubHeaderText style={{ marginLeft: '1rem', color: theme.color.global.gray }} theme={theme}>
                          Pending
                        </SubHeaderText>
                      </TokenHeader>
                    </Show>
                    <div style={{ width: '100%' }}>
                      {tokensProp
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
                                icon={b.icon ? getContentUrl(b.icon) : GENERIC_TOKEN_ICON}
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
                    </div>
                  </Show>
                  {provided.placeholder}
                </>
              </TokenList>
            )}
          </Droppable>
        </DragDropContext>
      </Show>
    </>
  );
};
