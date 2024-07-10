import { styled } from 'styled-components';
import logo from '../assets/yours-horizontal-logo.png';
import { useTheme } from '../hooks/useTheme';
import { GithubIcon, Text } from './Reusable';
import activeCircle from '../assets/active-circle.png';
import { truncate } from '../utils/format';
import gitHubIcon from '../assets/github.svg';
import { useSnackbar } from '../hooks/useSnackbar';
import { useServiceContext } from '../hooks/useServiceContext';

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: fixed;
  width: 100%;
  top: 0;
`;

const LogoWrapper = styled.div`
  display: flex;
  align-items: center;
`;

const Logo = styled.img`
  width: 6.5rem;
  margin: 1rem;
`;

const Circle = styled.img`
  width: 1.25rem;
  height: 1.25rem;
  margin-left: 0.5rem;
`;

export const TopNav = () => {
  const { theme } = useTheme();
  const { keysService } = useServiceContext();
  const { addSnackbar } = useSnackbar();

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(keysService.bsvAddress).then(() => {
      addSnackbar('Copied!', 'success');
    });
  };

  return (
    <Container>
      <LogoWrapper>
        <Logo src={logo} />
        <Text style={{ margin: '0', marginLeft: '-0.25rem' }} theme={theme}>
          /
        </Text>
        <Circle src={activeCircle} />
        <Text
          style={{ margin: '0 0 0 0.25rem', color: theme.white, fontSize: '0.75rem' }}
          theme={theme}
          onClick={handleCopyToClipboard}
        >
          {truncate(keysService.bsvAddress, 5, 5)}
        </Text>
      </LogoWrapper>
      <GithubIcon
        style={{ marginRight: '1.5rem' }}
        src={gitHubIcon}
        onClick={() => window.open('https://github.com/yours-org', '_blank')}
      />
    </Container>
  );
};
