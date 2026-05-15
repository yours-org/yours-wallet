import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useViewport } from '../hooks/useViewport';
import { sleep } from '../utils/sleep';
import { Input } from './Input';
import { useServiceContext } from '../hooks/useServiceContext';
import { YoursIcon } from './YoursIcon';
import { sendMessageAsync } from '../utils/chromeHelpers';

export type UnlockWalletProps = {
  onUnlock: () => void;
};

export const UnlockWallet = (props: UnlockWalletProps) => {
  const { onUnlock } = props;
  const { theme } = useTheme();
  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const { isMobile } = useViewport();
  const { chromeStorageService } = useServiceContext();

  const handleUnlock = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isProcessing) return;
    setIsProcessing(true);
    await sleep(25);

    const isVerified = await chromeStorageService.verifyPassword(password);
    if (isVerified) {
      setVerificationFailed(false);
      const timestamp = Date.now();
      await chromeStorageService.update({ lastActiveTime: timestamp });

      try {
        const response = await sendMessageAsync<{ success: boolean; error?: string }>({
          action: 'WALLET_UNLOCKED',
        });
        if (!response?.success) {
          console.error('Wallet unlock failed:', response?.error);
        }
      } catch (error) {
        console.error('Wallet unlock error:', error);
      }

      onUnlock();
    } else {
      setVerificationFailed(true);
      setTimeout(() => {
        setVerificationFailed(false);
        setIsProcessing(false);
      }, 900);
    }
  };

  const outlineLeft = theme.color.component.secondaryOutlineButtonGradientLeft;
  const outlineRight = theme.color.component.secondaryOutlineButtonGradientRight;
  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const bg = theme.color.global.walletBackground;

  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{
        width: isMobile ? '100vw' : '22.5rem',
        height: isMobile ? '100vh' : '33.75rem',
        backgroundColor: bg,
        color: contrast,
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="mb-8"
      >
        <YoursIcon width="4rem" />
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3, ease: 'easeOut' }}
        className="text-xl font-bold mb-1 tracking-tight"
        style={{ color: contrast }}
      >
        Welcome back
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.18 }}
        className="text-xs mb-8"
        style={{ color: gray }}
      >
        Enter your password to unlock
      </motion.p>

      {/* Form */}
      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24, duration: 0.3 }}
        onSubmit={handleUnlock}
        className="flex flex-col items-center w-full gap-3"
      >
        <Input
          theme={theme}
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          shake={verificationFailed ? 'true' : 'false'}
          autoFocus
          onKeyDown={(e) => e.stopPropagation()}
        />

        <div className="flex justify-center w-full">
          <motion.div
            whileHover={!isProcessing && password !== '' ? { scale: 1.02 } : undefined}
            whileTap={!isProcessing && password !== '' ? { scale: 0.98 } : undefined}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="flex items-center w-[87%] p-px rounded-xl"
            style={{ background: `linear-gradient(135deg, ${outlineLeft}, ${outlineRight})` }}
          >
            <button
              type="submit"
              disabled={isProcessing || password === ''}
              className="relative inline-flex items-center justify-center w-full font-bold text-sm rounded-xl h-10 px-4 outline-none select-none cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none gap-2"
              style={{
                backgroundColor: bg,
                color: contrast,
                fontFamily: "'Inter', Arial, Helvetica, sans-serif",
              }}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Unlocking...
                </>
              ) : (
                'Unlock'
              )}
            </button>
          </motion.div>
        </div>
      </motion.form>
    </div>
  );
};
