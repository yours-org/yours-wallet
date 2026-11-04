import { AnimatePresence, motion } from 'framer-motion';
import { Coins } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { useServiceContext } from '../hooks/useServiceContext';
import { ChromeStorageObject } from '../services/types/chromeStorage.types';
import type { WalletToken } from '../services/walletTokens';
import { Theme } from '../theme.types';
import { showAmount, truncate } from '../utils/format';
import { AssetRow } from './AssetRow';
import { Show } from './Show';

export type TokensListProps = {
  tokens: WalletToken[];
  theme: Theme;
  hideStatusLabels?: boolean;
  onTokenClick: (token: WalletToken) => void;
};

/**
 * The fungible tokens (BSV21 and 1Color) in the favourites order, draggable
 * to reorder; a token with a pending amount is listed again under Pending.
 */
export const TokensList = (props: TokensListProps) => {
  const { tokens: tokensProp, theme, onTokenClick, hideStatusLabels = false } = props;
  const { chromeStorageService } = useServiceContext();
  const [tokens, setTokens] = useState<WalletToken[]>([]);

  useEffect(() => {
    if (!tokensProp.length) {
      setTokens([]);
      return;
    }
    const { account } = chromeStorageService.getCurrentAccountObject();
    const favoriteTokenIds = account?.settings?.favoriteTokens || [];
    const ordered = favoriteTokenIds
      .map((id) => tokensProp.find((token) => token.id === id))
      .filter((t): t is WalletToken => !!t);
    setTokens(ordered.length ? ordered : tokensProp);
    // Re-run when the parent's list changes (e.g. favorites edited in Manage Tokens).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokensProp]);

  const handleOnDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const reorderedTokens = Array.from(tokens);
    const [removed] = reorderedTokens.splice(result.source.index, 1);
    reorderedTokens.splice(result.destination.index, 0, removed);

    setTokens(reorderedTokens);
    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) return;
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [account.addresses.identityAddress]: {
        ...account,
        settings: { ...account.settings, favoriteTokens: reorderedTokens.map((t) => t.id) },
      },
    };
    await chromeStorageService.updateNested(key, update);
  };

  const confirmedTokens = tokens.filter((t) => t.confirmed > 0n);
  const pendingTokens = tokensProp.filter((t) => t.pending > 0n);

  return (
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
        <Droppable droppableId="tokens-list">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="flex flex-col items-center overflow-y-auto overflow-x-hidden w-full"
              style={hideStatusLabels ? undefined : { height: 'calc(100% - 4rem)' }}
            >
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
                  {confirmedTokens.map((t, index) => (
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
                            balance={Number(showAmount(t.confirmed, t.dec))}
                            decimals={t.dec}
                            showPointer={true}
                            icon={t.icon}
                            ticker={truncate(t.name, 10, 0)}
                            usdBalance={0}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                </AnimatePresence>
              </div>

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
                  {pendingTokens.map((t) => (
                    <div
                      key={t.id}
                      style={{ display: 'flex', justifyContent: 'center', width: '100%' }}
                      onClick={() => onTokenClick(t)}
                    >
                      <AssetRow
                        animate
                        balance={Number(showAmount(t.pending, t.dec))}
                        decimals={t.dec}
                        showPointer={true}
                        icon={t.icon}
                        ticker={t.name}
                        usdBalance={0}
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
  );
};
