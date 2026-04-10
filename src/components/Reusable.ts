import React from 'react';

// --- MainContent ---
// Scrollable content area used by BsvWallet
export const MainContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, children, ...props }, ref) =>
    React.createElement(
      'div',
      {
        ref,
        style: {
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          width: '100%',
          height: 'calc(100% - 3.75rem)',
          overflowY: 'auto' as const,
          overflowX: 'hidden' as const,
          ...style,
        },
        ...props,
      },
      children,
    ),
);
MainContent.displayName = 'MainContent';

// --- Warning ---
// Inline colored span used in AppsAndTools and SweepMigration
export const Warning = ({
  children,
  theme,
  style,
  ...props
}: {
  children?: React.ReactNode;
  theme: { color: { component: { snackbarWarning: string } } };
  style?: React.CSSProperties;
} & React.HTMLAttributes<HTMLSpanElement>) =>
  React.createElement(
    'span',
    {
      style: {
        color: theme.color.component.snackbarWarning,
        fontWeight: 700,
        ...style,
      },
      ...props,
    },
    children,
  );

// --- DateTimePicker ---
// Styled datetime-local input used in AppsAndTools
export const DateTimePicker = ({
  theme,
  style,
  className,
  ...props
}: {
  theme: {
    color: {
      global: { row: string; gray: string; contrast: string };
      component: { primaryButtonLeftGradient: string };
    };
  };
  style?: React.CSSProperties;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) =>
  React.createElement(
    'div',
    { className: 'flex justify-center w-full' },
    React.createElement('input', {
      type: 'datetime-local',
      className,
      style: {
        backgroundColor: theme.color.global.row,
        borderRadius: '0.75rem',
        border: `1px solid ${theme.color.global.gray}40`,
        width: '85%',
        height: '2.25rem',
        fontSize: '0.875rem',
        fontFamily: "'Inter', Arial, Helvetica, sans-serif",
        padding: '0.75rem 1rem',
        margin: '0.25rem',
        outline: 'none',
        color: theme.color.global.contrast,
        WebkitAppearance: 'none' as never,
        ...style,
      },
      ...props,
    }),
  );
