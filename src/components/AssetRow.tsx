import { styled } from 'styled-components';
import { useTheme } from '../hooks/useTheme';
import { ColorThemeProps } from '../theme';
import { HeaderText, Text } from './Reusable';
import { formatUSD } from '../utils/format';

const Container = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${({ theme }) => theme.darkAccent};
  padding: 1rem 0;
  width: 90%;
  border-radius: 0.5rem;
`;

const Icon = styled.img<{ size?: string }>`
  width: 2rem;
  height: 2rem;
  margin-left: 1rem;
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
`;

export type AssetRowProps = {
  icon: string;
  ticker: string;
  bsvBalance: number;
  usdBalance: number;
};

export const AssetRow = (props: AssetRowProps) => {
  const { icon, ticker, bsvBalance, usdBalance } = props;
  const { theme } = useTheme();
  return (
    <Container theme={theme}>
      <TickerWrapper>
        <Icon src={icon} />
        <TickerTextWrapper>
          <HeaderText style={{ fontSize: '1rem' }} theme={theme}>
            {ticker}
          </HeaderText>
          <Text style={{ margin: '0' }} theme={theme}>
            Balance
          </Text>
        </TickerTextWrapper>
      </TickerWrapper>
      <BalanceWrapper>
        <HeaderText style={{ textAlign: 'right', fontSize: '1rem' }} theme={theme}>
          {bsvBalance}
        </HeaderText>
        <Text style={{ textAlign: 'right', margin: '0' }} theme={theme}>
          {formatUSD(usdBalance)}
        </Text>
      </BalanceWrapper>
    </Container>
  );
};
