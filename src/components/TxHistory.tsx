import { styled } from 'styled-components';
import { Theme, WhiteLabelTheme } from '../theme.types';
import { useServiceContext } from '../hooks/useServiceContext';
import { useEffect, useMemo, useState } from 'react';
import { HeaderText, Text } from './Reusable';
import {
  BSV_DECIMAL_CONVERSION,
  GENERIC_NFT_ICON,
  GENERIC_TOKEN_ICON,
  MNEE_DECIMALS,
  MNEE_SYM,
  URL_WHATSONCHAIN,
  URL_WHATSONCHAIN_TESTNET,
} from '../utils/constants';
import { FaTimes, FaChevronDown, FaChevronUp, FaLink, FaTag } from 'react-icons/fa'; // Import FaTag
import { TxLog } from 'spv-store';
import { Button } from './Button';
import bsvCoin from '../assets/bsv-coin.svg';
import lock from '../assets/lock.svg';
import { Show } from './Show';
import { NetWork } from 'yours-wallet-provider';
import { formatNumberWithCommasAndDecimals } from '../utils/format';

const Container = styled.div<WhiteLabelTheme>`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100vh;
  overflow-y: auto;
  background-color: ${({ theme }) => theme.color.global.walletBackground};
  z-index: 1000;
  position: absolute;
`;

const HistoryRow = styled.div<WhiteLabelTheme>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: ${({ theme }) => theme.color.global.row};
  width: 95%;
  padding: 0.5rem 1rem;
  border: 1px solid ${({ theme }) => theme.color.global.gray + '50'};
  border-radius: 0.5rem;
  transition: transform 0.3s ease-in-out;

  &:hover {
    transform: scale(1.02);
  }
`;

const Icon = styled.img<{ $isNFT?: boolean }>`
  width: 2.25rem;
  height: 2.25rem;
  border-radius: ${({ $isNFT }) => ($isNFT ? '0.25rem' : '50%')};
`;

const TickerWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ButtonsWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 40%;
  margin: 1rem 0;
`;

const TickerTextWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-left: 1rem;
`;

const ContentWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const BackWrapper = styled.div`
  position: absolute;
  top: 3rem;
  left: 2rem;
`;

const RowWrapper = styled.div`
  width: 95%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0.15rem 0;
`;

const BoundedContent = styled.div`
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
  width: 100%;
`;

const IconNameWrapper = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const IconContent = styled.div`
  display: flex;
  gap: 0.5rem;
  position: relative;
  width: 2.5rem;
`;

const ListIconWrapper = styled.div<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: ${({ theme }) => theme.color.global.contrast};
  width: 2.25rem;
  height: 2.25rem;
`;

type Tag = 'bsv21' | 'bsv20' | 'origin' | 'list' | 'lock' | 'fund';

export type TxHistoryProps = {
  theme: Theme;
  onBack: () => void;
};

export const TxHistory = (props: TxHistoryProps) => {
  const { theme, onBack } = props;
  const [data, setData] = useState<TxLog[]>();
  const { oneSatSPV } = useServiceContext();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  const { gorillaPoolService, chromeStorageService } = useServiceContext();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const isTestnet = chromeStorageService.getNetwork() === NetWork.Testnet;

  const tagPriorityOrder: Tag[] = ['list', 'bsv21', 'bsv20', 'origin', 'lock', 'fund']; // The order of these tags will determine the order of the icons and which is prioritized

  useEffect(() => {
    const fetchData = async () => {
      if (!oneSatSPV) return;
      try {
        const tsx = await oneSatSPV.getRecentTxs();
        console.log(tsx);
        setData(tsx);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, [oneSatSPV]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data?.slice(startIndex, endIndex);
  }, [currentPage, data]);

  const handleNextPage = () => {
    if (currentPage * itemsPerPage < (data?.length ?? 0)) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleOpenLink = (txid: string) => {
    const url = isTestnet ? `${URL_WHATSONCHAIN_TESTNET}${txid}` : `${URL_WHATSONCHAIN}${txid}`;
    window.open(url, '_blank');
  };

  const getIconForSummary = (tag: Tag, icon?: string) => {
    switch (tag) {
      case 'fund':
        return <Icon src={bsvCoin} alt="Fund Icon" />;
      case 'lock':
        return <Icon src={lock} alt="Lock Icon" />;
      case 'list':
        return (
          <ListIconWrapper theme={theme}>
            <FaTag style={{ width: '1rem', height: '1rem', color: theme.color.global.neutral }} />
          </ListIconWrapper>
        );
      default:
        return icon ? (
          <Icon
            src={`${gorillaPoolService.getBaseUrl(chromeStorageService.getNetwork())}/content/${icon}`}
            alt="Summary Icon"
            $isNFT={tag === 'origin'}
          />
        ) : tag === ('origin' as Tag) ? (
          <Icon src={GENERIC_NFT_ICON} alt="Generic NFT Icon" />
        ) : (
          <Icon src={GENERIC_TOKEN_ICON} alt="Generic Token Icon" />
        );
    }
  };

  const sortEntriesByPriority = (entries: [Tag, { id?: string; icon?: string; amount?: number }][]) => {
    return entries.sort((a, b) => {
      const aPriority = tagPriorityOrder.indexOf(a[0]);
      const bPriority = tagPriorityOrder.indexOf(b[0]);
      return (aPriority === -1 ? Infinity : aPriority) - (bPriority === -1 ? Infinity : bPriority);
    });
  };

  const toggleRowExpansion = (uniqueId: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(uniqueId)) newSet.delete(uniqueId);
      else newSet.add(uniqueId);
      return newSet;
    });
  };

  const getHeaderText = (tag: Tag, tokenName?: string) => {
    switch (tag) {
      case 'bsv21':
      case 'bsv20':
        return tokenName || 'Token';
      case 'origin':
        return 'NFT';
      case 'list':
        return 'Listing';
      case 'lock':
        return 'Lock';
      case 'fund':
        return 'BSV';
      default:
        return 'Unknown';
    }
  };

  const getDescriptionText = (tag: Tag, amount: number) => {
    switch (tag) {
      case 'list':
        return amount === -1 ? 'Listed for sale' : amount === 0 ? 'Cancelled listing' : 'Purchased listing';
      case 'lock':
        return 'Lock contract';
      default:
        return amount === 0 ? 'Transfer' : amount > 0 ? 'Received' : 'Sent';
    }
  };

  const getAmountText = (tag: Tag, amount: number) => {
    switch (tag) {
      case 'fund':
        return amount / BSV_DECIMAL_CONVERSION;
      case 'bsv21':
      case 'bsv20':
        return amount;
      case 'lock':
        return amount / BSV_DECIMAL_CONVERSION + ' BSV';
      default:
        return amount.toLocaleString() + ' sats';
    }
  };

  const formatMNEEAmount = (amount: number) => {
    return formatNumberWithCommasAndDecimals(
      getAmountText('bsv21', amount) as number,
      Math.abs(amount) >= 0.01 ? 2 : MNEE_DECIMALS,
    );
  };

  return (
    <Container theme={theme}>
      <BackWrapper>
        <FaTimes size={'1.5rem'} color={theme.color.global.contrast} cursor="pointer" onClick={onBack} />
      </BackWrapper>
      <Text style={{ marginTop: '3rem', fontSize: '1.25rem', fontWeight: 700 }} theme={theme}>
        Recent Activity
      </Text>
      {(paginatedData || []).length > 0 ? (
        paginatedData?.map((t) => {
          const summaryEntries = sortEntriesByPriority(
            Object.entries(t.summary || {}).filter(([key]) => tagPriorityOrder.includes(key as Tag)) as [
              Tag,
              { id?: string; icon?: string; amount?: number },
            ][],
          );
          const uniqueId = `${t.txid}-${t.idx}`;
          const isExpanded = expandedRows.has(uniqueId);
          return (
            <RowWrapper key={uniqueId}>
              <HistoryRow
                theme={theme}
                onClick={summaryEntries.length > 1 ? () => toggleRowExpansion(uniqueId) : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: summaryEntries.length > 1 ? 'pointer' : 'default',
                  color: theme.color.global.gray,
                }}
              >
                <TickerWrapper style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {summaryEntries.slice(0, isExpanded ? summaryEntries.length : 1).map(([key, value], idx) => (
                    <BoundedContent key={idx}>
                      <IconNameWrapper>
                        <IconContent>
                          {isExpanded
                            ? getIconForSummary(key, value.icon)
                            : summaryEntries.slice(0, 3).map(([key, value], iconIdx) => (
                                <div
                                  key={iconIdx}
                                  style={{
                                    position: 'absolute',
                                    left: `${iconIdx * 0.75}rem`,
                                    zIndex: 3 - iconIdx,
                                  }}
                                >
                                  {getIconForSummary(key, value.icon)}
                                </div>
                              ))}
                        </IconContent>
                        <TickerTextWrapper>
                          <HeaderText style={{ fontSize: '0.85rem', marginTop: 0, fontWeight: 700 }} theme={theme}>
                            {getHeaderText(key, value.id)}
                          </HeaderText>
                          <Text
                            theme={theme}
                            style={{
                              color: theme.color.global.gray,
                              fontSize: '0.75rem',
                              margin: 0,
                              textAlign: 'left',
                              width: '100%',
                            }}
                          >
                            {getDescriptionText(key, value.amount ?? 0)}
                          </Text>
                        </TickerTextWrapper>
                      </IconNameWrapper>
                      <ContentWrapper>
                        <HeaderText
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 900,
                            margin: 0,
                            color: value?.amount
                              ? value.amount >= 1
                                ? theme.color.component.primaryButtonLeftGradient
                                : key === 'origin' && value.amount === -1 // If an NFT is sent
                                  ? 'transparent'
                                  : theme.color.global.contrast
                              : 'transparent',
                            textAlign: 'right',
                          }}
                          theme={theme}
                        >
                          {value.amount && value.amount > 0 ? '+' : ''}
                          {value.id === MNEE_SYM
                            ? formatMNEEAmount(value.amount ?? 0)
                            : getAmountText(key, value.amount ?? 0)}
                        </HeaderText>
                        <Show when={idx === 0}>
                          <FaLink
                            onClick={() => handleOpenLink(t.txid)}
                            style={{ cursor: 'pointer', color: theme.color.component.primaryButtonLeftGradient }}
                            title="See transaction in Whatsonchain"
                          />
                        </Show>
                        {idx === 0 && summaryEntries.length > 1 ? (
                          isExpanded ? (
                            <FaChevronUp />
                          ) : (
                            <FaChevronDown />
                          )
                        ) : (
                          <span style={{ display: 'inline-block', width: '12px', height: '16px' }} />
                        )}
                      </ContentWrapper>
                    </BoundedContent>
                  ))}
                </TickerWrapper>
              </HistoryRow>
            </RowWrapper>
          );
        })
      ) : (
        <Text theme={theme}>No transaction records found.</Text>
      )}
      <ButtonsWrapper>
        <Button
          theme={theme}
          type="secondary"
          label="Previous"
          style={{ marginTop: '0.5rem' }}
          disabled={currentPage === 1}
          onClick={handlePreviousPage}
        />
        <Button
          theme={theme}
          type="secondary"
          label="Next"
          onClick={handleNextPage}
          disabled={currentPage * itemsPerPage >= (data?.length ?? 0)}
        />
      </ButtonsWrapper>
    </Container>
  );
};
