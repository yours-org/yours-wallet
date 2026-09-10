import { PropsWithChildren, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Info } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { DANGER, INTER, MUTED, WARN } from './usbHelpers';

export const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

/** Full-window surface: theme background, contrast text, padding, scrolls when a step is tall. */
export const UsbShell = ({ children }: PropsWithChildren) => {
  const { theme } = useTheme();
  return (
    <div
      className="flex flex-col items-center w-full min-h-screen overflow-y-auto"
      style={{
        backgroundColor: theme.color.global.walletBackground,
        color: theme.color.global.contrast,
        fontFamily: INTER,
        padding: '1.5rem 1.5rem 2rem',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
};

export type StepperProps = {
  steps: string[];
  current: number;
};

/** Segmented progress plus "Step n of N · name". */
export const Stepper = ({ steps, current }: StepperProps) => {
  const { theme } = useTheme();
  const on = theme.color.component.primaryButtonLeftGradient;
  const off = theme.color.global.gray + '40';
  return (
    <div className="w-full mb-5">
      <div className="flex gap-1 w-full mb-2">
        {steps.map((s, i) => (
          <div
            key={s}
            className="h-1 flex-1 rounded-full transition-colors duration-300"
            style={{ backgroundColor: i <= current ? on : off }}
          />
        ))}
      </div>
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
        Step {current + 1} of {steps.length} · {steps[current]}
      </p>
    </div>
  );
};

export const Heading = ({ title, subtitle }: { title: string; subtitle?: ReactNode }) => {
  const { theme } = useTheme();
  return (
    <div className="w-full mb-4">
      <h1 className="text-xl font-bold tracking-tight m-0 mb-1" style={{ color: theme.color.global.contrast }}>
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm m-0 leading-snug" style={{ color: MUTED }}>
          {subtitle}
        </p>
      )}
    </div>
  );
};

export const StepBody = ({ children, stepKey }: PropsWithChildren<{ stepKey: string }>) => (
  <motion.div
    key={stepKey}
    variants={fade}
    initial="initial"
    animate="animate"
    exit="exit"
    className="flex flex-col items-center w-full"
  >
    {children}
  </motion.div>
);

export const ErrorText = ({ children }: { children?: ReactNode }) =>
  children ? (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-xs text-center m-0 mt-2 px-4"
      style={{ color: DANGER }}
      role="alert"
    >
      {children}
    </motion.p>
  ) : null;

export const Note = ({ children, tone = 'info' }: PropsWithChildren<{ tone?: 'info' | 'warn' }>) => {
  const { theme } = useTheme();
  const color = tone === 'warn' ? WARN : MUTED;
  const Icon = tone === 'warn' ? AlertTriangle : Info;
  return (
    <div
      className="flex gap-2 w-full rounded-xl p-3 mb-3 text-xs leading-snug"
      style={{
        backgroundColor: theme.color.global.row,
        border: `1px solid ${color}33`,
        color: theme.color.global.contrast,
      }}
    >
      <Icon size={14} className="shrink-0 mt-px" style={{ color }} />
      <div>{children}</div>
    </div>
  );
};

export const Bullets = ({ items }: { items: ReactNode[] }) => (
  <ul className="m-0 pl-4 space-y-1">
    {items.map((it, i) => (
      <li key={i}>{it}</li>
    ))}
  </ul>
);

/** Small text-only action under the main buttons. */
export const TextLink = ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="mt-3 text-xs bg-transparent border-none cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed"
    style={{ color: MUTED, fontFamily: INTER }}
  >
    {label}
  </button>
);
