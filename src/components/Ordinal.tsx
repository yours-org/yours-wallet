import { useEffect, useState } from 'react';
import type { WalletOutput } from '@bsv/sdk';
import { Theme } from '../theme.types';
import { Show } from './Show';
import { getTagValue, getOutputName } from '../utils/format';

function wrapperBase(size?: string): React.CSSProperties {
  const s = size ?? '6.5rem';
  return { height: s, width: s, borderRadius: '12%', cursor: 'pointer' };
}

function selectedBorder(selected: boolean | undefined, color: string): React.CSSProperties {
  return selected ? { border: `0.1rem solid ${color}` } : {};
}

export type JsonProps = {
  theme: Theme;
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

export const Json = ({ theme, children, style }: JsonProps) => (
  <pre
    style={{
      fontFamily: "'DM Mono', monospace",
      fontSize: '0.65rem',
      color: theme.color.component.ordinalTypeJson,
      margin: 0,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      ...style,
    }}
  >
    {children}
  </pre>
);

export type FlexWrapperProps = {
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

export const FlexWrapper = ({ children, style }: FlexWrapperProps) => (
  <div
    style={{
      flex: '0 1 calc(33.333% - 1rem)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      margin: '0.25rem',
      transition: '0.3s ease-in-out',
      ...style,
    }}
    onMouseEnter={(e) => {
      (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.02)';
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
    }}
  >
    {children}
  </div>
);

export type OrdinalProps = {
  theme: Theme;
  url: string;
  isTransfer?: boolean;
  selected?: boolean;
  size?: string;
  output: WalletOutput;
  onClick?: () => void;
};

export const Ordinal = (props: OrdinalProps) => {
  const { url, selected, isTransfer, size, output, theme, onClick } = props;

  const contentType = getTagValue(output.tags, 'type');
  const name = getOutputName(output);

  const [fetchedText, setFetchedText] = useState<string | null>(null);
  const needsTextFetch = contentType?.startsWith('text/') || contentType?.startsWith('application/json');

  useEffect(() => {
    if (!needsTextFetch || !url) return;
    fetch(url)
      .then((r) => r.text())
      .then(setFetchedText)
      .catch(() => setFetchedText(null));
  }, [url, needsTextFetch]);

  const textContent = fetchedText;

  const getJsonContent = (): Record<string, unknown> | undefined => {
    if (!contentType?.startsWith('application/json') || !textContent) return undefined;
    try {
      return JSON.parse(textContent);
    } catch {
      return undefined;
    }
  };

  const s = size ?? '6.5rem';
  const border = selectedBorder(selected, theme.color.component.ordinalSelectedBorder);

  const renderContent = () => {
    switch (true) {
      case contentType?.startsWith('image/svg'):
      case contentType?.startsWith('text/html'):
        return (
          <div style={{ ...wrapperBase(size), ...border }} onClick={onClick}>
            <iframe
              src={url}
              sandbox="true"
              style={{
                height: s,
                width: s,
                borderRadius: '12%',
                border: 'none',
                pointerEvents: 'none',
              }}
            />
          </div>
        );

      case contentType?.startsWith('image/'):
        return (
          <div style={{ ...wrapperBase(size), overflow: 'hidden', ...border }} onClick={onClick}>
            <img
              src={url}
              alt={name}
              loading="lazy"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                borderRadius: 'inherit',
              }}
            />
          </div>
        );

      case contentType?.startsWith('text/'):
        return (
          <div
            style={{
              ...wrapperBase(size),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              overflowX: 'auto',
              backgroundColor: theme.color.global.row,
              ...border,
            }}
            onClick={onClick}
          >
            <p
              style={{
                color: theme.color.component.ordinalTypePlainText,
                textAlign: 'center',
                width: '100%',
                margin: 0,
                fontSize: '90%',
              }}
            >
              {textContent}
            </p>
          </div>
        );

      case contentType?.startsWith('application/json'):
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: s,
              width: s,
              borderRadius: '0.5rem',
              position: 'relative',
              backgroundColor: theme.color.global.row,
              cursor: 'pointer',
              overflow: 'auto',
              ...border,
            }}
            onClick={onClick}
          >
            <Json theme={theme}>{JSON.stringify(getJsonContent(), null, 2)}</Json>
          </div>
        );

      default:
        return (
          <div
            style={{
              ...wrapperBase(size),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              overflowX: 'auto',
              backgroundColor: theme.color.global.row,
              ...border,
            }}
            onClick={onClick}
          >
            <p
              style={{
                color: theme.color.component.ordinalTypeUnsupported,
                textAlign: 'center',
                width: '100%',
                margin: 0,
                fontSize: '90%',
              }}
            >
              Syncing or Unsupported File Type
            </p>
          </div>
        );
    }
  };

  // When rendered inside a full-size card (e.g. OrdCard passes size="100%"), skip
  // the legacy FlexWrapper that constrains content to 33% width — fill the parent
  // instead so images and text occupy the entire card.
  const fillParent = size === '100%' || isTransfer;

  if (fillParent) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {renderContent()}
      </div>
    );
  }

  return (
    <FlexWrapper>
      {renderContent()}
      <Show when={!isTransfer}>
        <p
          style={{
            margin: '0.25rem 0',
            cursor: 'pointer',
            fontSize: '0.75rem',
            color: theme.color.global.contrast,
          }}
          onClick={() => window.open(url, '_blank')}
        >
          {name}
        </p>
      </Show>
    </FlexWrapper>
  );
};
