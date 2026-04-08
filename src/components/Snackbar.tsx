import { SnackbarType } from '../contexts/SnackbarContext';
import { Theme } from '../theme.types';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export type SnackbarProps = {
  /** The message that should be displayed on the snackbar */
  message: string;
  /** The type of snackbar. success | error | info */
  type: SnackbarType | null;
  theme: Theme;
  duration?: number;
};

const getSnackbarConfig = (type: SnackbarType | null, theme: Theme) => {
  switch (type) {
    case 'error':
      return {
        bg: theme.color.component.snackbarError,
        textColor: theme.color.component.snackbarErrorText,
        Icon: AlertCircle,
      };
    case 'info':
      return {
        bg: theme.color.component.snackbarWarning,
        textColor: theme.color.component.snackbarWarningText,
        Icon: Info,
      };
    case 'success':
    default:
      return {
        bg: theme.color.component.snackbarSuccess,
        textColor: theme.color.component.snackbarSuccessText,
        Icon: CheckCircle2,
      };
  }
};

export const Snackbar = (props: SnackbarProps) => {
  const { message, type, theme, duration = 2.5 } = props;
  const { bg, textColor, Icon } = getSnackbarConfig(type, theme);

  return (
    <motion.div
      initial={{ y: 20, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 12, opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="flex items-center gap-2.5 w-[90%] absolute bottom-0 mb-4 mx-auto left-0 right-0 rounded-xl px-4 py-3 z-[9999]"
      style={{ backgroundColor: bg }}
    >
      <Icon size={18} style={{ color: textColor, flexShrink: 0 }} />
      <span className="text-sm font-medium leading-snug flex-1" style={{ color: textColor, wordBreak: 'break-word' }}>
        {message}
      </span>

      {/* Auto-dismiss progress bar */}
      <motion.div
        className="absolute bottom-0 left-0 h-0.5 rounded-b-xl"
        style={{ backgroundColor: textColor + '60', originX: 0 }}
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration, ease: 'linear' }}
      />
    </motion.div>
  );
};
