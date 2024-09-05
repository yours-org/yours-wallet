import { styled } from 'styled-components';
import { useTheme } from '../hooks/useTheme';
import { ColorThemeProps } from '../theme';
import { HeaderText, Text } from './Reusable';
import { formatLargeNumber, formatUSD } from '../utils/format';
import { Show } from './Show';
import { BSV_DECIMAL_CONVERSION } from '../utils/constants';

const Container = styled.div<ColorThemeProps & { $animate: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${({ theme }) => theme.darkAccent};
  padding: 1rem 0;
  width: 90%;
  border-radius: 0.5rem;
  margin: 0.25rem;
  transition: transform 0.3s ease-in-out;

  &:hover {
    transform: ${({ $animate }) => ($animate ? 'scale(1.02)' : 'none')};
  }
`;

const Icon = styled.img<{ size?: string }>`
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

const BalanceWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-right: 1rem;
  width: 40%;
`;

export type AssetRowProps = {
  icon: string;
  ticker: string;
  balance: number;
  usdBalance: number;
  showPointer: boolean;
  animate?: boolean;
  isLock?: boolean;
  nextUnlock?: number;
  onClick?: () => void;
};

export const AssetRow = (props: AssetRowProps) => {
  const { icon, ticker, balance, usdBalance, isLock, nextUnlock, onClick, showPointer, animate = false } = props;
  const { theme } = useTheme();
  const isDisplaySat = isLock && balance < 0.0001;
  return (
    <Container
      style={{ cursor: showPointer ? 'pointer' : undefined }}
      onClick={onClick}
      theme={theme}
      $animate={animate}
    >
      <TickerWrapper>
        <Show when={!!icon && icon.length > 0}>
          <Icon src={icon} />
        </Show>
        <TickerTextWrapper>
          <HeaderText style={{ fontSize: '1rem' }} theme={theme}>
            {ticker}
          </HeaderText>
          <Text style={{ margin: '0', textAlign: 'left' }} theme={theme}>
            {isLock ? 'Next unlock' : 'Balance'}
          </Text>
        </TickerTextWrapper>
      </TickerWrapper>
      <BalanceWrapper>
        <HeaderText style={{ textAlign: 'right', fontSize: '1rem' }} theme={theme}>
          {`${formatLargeNumber(
            isDisplaySat ? balance * BSV_DECIMAL_CONVERSION : balance,
            isDisplaySat ? 0 : 3,
          )}${isLock ? (isDisplaySat ? `${balance === 0.00000001 ? ' SAT' : ' SATS'}` : ' BSV') : ''}`}
        </HeaderText>
        <Text style={{ textAlign: 'right', margin: '0' }} theme={theme}>
          {isLock ? `Block ${nextUnlock}` : formatUSD(usdBalance)}
        </Text>
      </BalanceWrapper>
    </Container>
  );
};
