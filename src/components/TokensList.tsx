import { AnimatePresence, motion } from 'framer-motion';
import { Coins } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { useServiceContext } from '../hooks/useServiceContext';
import { ChromeStorageObject } from '../services/types/chromeStorage.types';
import type { WalletToken } from '../services/walletTokens';
import { Theme } from '../theme.types';
import { showAmount, truncate } from '../utils/format';
import { tokenUsdValue } from '../services/oneColorPrices';
import { AssetRow } from './AssetRow';
import { Show } from './Show';

export type TokensListProps = {
  tokens: WalletToken[];
  theme: Theme;
  /** BSV per whole token by token id, for the tokens that have a pool price. */
  prices?: Map<string, number>;
  /** BSV/USD, for turning a token's BSV price into dollars. */
  bsvUsdRate?: number;
  onTokenClick: (token: WalletToken) => void;
};

/** The pending pill for a token: how much, and why it is not spendable yet. */
const pendingOf = (t: WalletToken) => ({
  label: `${showAmount(t.pending, t.dec)} pending`,
  hint:
    t.kind === '1color'
      ? 'Held by a send that the recipient has not claimed yet. It becomes spendable again when that send settles or expires.'
      : 'Waiting for the network to confirm it.',
});

/**
 * The fungible tokens (BSV21 and 1Color) in the favourites order, draggable
 * to reorder. One row per token: its whole balance, with the part that is not
 * spendable yet (unconfirmed, or held by a pending send) called out under it.
 */
export const TokensList = (props: TokensListProps) => {
  const { tokens: tokensProp, theme, onTokenClick, prices, bsvUsdRate = 0 } = props;
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

  return (
    <Show
      when={tokens.length > 0}
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
        <Droppable droppableId="tokens">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="flex flex-col items-center overflow-y-auto overflow-x-hidden w-full"
            >
              <div className="w-full">
                <AnimatePresence initial={false}>
                  {tokens.map((t, index) => {
                    const total = t.confirmed + t.pending;
                    return (
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
                              balance={Number(showAmount(total, t.dec))}
                              decimals={t.dec}
                              showPointer={true}
                              icon={t.icon}
                              ticker={truncate(t.name, 10, 0)}
                              pending={t.pending > 0n ? pendingOf(t) : undefined}
                              usdBalance={tokenUsdValue(total, t.dec, prices?.get(t.id), bsvUsdRate)}
                            />
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                </AnimatePresence>
              </div>

              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </Show>
  );
};
