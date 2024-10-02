import { keyframes, styled } from 'styled-components';
import { Bsv20 } from 'yours-wallet-provider';
import { Theme, WhiteLabelTheme } from '../theme.types';
import { useServiceContext } from '../hooks/useServiceContext';
import { truncate } from '../utils/format';
import { useEffect, useState } from 'react';
import { ToggleSwitch } from './ToggleSwitch';
import { HeaderText, Text } from './Reusable';
import { ChromeStorageObject } from '../services/types/chromeStorage.types';
import { GENERIC_TOKEN_ICON } from '../utils/constants';
import { FaTimes } from 'react-icons/fa';

const slideIn = keyframes`
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
`;

const slideOut = keyframes`
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(100%);
  }
`;

const Container = styled.div<{ isSlidingOut: boolean } & WhiteLabelTheme>`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100vh;
  overflow-y: auto;
  background-color: ${({ theme }) => theme.color.global.walletBackground};
  z-index: 1000;
  position: absolute;
  animation: ${({ isSlidingOut }) => (isSlidingOut ? slideOut : slideIn)} 0.75s forwards;
`;

const FavoriteRow = styled.div<WhiteLabelTheme>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 95%;
  padding: 0.35rem 1.25rem 0.35rem 0.25rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.global.gray + '50'};
`;

const Icon = styled.img`
  width: 2.25rem;
  height: 2.25rem;
  margin-left: 1rem;
  border-radius: 50%;
`;

const TickerWrapper = styled.div`
  display: flex;
  align-items: center;
`;

const TickerTextWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-left: 1rem;
`;

const BackWrapper = styled.div`
  position: absolute;
  top: 3rem;
  left: 2rem;
`;

const SearchInput = styled.input<WhiteLabelTheme>`
  width: 90%;
  padding: 0.5rem;
  margin: 1rem 0;
  border: 1px solid ${({ theme }) => theme.color.global.gray};
  border-radius: 0.5rem;
  font-size: 0.85rem;
  color: ${({ theme }) => theme.color.global.contrast};
  background-color: ${({ theme }) => theme.color.global.neutral};

  &:focus {
    outline: none;
  }
`;

export type Bsv20TokensListProps = {
  bsv20s: Bsv20[];
  theme: Theme;
  onBack: () => void;
};

export const ManageTokens = (props: Bsv20TokensListProps) => {
  const { bsv20s, theme, onBack } = props;
  const { ordinalService, chromeStorageService, keysService, gorillaPoolService } = useServiceContext();
  const [favoriteTokens, setFavoriteTokens] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSlidingOut, setIsSlidingOut] = useState(false);

  useEffect(() => {
    const { account } = chromeStorageService.getCurrentAccountObject();
    setFavoriteTokens(account?.settings?.favoriteTokens || []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleFavorite = async (tokenId: string) => {
    setFavoriteTokens((prev) => (prev.includes(tokenId) ? prev.filter((id) => id !== tokenId) : [...prev, tokenId]));

    const { account } = chromeStorageService.getCurrentAccountObject();
    if (!account) return;
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [keysService.identityAddress]: {
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

  const handleBackClick = () => {
    setIsSlidingOut(true);
    setTimeout(onBack, 1000);
  };

  const filteredTokens = bsv20s
    .filter(
      (b) =>
        ordinalService.getTokenName(b).toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b?.id && b.id.toLowerCase().includes(searchQuery.toLowerCase())),
    )
    // Sort by favorite status
    .sort((a, b) => {
      if (a?.id && favoriteTokens.includes(a.id) && b?.id && !favoriteTokens.includes(b.id)) return -1;
      if (b?.id && favoriteTokens.includes(b?.id) && a?.id && !favoriteTokens.includes(a.id)) return 1;
      return 0;
    });

  return (
    <Container theme={theme} isSlidingOut={isSlidingOut}>
      <BackWrapper>
        <FaTimes size={'1.5rem'} color={theme.color.global.contrast} cursor="pointer" onClick={handleBackClick} />
      </BackWrapper>
      <Text style={{ marginTop: '3rem', fontSize: '1.25rem', fontWeight: 700 }} theme={theme}>
        Manage Token List
      </Text>
      <SearchInput
        theme={theme}
        type="text"
        placeholder="Search by token name or ID..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      {filteredTokens.length > 0 ? (
        filteredTokens.map((t) => (
          <FavoriteRow theme={theme} key={t.id}>
            <TickerWrapper>
              <Icon
                src={
                  t.icon
                    ? `${gorillaPoolService.getBaseUrl(chromeStorageService.getNetwork())}/content/${t.icon}`
                    : GENERIC_TOKEN_ICON
                }
              />
              <TickerTextWrapper>
                <HeaderText style={{ fontSize: '0.85rem', marginTop: 0 }} theme={theme}>
                  {ordinalService.getTokenName(t)}
                </HeaderText>
                <Text
                  theme={theme}
                  style={{ color: theme.color.global.gray, fontSize: '0.75rem', margin: 0, textAlign: 'left' }}
                >
                  {t?.id && truncate(t.id, 5, 5)}
                </Text>
              </TickerTextWrapper>
            </TickerWrapper>
            <ToggleSwitch
              on={(t?.id && favoriteTokens.includes(t.id)) || false}
              theme={theme}
              onChange={() => t?.id && handleToggleFavorite(t.id)}
            />
          </FavoriteRow>
        ))
      ) : (
        <Text theme={theme} style={{ marginTop: '1rem', color: theme.color.global.gray }}>
          No tokens found
        </Text>
      )}
    </Container>
  );
};
