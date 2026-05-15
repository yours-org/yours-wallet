import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useServiceContext } from '../hooks/useServiceContext';
import { useSnackbar } from '../hooks/useSnackbar';
import { useViewport } from '../hooks/useViewport';
import { Theme } from '../theme.types';
import { sleep } from '../utils/sleep';
import { Button } from './Button';
import { Input } from './Input';
import { PageLoader } from './PageLoader';
import { Show } from './Show';

export type SpeedBumpProps = {
  message: string;
  showSpeedBump: boolean;
  theme: Theme;
  withPassword?: boolean;
  onCancel: () => void;
  onConfirm: (password?: string) => void;
};

export const SpeedBump = (props: SpeedBumpProps) => {
  const { message, onCancel, onConfirm, showSpeedBump, theme, withPassword = false } = props;
  const { isMobile } = useViewport();

  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { addSnackbar } = useSnackbar();
  const { keysService } = useServiceContext();

  const handleConfirm = async () => {
    if (!withPassword) {
      onConfirm();
      return;
    }
    try {
      setIsProcessing(true);
      await sleep(25);

      if (!password) {
        addSnackbar('You must enter a password!', 'error');
        return;
      }

      const isVerified = await keysService.verifyPassword(password);
      if (!isVerified) {
        addSnackbar('Invalid password!', 'error');
        return;
      }

      onConfirm(password);
    } catch (error) {
      console.log(error);
    } finally {
      setIsProcessing(false);
      setPassword('');
    }
  };

  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const bg = theme.color.global.walletBackground;

  return (
    <AnimatePresence>
      {showSpeedBump && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center justify-center"
          style={{
            position: 'absolute',
            inset: 0,
            width: isMobile ? '100vw' : '22.5rem',
            height: isMobile ? '100vh' : '33.75rem',
            backgroundColor: bg,
            zIndex: 100,
          }}
        >
          <Show
            when={isProcessing}
            whenFalseContent={
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="flex flex-col items-center text-center px-6 w-full"
              >
                {/* Warning icon */}
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-full mb-4"
                  style={{ backgroundColor: 'rgba(247,144,9,0.12)' }}
                >
                  <AlertTriangle size={24} style={{ color: '#F79009' }} />
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold mb-2" style={{ color: contrast }}>
                  Are you sure?
                </h2>

                {/* Message */}
                <p className="text-sm mb-6 leading-relaxed" style={{ color: gray }}>
                  {message}
                </p>

                {/* Password input */}
                <Show when={withPassword}>
                  <div className="w-full mb-4">
                    <Input
                      theme={theme}
                      placeholder="Enter Wallet Password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </Show>

                {/* Action buttons */}
                <div className="flex items-center gap-3 w-[87%]">
                  <div className="flex-1">
                    <Button theme={theme} type="secondary-outline" label="Confirm" onClick={handleConfirm} />
                  </div>
                  <div className="flex-1">
                    <Button theme={theme} type="primary" label="Cancel" onClick={onCancel} />
                  </div>
                </div>
              </motion.div>
            }
          >
            <PageLoader theme={theme} message="Processing..." />
          </Show>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
