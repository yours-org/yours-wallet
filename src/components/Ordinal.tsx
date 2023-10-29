import styled from 'styled-components';
import { ColorThemeProps, Theme } from '../theme';
import { OrdinalTxo } from '../hooks/ordTypes';
import { Text } from './Reusable';
import { Show } from './Show';

export type OrdinalDivProps = ColorThemeProps & {
  url: string;
  selected?: boolean;
  size?: string;
};

const OrdinalWrapper = styled.div<OrdinalDivProps>`
  height: ${(props) => props.size ?? '9rem'};
  width: ${(props) => props.size ?? '9rem'};
  background-image: url(${(props) => props.url});
  background-size: cover;
  border-radius: 0.5rem;
  margin: 0.5rem;
  cursor: pointer;
  border: ${(props) => (props.selected ? `0.3rem solid ${props.theme.lightAccent}` : undefined)};
`;

const TextWrapper = styled(OrdinalWrapper)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow-x: auto;
  background-color: ${(props) => props.theme.darkAccent};
`;

const OrdText = styled(Text)`
  color: ${(props) => props.theme.primaryButton};
  text-align: center;
  width: 100%;
  margin: 0;
  font-size: 90%;
`;

const UnsupportedText = styled(OrdText)`
  color: ${(props) => props.theme.white};
`;

const JsonWrapper = styled.div<OrdinalDivProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  height: ${(props) => props.size ?? '9rem'};
  width: ${(props) => props.size ?? '9rem'};
  border-radius: 0.5rem;
  position: relative;
  background-color: ${(props) => props.theme.darkAccent};
  margin: 0.5rem;
  cursor: pointer;
  border: ${(props) => (props.selected ? `0.3rem solid ${props.theme.lightAccent}` : undefined)};
  overflow: auto;
`;

export const Json = styled.pre<ColorThemeProps>`
  font-family: 'DM Mono', monospace;
  font-size: 0.65rem;
  color: ${(props) => props.theme.primaryButton};
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
`;

export const FlexWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export type OrdinalProps = {
  theme: Theme;
  url: string;
  isTransfer?: boolean;
  selected?: boolean;
  size?: string;
  inscription: OrdinalTxo;
  onClick?: () => void;
};

export const Ordinal = (props: OrdinalProps) => {
  const { url, selected, isTransfer, size, inscription, theme, onClick } = props;
  const contentType = inscription.origin?.data?.insc?.file?.type;

  const renderContent = () => {
    switch (true) {
      case contentType?.startsWith('image/'):
        return (
          <OrdinalWrapper
            size={size}
            selected={selected}
            url={url}
            theme={theme}
            style={{ backgroundImage: `url(${url})` }}
            onClick={onClick}
          />
        );
      case contentType === 'text/plain':
        return (
          <TextWrapper size={size} selected={selected} url={url} theme={theme} onClick={onClick}>
            <OrdText theme={theme}>{inscription.origin?.data?.insc?.text}</OrdText>
          </TextWrapper>
        );
      case contentType === 'application/json':
        return (
          <JsonWrapper size={size} selected={selected} url={url} theme={theme} onClick={onClick}>
            <Json theme={theme}>{JSON.stringify(inscription.origin?.data?.insc?.json, null, 2)}</Json>
          </JsonWrapper>
        );
      default:
        return (
          <TextWrapper size={size} selected={selected} url={url} theme={theme} onClick={onClick}>
            <UnsupportedText theme={theme}>😩 Unsupported File Type</UnsupportedText>
          </TextWrapper>
        );
    }
  };

  return (
    <FlexWrapper>
      {renderContent()}
      <Show when={!isTransfer}>
        <Text theme={theme} style={{ margin: '0.25rem 0' }}>
          {`#${inscription.origin?.num}`}
        </Text>
      </Show>
    </FlexWrapper>
  );
};
