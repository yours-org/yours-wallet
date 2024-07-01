import { useContext, useEffect, useState } from 'react';
import { styled } from 'styled-components';
import { Button } from '../../components/Button';
import { HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { BottomMenuContext } from '../../contexts/BottomMenuContext';
import { useBsv } from '../../hooks/useBsv';
import { useOrds } from '../../hooks/useOrds';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import greenCheck from '../../assets/green-check.svg';
import { ColorThemeProps } from '../../theme';
import { useWeb3ContextNew } from '../../hooks/useWeb3ContextNew';
import { RequestParams, WhitelistedApp } from '../../inject';
import { sendMessage, removeWindow } from '../../utils/chromeHelpers';
import { storage } from '../../utils/storage';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const Icon = styled.img<{ size: string }>`
  width: ${(props) => props.size};
  height: ${(props) => props.size};
  margin: 0 0 1rem 0;
  border-radius: 0.5rem;
`;

const PermissionsContainer = styled.div<ColorThemeProps>`
  display: flex;
  flex-direction: column;
  padding: 1rem;
  width: 75%;
  background-color: ${({ theme }) => theme.darkAccent};
  border-radius: 0.75rem;
  margin: 1rem 0 1.5rem 0;
`;

const Permission = styled.div`
  display: flex;
  align-items: center;
  margin: 0.5rem;
`;

const CheckMark = styled.img`
  width: 1rem;
  height: 1rem;
`;

export type ConnectRequestProps = {
  request: RequestParams | undefined;
  whiteListedApps: WhitelistedApp[];
  popupId: number | undefined;
  onDecision: () => void;
};

export const ConnectRequest = (props: ConnectRequestProps) => {
  const { request, whiteListedApps, popupId, onDecision } = props;
  const { theme } = useTheme();
  const context = useContext(BottomMenuContext);
  const { addSnackbar } = useSnackbar();
  const [isDecided, setIsDecided] = useState(false);
  const { bsvPubKey, identityPubKey } = useBsv();
  const { ordPubKey } = useOrds();
  const { clearRequest } = useWeb3ContextNew();

  useEffect(() => {
    if (!context) return;
    context.hideMenu();

    return () => context.showMenu();
  }, [context]);

  useEffect(() => {
    if (isDecided) return;
    if (request && !request.isAuthorized) return;
    if (!bsvPubKey || !ordPubKey) return;
    if (!window.location.href.includes('localhost')) {
      sendMessage({
        action: 'userConnectResponse',
        decision: 'approved',
        pubKeys: { bsvPubKey, ordPubKey, identityPubKey },
      });
      clearRequest('connectRequest');
      if (popupId) removeWindow(popupId);
    }
  }, [bsvPubKey, ordPubKey, popupId, request, isDecided, identityPubKey, clearRequest]);

  useEffect(() => {
    const onbeforeunloadFn = () => {
      if (popupId) removeWindow(popupId);
    };

    window.addEventListener('beforeunload', onbeforeunloadFn);
    return () => {
      window.removeEventListener('beforeunload', onbeforeunloadFn);
    };
  }, [popupId]);

  const handleConnectDecision = async (approved: boolean) => {
    if (chrome.runtime) {
      if (approved) {
        await storage.set({
          whitelist: [
            ...whiteListedApps,
            {
              domain: request?.domain ?? '',
              icon: request?.appIcon ?? '',
            },
          ],
        });
        await sendMessage({
          action: 'userConnectResponse',
          decision: 'approved',
          pubKeys: { bsvPubKey, ordPubKey, identityPubKey },
        });
        addSnackbar(`Approved`, 'success');
      } else {
        await sendMessage({
          action: 'userConnectResponse',
          decision: 'declined',
        });
        addSnackbar(`Declined`, 'error');
      }
    }

    setIsDecided(true);
    clearRequest('connectRequest');
    if (popupId) removeWindow(popupId);
  };

  return (
    <Show
      when={!request?.isAuthorized}
      whenFalseContent={
        <Container>
          <Text theme={theme} style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            Reconnecting to {request?.appName} ...
          </Text>
        </Container>
      }
    >
      <Container>
        <Icon size="5rem" src={request?.appIcon} />
        <HeaderText theme={theme} style={{ width: '90%' }}>
          {request?.appName}
        </HeaderText>
        <Text theme={theme} style={{ marginBottom: '1rem' }}>
          {request?.domain}
        </Text>
        <PermissionsContainer theme={theme}>
          <Permission>
            <CheckMark style={{ marginRight: '1rem' }} src={greenCheck} />
            <Text style={{ color: theme.white, margin: 0, textAlign: 'left' }}>View your wallet public keys</Text>
          </Permission>
          <Permission>
            <CheckMark style={{ marginRight: '1rem' }} src={greenCheck} />
            <Text style={{ color: theme.white, margin: 0, textAlign: 'left' }}>Request approval for transactions</Text>
          </Permission>
        </PermissionsContainer>
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
        <Button
          theme={theme}
          type="secondary-outline"
          label="Cancel"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            handleConnectDecision(false);
            onDecision();
          }}
        />
      </Container>
    </Show>
  );
};
