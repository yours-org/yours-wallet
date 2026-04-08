import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Theme } from '../theme.types';

export type ButtonStyles = 'primary' | 'secondary' | 'secondary-outline' | 'warn';

export type ButtonProps = {
  label: string;
  type: ButtonStyles;
  theme: Theme;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  isSubmit?: boolean;
  style?: React.CSSProperties;
  loading?: boolean;
};

const springTransition = { type: 'spring', stiffness: 400, damping: 25 };

export const Button = (props: ButtonProps) => {
  const { label, type, onClick, disabled, theme, isSubmit, style, loading } = props;
  const isDisabled = disabled || loading;

  const gradientLeft = theme.color.component.primaryButtonLeftGradient;
  const gradientRight = theme.color.component.primaryButtonRightGradient;
  const outlineLeft = theme.color.component.secondaryOutlineButtonGradientLeft;
  const outlineRight = theme.color.component.secondaryOutlineButtonGradientRight;

  const baseClass =
    'relative inline-flex items-center justify-center w-full font-bold text-sm rounded-xl h-9 px-4 outline-none select-none cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

  const getStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = { fontFamily: "'Inter', Arial, Helvetica, sans-serif" };
    switch (type) {
      case 'primary':
        return {
          ...base,
          background: `linear-gradient(135deg, ${gradientLeft}, ${gradientRight})`,
          color: theme.color.component.primaryButtonText,
          ...style,
        };
      case 'secondary':
        return { ...base, background: 'transparent', color: theme.color.global.gray, marginTop: '0.5rem', ...style };
      case 'secondary-outline':
        return {
          ...base,
          background: theme.color.global.walletBackground,
          color: theme.color.global.contrast,
          margin: 0,
          ...style,
        };
      case 'warn':
        return {
          ...base,
          background: theme.color.component.warningButton,
          color: theme.color.component.warningButtonText,
          ...style,
        };
      default:
        return { ...base, ...style };
    }
  };

  const buttonContent = loading ? (
    <span className="flex items-center gap-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      {label}
    </span>
  ) : (
    label
  );

  // For secondary-outline: scale the entire gradient wrapper so the border isn't clipped
  if (type === 'secondary-outline') {
    return (
      <div className="flex justify-center w-full">
        <motion.div
          whileHover={!isDisabled ? { scale: 1.02 } : undefined}
          whileTap={!isDisabled ? { scale: 0.98 } : undefined}
          transition={springTransition}
          className="flex items-center w-[87%] my-1 p-px rounded-xl"
          style={{ background: `linear-gradient(135deg, ${outlineLeft}, ${outlineRight})` }}
        >
          <button
            type={isSubmit ? 'submit' : 'button'}
            disabled={isDisabled}
            onClick={onClick}
            className={baseClass}
            style={getStyle()}
          >
            {buttonContent}
          </button>
        </motion.div>
      </div>
    );
  }

  // For all other variants: scale the button directly
  return (
    <div className="flex justify-center w-full">
      <div className="w-[87%] my-1">
        <motion.button
          type={isSubmit ? 'submit' : 'button'}
          disabled={isDisabled}
          onClick={onClick}
          className={baseClass}
          style={getStyle()}
          whileHover={!isDisabled ? { scale: 1.02 } : undefined}
          whileTap={!isDisabled ? { scale: 0.98 } : undefined}
          transition={springTransition}
        >
          {buttonContent}
        </motion.button>
      </div>
    </div>
  );
};
