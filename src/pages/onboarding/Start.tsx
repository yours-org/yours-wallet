import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import gihubIcon from '../../assets/github.svg';
import { Button } from '../../components/Button';
import { GithubIcon, Text, YoursLogo } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useTheme } from '../../hooks/useTheme';
import { ColorThemeProps } from '../../theme';
import yoursLogo from '../../assets/yours-logo.png';
import { useServiceContext } from '../../hooks/useServiceContext';

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const TitleText = styled.h1<ColorThemeProps>`
  font-size: 2rem;
  color: ${({ theme }) => theme.white};
  font-family: 'Inter', Arial, Helvetica, sans-serif;
  font-weight: 700;
  margin: 0.25rem 0;
  text-align: center;
`;

export const Start = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [showStart, setShowStart] = useState(false);
  const { hideMenu, showMenu } = useBottomMenu();
  const { chromeStorageService } = useServiceContext();
  const { account } = chromeStorageService.getCurrentAccountObject();
  const encryptedKeys = account?.encryptedKeys;

  useEffect(() => {
    hideMenu();

    return () => {
      showMenu();
    };
  }, [hideMenu, showMenu]);

  useEffect(() => {
    if (encryptedKeys) {
      setShowStart(false);
      navigate('/bsv-wallet');
      return;
    }

    setShowStart(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encryptedKeys]);

  return (
    <Show when={showStart}>
      <Content>
        <YoursLogo src={yoursLogo} />
        <TitleText theme={theme}>Yours Wallet</TitleText>
        <Text theme={theme} style={{ margin: '0.25rem 0 1rem 0' }}>
          An open source project.
        </Text>
        <Button theme={theme} type="primary" label="Create New Wallet" onClick={() => navigate('/create-wallet')} />
        <Button
          theme={theme}
          type="secondary-outline"
          label="Restore Wallet"
          onClick={() => navigate('/restore-wallet')}
        />
        <GithubIcon
          style={{ marginTop: '1rem' }}
          src={gihubIcon}
          onClick={() => window.open('https://github.com/yours-org', '_blank')}
        />
      </Content>
    </Show>
  );
};
