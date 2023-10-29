import { styled } from 'styled-components';
import { ButtonContainer, Divider, HeaderText, Text } from '../../components/Reusable';
import { Button } from '../../components/Button';
import { ThirdPartyAppRequestData, WhitelistedApp } from '../../App';
import { useTheme } from '../../hooks/useTheme';
import { useContext, useEffect } from 'react';
import { BottomMenuContext } from '../../contexts/BottomMenuContext';
import { storage } from '../../utils/storage';
import { useNavigate } from 'react-router-dom';
import { useBsv } from '../../hooks/useBsv';
import { useOrds } from '../../hooks/useOrds';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin-bottom: 4rem;
`;

const Icon = styled.img<{ size: string }>`
  width: ${(props) => props.size};
  height: ${(props) => props.size};
  margin: 0 0 1rem 0;
  border-radius: 0.5rem;
`;

export type ConnectRequestProps = {
  thirdPartyAppRequestData: ThirdPartyAppRequestData | undefined;
  whiteListedApps: WhitelistedApp[];
  popupId: number | undefined;
  onDecision: () => void;
};
export const ConnectRequest = (props: ConnectRequestProps) => {
  const { thirdPartyAppRequestData, whiteListedApps, popupId, onDecision } = props;
  const { theme } = useTheme();
  const context = useContext(BottomMenuContext);
  const navigate = useNavigate();
  const { bsvPubKey } = useBsv();
  const { ordPubKey } = useOrds();

  useEffect(() => {
    if (!context) return;
    context.hideMenu();

    return () => context.showMenu();
  }, [context]);

  const handleConnectDecision = async (approved: boolean) => {
    if (chrome.runtime) {
      if (approved) {
        storage.set({
          whitelist: [
            ...whiteListedApps,
            {
              domain: thirdPartyAppRequestData?.domain,
              icon: thirdPartyAppRequestData?.appIcon,
            },
          ],
        });
        chrome.runtime.sendMessage({
          action: 'userConnectResponse',
          decision: 'approved',
          pubKeys: { bsvPubKey, ordPubKey },
        });
      } else {
        chrome.runtime.sendMessage({
          action: 'userConnectResponse',
          decision: 'declined',
        });
      }

      if (!approved && popupId) chrome.windows.remove(popupId);
      storage.remove('connectRequest');
      navigate('/bsv-wallet');
    }
  };

  return (
    <Container>
      <Icon size="5rem" src={thirdPartyAppRequestData?.appIcon} />
      <HeaderText theme={theme} style={{ width: '90%' }}>
        {thirdPartyAppRequestData?.appName}
      </HeaderText>
      <Text theme={theme} style={{ marginBottom: '1rem' }}>
        {thirdPartyAppRequestData?.domain}
      </Text>
      <Divider />
      <Text style={{ color: theme.white, margin: 0 }}>
        The app is requesting to view your wallet balance and request approval for transactions.
      </Text>

      <Divider />
      <ButtonContainer style={{ position: 'absolute', bottom: 0 }}>
        <Button
          theme={theme}
          type="warn"
          label="Cancel"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            handleConnectDecision(false);
            onDecision();
          }}
        />
        <Button
          theme={theme}
          type="primary"
          label="Connect"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            handleConnectDecision(true);
            onDecision();
          }}
        />
      </ButtonContainer>
    </Container>
  );
};
