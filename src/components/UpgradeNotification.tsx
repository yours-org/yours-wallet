import { useTheme } from '../hooks/useTheme';
import { motion } from 'framer-motion';
import { YoursIcon } from './YoursIcon';
import { Button } from './Button';
import { Sparkles } from 'lucide-react';

export type UpgradeNotificationProps = {
  onDismiss: () => void;
};

export const UpgradeNotification = ({ onDismiss }: UpgradeNotificationProps) => {
  const { theme } = useTheme();

  return (
    <motion.div
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 32 }}
      className="flex flex-col items-center justify-center w-full h-full absolute z-[1000]"
      style={{ backgroundColor: theme.color.global.walletBackground }}
    >
      {/* Glow backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 60% 40% at 50% 30%, ${theme.color.component.primaryButtonLeftGradient}12 0%, transparent 70%)`,
        }}
      />

      {/* Content card */}
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.12, type: 'spring', stiffness: 320, damping: 28 }}
        className="relative flex flex-col items-center w-[88%] rounded-2xl px-6 py-8 gap-4"
        style={{
          backgroundColor: theme.color.global.row,
          border: `1px solid ${theme.color.global.gray}20`,
        }}
      >
        {/* Badge */}
        <div
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
          style={{
            background: `${theme.color.component.primaryButtonLeftGradient}20`,
            color: theme.color.component.primaryButtonLeftGradient,
          }}
        >
          <Sparkles size={10} />
          New Version
        </div>

        {/* Icon */}
        <YoursIcon width="4rem" />

        {/* Title */}
        <h1 className="text-xl font-bold text-center m-0" style={{ color: theme.color.global.contrast }}>
          Welcome to Yours Wallet 5.0
        </h1>

        {/* Description */}
        <p className="text-sm text-center leading-relaxed m-0" style={{ color: theme.color.global.gray }}>
          This update brings a completely new wallet engine with improved reliability and performance. Your wallet will
          sync automatically.
        </p>

        {/* CTA */}
        <div className="w-full mt-2">
          <Button theme={theme} type="primary" label="Get Started" onClick={onDismiss} />
        </div>
      </motion.div>
    </motion.div>
  );
};
