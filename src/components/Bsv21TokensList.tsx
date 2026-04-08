import { AnimatePresence, motion } from 'framer-motion';
import { Coins } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from 'react-beautiful-dnd';
import { ONESAT_MAINNET_CONTENT_URL, type Bsv21Balance } from '@1sat/actions';
import { useServiceContext } from '../hooks/useServiceContext';
import { ChromeStorageObject } from '../services/types/chromeStorage.types';
import { Theme } from '../theme.types';
import { BSV_DECIMAL_CONVERSION, GENERIC_TOKEN_ICON } from '../utils/constants';
import { showAmount, truncate } from '../utils/format';
import { fetchExchangeRate } from '../utils/wallet';
import { AssetRow } from './AssetRow';
import { Show } from './Show';

const getContentUrl = (outpoint: string) => `${ONESAT_MAINNET_CONTENT_URL}/${outpoint}`;

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

  const handleOnDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

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

    await chromeStorageService.updateNested(key, update);
  };

  const confirmedTokens = tokens.filter((t) => t.all.confirmed > 0n);
  const pendingTokens = tokensProp.filter((d) => d.all.pending > 0n);

  return (
    <>
      <Show
        when={tokens.length > 0 || hideStatusLabels}
        whenFalseContent={
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center mt-32 w-full gap-3"
          >
            <div
              className="flex items-center justify-center w-12 h-12 rounded-full"
              style={{ backgroundColor: theme.color.global.row }}
            >
              <Coins size={20} style={{ color: theme.color.global.gray }} />
            </div>
            <p className="text-sm text-center" style={{ color: theme.color.global.gray }}>
              {theme.settings.services.bsv21
                ? "You don't have any tokens"
                : 'Wallet configuration does not support tokens!'}
            </p>
          </motion.div>
        }
      >
        <DragDropContext onDragEnd={handleOnDragEnd}>
          <Droppable droppableId="bsv21-list">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex flex-col items-center overflow-y-auto overflow-x-hidden w-full"
                style={{ height: 'calc(100% - 4rem)' }}
              >
                {/* Confirmed section */}
                <Show when={!hideStatusLabels && confirmedTokens.length > 0}>
                  <div className="w-full px-5 pt-3 pb-1">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: theme.color.global.gray }}
                    >
                      Confirmed
                    </span>
                  </div>
                </Show>

                <div className="w-full">
                  <AnimatePresence initial={false}>
                    {confirmedTokens.map(
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
                  </AnimatePresence>
                </div>

                {/* Pending section */}
                <Show when={pendingTokens.length > 0}>
                  <Show when={!hideStatusLabels}>
                    <div className="w-full px-5 pt-4 pb-1">
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: theme.color.global.gray }}
                      >
                        Pending
                      </span>
                    </div>
                  </Show>

                  <div className="w-full">
                    {pendingTokens.map((b) => (
                      <div
                        key={b.id}
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
                    ))}
                  </div>
                </Show>

                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </Show>
    </>
  );
};
