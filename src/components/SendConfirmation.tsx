import { motion, AnimatePresence } from 'framer-motion';
import { Send } from 'lucide-react';
import { useViewport } from '../hooks/useViewport';
import { Theme } from '../theme.types';
import { Button } from './Button';
import { Show } from './Show';
import { PageLoader } from './PageLoader';

export type SendLineItem = {
  address: string;
  amount: string; // pre-formatted display string (e.g. "0.005 BSV", "$1.50 MNEE", "100 TOKEN")
};

export type SendConfirmationProps = {
  show: boolean;
  theme: Theme;
  icon?: string; // token/asset icon URL
  lineItems: SendLineItem[];
  total?: string; // pre-formatted total (e.g. "0.01 BSV")
  isProcessing?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const truncateAddress = (addr: string) => {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-8)}`;
};

export const SendConfirmation = (props: SendConfirmationProps) => {
  const { show, theme, icon, lineItems, total, isProcessing = false, onConfirm, onCancel } = props;
  const { isMobile } = useViewport();

  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const bg = theme.color.global.walletBackground;
  const primary = theme.color.component.primaryButtonLeftGradient;

  return (
    <AnimatePresence>
      {show && (
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
                {/* Icon cluster: asset icon ··· → send icon */}
                <div className="flex items-center gap-3 mb-4">
                  {icon ? (
                    <img src={icon} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div
                      className="flex items-center justify-center w-10 h-10 rounded-full"
                      style={{ backgroundColor: `${contrast}12` }}
                    >
                      <Send size={18} style={{ color: contrast }} />
                    </div>
                  )}

                  {/* Animated dots connecting the icons */}
                  <div className="flex items-center" style={{ gap: '6px' }}>
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: primary,
                        }}
                        animate={{ opacity: [0.4, 1, 0.4], scale: [0.85, 1.15, 0.85] }}
                        transition={{
                          duration: 1.4,
                          repeat: Infinity,
                          delay: i * 0.25,
                          ease: 'easeInOut',
                        }}
                      />
                    ))}
                  </div>

                  <div
                    className="flex items-center justify-center"
                    style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: 'rgba(59,130,246,0.15)' }}
                  >
                    <Send size={18} style={{ color: '#3B82F6' }} />
                  </div>
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold mb-4" style={{ color: contrast }}>
                  Confirm Send
                </h2>

                {/* Line items */}
                <div className="w-full mb-4 space-y-3 overflow-y-auto" style={{ maxHeight: '12rem' }}>
                  {lineItems.map((item, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center px-3 py-2 rounded-lg text-sm"
                      style={{ backgroundColor: `${contrast}08` }}
                    >
                      <span className="font-mono" style={{ color: gray }}>
                        {truncateAddress(item.address)}
                      </span>
                      <span className="font-semibold" style={{ color: contrast }}>
                        {item.amount}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <Show when={!!total}>
                  <div
                    className="flex justify-between items-center w-full px-3 py-2 mb-6 rounded-lg text-sm font-bold"
                    style={{ borderTop: `1px solid ${gray}33` }}
                  >
                    <span style={{ color: gray }}>Total</span>
                    <span style={{ color: contrast }}>{total}</span>
                  </div>
                </Show>

                <Show when={!total}>
                  <div className="mb-6" />
                </Show>

                {/* Action buttons */}
                <div className="flex items-center gap-3 w-[87%]">
                  <div className="flex-1">
                    <Button theme={theme} type="secondary-outline" label="Cancel" onClick={onCancel} />
                  </div>
                  <div className="flex-1">
                    <Button theme={theme} type="primary" label="Send" onClick={onConfirm} />
                  </div>
                </div>
              </motion.div>
            }
          >
            <PageLoader theme={theme} message="Sending..." />
          </Show>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
