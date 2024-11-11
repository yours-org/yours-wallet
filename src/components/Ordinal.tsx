import styled from 'styled-components';
import { Ordinal as OrdinalType } from 'yours-wallet-provider';
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
  flex: 0 1 calc(33.333% - 1rem); // Adjust the percentage and subtraction to account for margins/gaps
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0.25rem;
  transition: 0.3s ease-in-out;

  &:hover {
    transform: scale(1.02);
  }
`;

export type OrdinalProps = {
  theme: Theme;
  url: string;
  isTransfer?: boolean;
  selected?: boolean;
  size?: string;
  inscription: OrdinalType;
  onClick?: () => void;
};

export const Ordinal = (props: OrdinalProps) => {
  const { url, selected, isTransfer, size, inscription, theme, onClick } = props;
  const contentType = inscription?.origin?.data?.insc?.file?.type;

  // We can use this function to properly render unique use cases that may have different metadata than what is supported by default
  const getOrdinalName = () => {
    if (inscription?.origin?.data?.map?.name) {
      return inscription.origin?.data?.map?.name;
    } else if (inscription?.origin?.data?.map?.app === 'ssm') {
      if (inscription?.origin?.data?.map?.chatName) {
        return `SSM - ${inscription?.origin?.data?.map?.chatName}`;
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
        return (
          <TextWrapper size={size} selected={selected} url={url} theme={theme} onClick={onClick}>
            <OrdText theme={theme}>{inscription.origin?.data?.insc?.file?.text}</OrdText>
          </TextWrapper>
        );
      case contentType?.startsWith('application/json'):
        return (
          <JsonWrapper size={size} selected={selected} url={url} theme={theme} onClick={onClick}>
            <Json theme={theme}>{JSON.stringify(inscription.origin?.data?.insc?.file?.json, null, 2)}</Json>
          </JsonWrapper>
        );
      default:
        return (
          <TextWrapper size={size} selected={selected} theme={theme} onClick={onClick}>
            <UnsupportedText theme={theme}>😩 Syncing or Unsupported File Type</UnsupportedText>
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
