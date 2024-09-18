import { styled } from 'styled-components';
import { useState, useEffect, useRef } from 'react';
import logo from '../assets/logos/horizontal-logo.png';
import { useTheme } from '../hooks/useTheme';
import { GithubIcon, Text } from './Reusable';
import activeCircle from '../assets/active-circle.png';
import { truncate } from '../utils/format';
import gitHubIcon from '../assets/github.svg';
import { useSnackbar } from '../hooks/useSnackbar';
import { useServiceContext } from '../hooks/useServiceContext';
import copyIcon from '../assets/copy.svg';
import switchIcon from '../assets/chevrons.svg';
import { WhiteLabelTheme } from '../theme.types';
import { useNavigate } from 'react-router-dom';
import { useBottomMenu } from '../hooks/useBottomMenu';

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: fixed;
  width: 100%;
  top: 0;
  z-index: 10;
`;

const LogoWrapper = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  z-index: 11;
`;

const Logo = styled.img`
  width: 6.5rem;
  margin: 1rem;
`;

const Circle = styled.img`
  width: 1.25rem;
  height: 1.25rem;
  margin-left: 0.5rem;
  border-radius: 50%;
`;

const Dropdown = styled.div<WhiteLabelTheme>`
  position: absolute;
  top: 3.5rem;
  left: 5rem;
  color: ${({ theme }) =>
    theme.color.global.primaryTheme === 'dark' ? theme.color.global.white : theme.color.global.black};
  background: ${({ theme }) => theme.color.global.row + '90'};
  backdrop-filter: blur(10px);
  border: 1px solid ${({ theme }) => theme.color.global.gray};
  border-radius: 0.5rem;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  z-index: 12;
  min-width: 15rem;
  max-height: 18.75rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const DropdownItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) =>
      theme.color.global.primaryTheme === 'dark' ? theme.color.global.white + '10' : theme.color.global.black + '10'};
  }
`;

const CopyIcon = styled.img`
  width: 1rem;
  height: 1rem;
  margin-left: 0.5rem;
`;

const SwitchIcon = styled.img`
  width: 1rem;
  height: 1rem;
  cursor: pointer;
`;

const DropDownIcon = styled.img`
  width: 1.25rem;
  height: 1.25rem;
  margin-right: 0.5rem;
  border-radius: 50%;
`;

const DropDownAccountName = styled.p<WhiteLabelTheme>`
  color: ${({ theme }) =>
    theme.color.global.primaryTheme === 'dark' ? theme.color.global.white : theme.color.global.black};
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0;
`;

const DropdownAddressText = styled.p<WhiteLabelTheme>`
  color: ${({ theme }) => theme.color.global.gray};
  font-size: 0.75rem;
  margin: 0;
`;

const FlexContainer = styled.div`
  display: flex;
  align-items: center;
`;

export const TopNav = () => {
  const { theme } = useTheme();
  const { chromeStorageService } = useServiceContext();
  const { handleSelect } = useBottomMenu();
  const navigate = useNavigate();
  const { addSnackbar } = useSnackbar();
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLDivElement | null>(null);
  const accountObj = chromeStorageService.getCurrentAccountObject();

  const handleCopyToClipboard = (bsvAddress: string) => {
    navigator.clipboard.writeText(bsvAddress).then(() => {
      addSnackbar('Copied!', 'success');
    });
  };

  const handleSwitchAccount = async (identityAddress: string) => {
    await chromeStorageService.switchAccount(identityAddress);
    setDropdownVisible(false);
    navigate('/bsv-wallet?reload=true');
  };

  const toggleDropdown = (event: React.MouseEvent) => {
    event.stopPropagation();
    setDropdownVisible((prev) => !prev);
  };

  const handleClickOutside = (event: MouseEvent) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(event.target as Node) &&
      toggleRef.current &&
      !toggleRef.current.contains(event.target as Node)
    ) {
      setDropdownVisible(false);
    }
  };

  useEffect(() => {
    if (dropdownVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownVisible]);

  return (
    <Container>
      <LogoWrapper>
        <Logo src={logo} />
        <Text style={{ margin: '0', marginLeft: '-0.25rem' }} theme={theme}>
          /
        </Text>
        <Circle src={accountObj.account?.icon ?? activeCircle} />
        <FlexContainer style={{ justifyContent: 'flex-start', minWidth: 'fit-content' }} ref={toggleRef}>
          <Text
            style={{
              margin: '0 0.25rem 0 0.25rem',
              textAlign: 'left',
              color: theme.color.global.primaryTheme === 'dark' ? theme.color.global.white : theme.color.global.black,
              fontSize: '0.75rem',
              cursor: 'pointer',
              minWidth: 'fit-content',
            }}
            theme={theme}
            onClick={toggleDropdown}
          >
            {accountObj.account?.name ?? accountObj.account?.addresses.identityAddress}
          </Text>
          <SwitchIcon src={switchIcon} onClick={toggleDropdown} />
        </FlexContainer>
        {dropdownVisible && (
          <Dropdown theme={theme} ref={dropdownRef}>
            {chromeStorageService.getAllAccounts().map((account) => (
              <DropdownItem
                key={account.addresses.identityAddress}
                theme={theme}
                onClick={() => handleSwitchAccount(account.addresses.identityAddress)}
              >
                <FlexContainer>
                  <DropDownIcon src={account.icon} />
                  <DropDownAccountName style={{ textAlign: 'left' }} theme={theme}>
                    {account.name}
                  </DropDownAccountName>
                </FlexContainer>
                <FlexContainer>
                  <DropdownAddressText theme={theme}>
                    {truncate(account.addresses.bsvAddress, 3, 3)}
                  </DropdownAddressText>
                  <CopyIcon
                    src={copyIcon}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyToClipboard(account.addresses.bsvAddress);
                    }}
                  />
                </FlexContainer>
              </DropdownItem>
            ))}
            <DropdownItem key={'new-account'} theme={theme} onClick={() => handleSelect('settings', 'manage-accounts')}>
              <FlexContainer>
                <DropDownAccountName style={{ textAlign: 'left' }} theme={theme}>
                  + Add New Account
                </DropDownAccountName>
              </FlexContainer>
            </DropdownItem>
          </Dropdown>
        )}
      </LogoWrapper>
      <GithubIcon
        style={{ marginRight: '1.5rem' }}
        src={gitHubIcon}
        onClick={() => window.open('https://github.com/yours-org', '_blank')}
      />
    </Container>
  );
};
