import type { Bsv21Balance } from '@1sat/actions';
import { ONESAT_MAINNET_CONTENT_URL } from '@1sat/actions';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Search, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useServiceContext } from '../hooks/useServiceContext';
import { Theme } from '../theme.types';
import { GENERIC_TOKEN_ICON } from '../utils/constants';
import { truncate } from '../utils/format';
import { isUri } from '../utils/uri';
import { ChromeStorageObject } from '../services/types/chromeStorage.types';
import { ToggleSwitch } from './ToggleSwitch';

const resolveIcon = (icon: string) =>
  isUri(icon) ? icon : `${ONESAT_MAINNET_CONTENT_URL}/${icon}`;

export type ManageTokensProps = {
  tokens: Bsv21Balance[];
  theme: Theme;
  onBack: () => void;
};

export const ManageTokens = (props: ManageTokensProps) => {
  const { tokens: tokensProp, theme, onBack } = props;
  const { chromeStorageService } = useServiceContext();
  const [favoriteTokens, setFavoriteTokens] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const { account } = chromeStorageService.getCurrentAccountObject();
    setFavoriteTokens(account?.settings?.favoriteTokens || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleFavorite = async (tokenId: string) => {
    setFavoriteTokens((prev) => (prev.includes(tokenId) ? prev.filter((id) => id !== tokenId) : [...prev, tokenId]));

    const { account, selectedAccount } = chromeStorageService.getCurrentAccountObject();
    if (!account || !selectedAccount) return;
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [selectedAccount]: {
        ...account,
        settings: {
          ...account.settings,
          favoriteTokens: favoriteTokens.includes(tokenId)
            ? favoriteTokens.filter((id) => id !== tokenId)
            : favoriteTokens.concat(tokenId),
        },
      },
    };
    await chromeStorageService.updateNested(key, update);
  };

  const getTokenName = (b: Bsv21Balance): string => b.sym || 'Null';

  const filteredTokens = tokensProp
    .filter(
      (b) =>
        getTokenName(b).toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b?.id && b.id.toLowerCase().includes(searchQuery.toLowerCase())),
    )
    .sort((a, b) => {
      const aLabel = a.sym ?? '';
      const bLabel = b.sym ?? '';
      return aLabel.toLowerCase().localeCompare(bLabel.toLowerCase());
    });

  return (
    <motion.div
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 35 }}
      className="flex flex-col items-center w-full pt-14 pb-20 overflow-y-auto overflow-x-hidden self-start"
      style={{ height: '100%', backgroundColor: theme.color.global.walletBackground }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 w-full px-4 mb-5">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 outline-none border-none cursor-pointer"
          style={{ backgroundColor: '#17191E' }}
        >
          <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
        </motion.button>
        <span className="text-base font-bold" style={{ color: theme.color.global.contrast }}>
          Manage Token List
        </span>
      </div>

      {/* Search */}
      <div className="relative w-[92%] mb-3">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: theme.color.global.gray }}
        />
        <input
          type="text"
          placeholder="Search by name or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-9 pl-8 pr-4 rounded-xl text-sm outline-none border transition-all duration-200"
          style={{
            backgroundColor: theme.color.global.row,
            borderColor: theme.color.global.gray + '40',
            color: theme.color.global.contrast,
          }}
        />
      </div>

      {/* Token rows */}
      <div className="flex flex-col w-full px-3 gap-1">
        <AnimatePresence initial={false}>
          {filteredTokens.length > 0 ? (
            filteredTokens.map((t, i) => {
              const isFav = !!(t?.id && favoriteTokens.includes(t.id));
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: i * 0.03, type: 'spring', stiffness: 400, damping: 35 }}
                  className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl"
                  style={{
                    backgroundColor: theme.color.global.row,
                    border: `1px solid ${theme.color.global.gray}14`,
                  }}
                >
                  {/* Left: icon + name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={t.icon ? resolveIcon(t.icon) : GENERIC_TOKEN_ICON}
                      alt={getTokenName(t)}
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    />
                    <div className="flex flex-col items-start min-w-0">
                      <span
                        className="text-sm font-semibold leading-tight"
                        style={{ color: theme.color.global.contrast }}
                      >
                        {getTokenName(t)}
                      </span>
                      <span className="text-xs mt-0.5" style={{ color: theme.color.global.gray }}>
                        {t?.id ? truncate(t.id, 5, 5) : ''}
                      </span>
                    </div>
                  </div>

                  {/* Right: toggle */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={() => t?.id && handleToggleFavorite(t.id)}
                      className="outline-none border-none bg-transparent cursor-pointer p-1"
                    >
                      <Star
                        size={16}
                        fill={isFav ? theme.color.component.primaryButtonLeftGradient : 'none'}
                        style={{
                          color: isFav ? theme.color.component.primaryButtonLeftGradient : theme.color.global.gray,
                          transition: 'color 0.2s, fill 0.2s',
                        }}
                      />
                    </motion.button>
                    <ToggleSwitch on={isFav} theme={theme} onChange={() => t?.id && handleToggleFavorite(t.id)} />
                  </div>
                </motion.div>
              );
            })
          ) : (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-sm mt-8"
              style={{ color: theme.color.global.gray }}
            >
              No tokens found
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
