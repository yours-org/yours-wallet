import styled from 'styled-components';
import type { Txo } from '@1sat/wallet-toolbox';
import { Utils } from '@bsv/sdk';
import { WhiteLabelTheme, Theme } from '../theme.types';
import { Text } from './Reusable';
import { Show } from './Show';

export type OrdinalDivProps = WhiteLabelTheme & {
  url?: string;
  selected?: boolean;
  size?: string;
};

const OrdinalWrapper = styled.div<OrdinalDivProps>`
  height: ${(props) => props.size ?? '6.5rem'};
  width: ${(props) => props.size ?? '6.5rem'};
  background-image: url(${(props) => props.url});
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 12%;
  cursor: pointer;
  border: ${(props) =>
    props.selected ? `0.1rem solid ${props.theme.color.component.ordinalSelectedBorder}` : undefined};
`;

const IFrameWrapper = styled.div<OrdinalDivProps>`
  height: ${(props) => props.size ?? '6.5rem'};
  width: ${(props) => props.size ?? '6.5rem'};
  border-radius: 12%;
  cursor: pointer;
  border: ${(props) =>
    props.selected ? `0.1rem solid ${props.theme.color.component.ordinalSelectedBorder}` : undefined};
`;

const StyledIFrame = styled.iframe<OrdinalDivProps>`
  height: ${(props) => props.size ?? '6.5rem'};
  width: ${(props) => props.size ?? '6.5rem'};
  border-radius: 12%;
  border: none;
  pointer-events: none;
`;

const TextWrapper = styled(OrdinalWrapper)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow-x: auto;
  background-color: ${(props) => props.theme.color.global.row};
`;

const OrdText = styled(Text)`
  color: ${(props) => props.theme.color.component.ordinalTypePlainText};
  text-align: center;
  width: 100%;
  margin: 0;
  font-size: 90%;
`;

const UnsupportedText = styled(OrdText)`
  color: ${(props) => props.theme.color.component.ordinalTypeUnsupported};
`;

const JsonWrapper = styled.div<OrdinalDivProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  height: ${(props) => props.size ?? '6.5rem'};
  width: ${(props) => props.size ?? '6.5rem'};
  border-radius: 0.5rem;
  position: relative;
  background-color: ${(props) => props.theme.color.global.row};
  cursor: pointer;
  border: ${(props) =>
    props.selected ? `0.1rem solid ${props.theme.color.component.ordinalSelectedBorder}` : undefined};
  overflow: auto;
`;

export const Json = styled.pre<WhiteLabelTheme>`
  font-family: 'DM Mono', monospace;
  font-size: 0.65rem;
  color: ${(props) => props.theme.color.component.ordinalTypeJson};
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
`;

export const FlexWrapper = styled.div`
  flex: 0 1 calc(33.333% - 1rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0.25rem;
  transition: 0.3s ease-in-out;

  &:hover {
    transform: scale(1.02);
  }
`;

// Helper types for accessing Txo indexer data
interface OriginData {
  outpoint?: string;
  insc?: {
    file?: {
      type?: string;
      content?: number[];
    };
  };
  map?: Record<string, unknown>;
}

export type OrdinalProps = {
  theme: Theme;
  url: string;
  isTransfer?: boolean;
  selected?: boolean;
  size?: string;
  txo: Txo;
  onClick?: () => void;
};

export const Ordinal = (props: OrdinalProps) => {
  const { url, selected, isTransfer, size, txo, theme, onClick } = props;

  // Extract origin data from Txo
  const originData = txo.data?.origin?.data as OriginData | undefined;
  const contentType = originData?.insc?.file?.type;
  const mapData = originData?.map as Record<string, unknown> | undefined;

  // Get text content if available
  const getTextContent = (): string | undefined => {
    const content = originData?.insc?.file?.content;
    if (!content) return undefined;
    try {
      return Utils.toUTF8(content);
    } catch {
      return undefined;
    }
  };

  // Get JSON content if available
  const getJsonContent = (): Record<string, unknown> | undefined => {
    if (!contentType?.startsWith('application/json')) return undefined;
    const content = originData?.insc?.file?.content;
    if (!content) return undefined;
    try {
      return JSON.parse(Utils.toUTF8(content));
    } catch {
      return undefined;
    }
  };

  const getOrdinalName = (): string => {
    if (mapData?.name) {
      return String(mapData.name);
    } else if (mapData?.app === 'ssm') {
      if (mapData?.chatName) {
        return `SSM - ${mapData.chatName}`;
      } else {
        return 'Unknown SSM Channel';
      }
    } else {
      return 'Unknown Name';
    }
  };

  const renderContent = () => {
    switch (true) {
      case contentType?.startsWith('image/svg'):
      case contentType?.startsWith('text/html'):
        return (
          <IFrameWrapper size={size} selected={selected} theme={theme} onClick={onClick}>
            <StyledIFrame src={url} sandbox="true" size={size} />
          </IFrameWrapper>
        );
      case contentType?.startsWith('image/'):
        return <OrdinalWrapper size={size} selected={selected} url={url} theme={theme} onClick={onClick} />;
      case contentType?.startsWith('text/'):
      case contentType?.startsWith('application/op-ns'):
        return (
          <TextWrapper size={size} selected={selected} url={url} theme={theme} onClick={onClick}>
            <OrdText theme={theme}>{getTextContent()}</OrdText>
          </TextWrapper>
        );
      case contentType?.startsWith('application/json'):
        return (
          <JsonWrapper size={size} selected={selected} url={url} theme={theme} onClick={onClick}>
            <Json theme={theme}>{JSON.stringify(getJsonContent(), null, 2)}</Json>
          </JsonWrapper>
        );
      default:
        return (
          <TextWrapper size={size} selected={selected} theme={theme} onClick={onClick}>
            <UnsupportedText theme={theme}>Syncing or Unsupported File Type</UnsupportedText>
          </TextWrapper>
        );
    }
  };

  return (
    <FlexWrapper>
      {renderContent()}
      <Show when={!isTransfer}>
        <Text
          theme={theme}
          style={{ margin: '0.25rem 0', cursor: 'pointer', fontSize: '0.75rem' }}
          onClick={() => window.open(url, '_blank')}
        >
          {getOrdinalName()}
        </Text>
      </Show>
    </FlexWrapper>
  );
};
