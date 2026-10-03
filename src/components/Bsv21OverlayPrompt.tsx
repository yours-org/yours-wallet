import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { Theme } from '../theme.types';
import { Button } from './Button';
import { Show } from './Show';
import { PageLoader } from './PageLoader';

/**
 * Why sendBsv21 could not validate the transfer:
 * - not-active: the token's overlay is not funded, so nothing is validated
 * - queued: the overlay has the outputs but has not validated them yet
 * - not-valid: the overlay does not recognize enough of the outputs
 * - not-found: the overlay has never seen the token
 */
export type Bsv21OverlayIssue = 'not-active' | 'queued' | 'not-valid' | 'not-found';

export type Bsv21OverlayPromptProps = {
  show: boolean;
  theme: Theme;
  issue: Bsv21OverlayIssue;
  tokenName: string;
  /** Satoshis the overlay asks for to activate; shown for not-active. */
  fundingSats?: number;
  processingMessage?: string;
  onFund: () => void;
  onSendUnverified: () => void;
  onCancel: () => void;
};

const WARN = '#F79009';

const copy = (issue: Bsv21OverlayIssue, tokenName: string) => {
  switch (issue) {
    case 'not-active':
      return {
        title: 'Overlay not funded',
        body: `The overlay that validates ${tokenName} isn't funded, so it can't confirm your tokens before you send them. Funding it turns validation back on for everyone holding ${tokenName}.`,
      };
    case 'queued':
      return {
        title: 'Still validating',
        body: `The overlay is still working through ${tokenName} transfers and hasn't reached yours yet. Try again in a few minutes.`,
      };
    case 'not-valid':
      return {
        title: 'Tokens not validated',
        body: `The overlay doesn't recognize enough of your ${tokenName} as valid to cover this transfer.`,
      };
    case 'not-found':
      return {
        title: 'Unknown token',
        body: `The overlay has no record of ${tokenName}, so it can't confirm your tokens before you send them.`,
      };
  }
};

const formatBsv = (sats: number) => `${(sats / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 })} BSV`;

export const Bsv21OverlayPrompt = (props: Bsv21OverlayPromptProps) => {
  const { show, theme, issue, tokenName, fundingSats, processingMessage, onFund, onSendUnverified, onCancel } = props;

  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const bg = theme.color.global.walletBackground;
  const { title, body } = copy(issue, tokenName);
  const canFund = issue === 'not-active';

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
            width: '100%',
            height: '100%',
            backgroundColor: bg,
            zIndex: 100,
          }}
        >
          <Show
            when={!!processingMessage}
            whenFalseContent={
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="flex flex-col items-center text-center px-6 w-full"
              >
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-full mb-4"
                  style={{ backgroundColor: `${WARN}1F` }}
                >
                  <AlertTriangle size={24} style={{ color: WARN }} />
                </div>

                <h2 className="text-xl font-bold mb-2" style={{ color: contrast }}>
                  {title}
                </h2>
                <p className="text-sm mb-5 leading-relaxed" style={{ color: gray }}>
                  {body}
                </p>

                <Show when={canFund && !!fundingSats}>
                  <div className="w-full mb-5">
                    <div
                      className="flex justify-between items-center px-3 py-2 rounded-lg text-sm"
                      style={{ backgroundColor: `${contrast}08` }}
                    >
                      <span style={{ color: gray }}>Funding</span>
                      <span className="font-semibold" style={{ color: contrast }}>
                        ~{formatBsv(fundingSats ?? 0)}
                      </span>
                    </div>
                    <p className="text-[11px] mt-1.5 leading-relaxed text-left px-1" style={{ color: gray }}>
                      An estimate. If the overlay finds more history than expected, it may ask for a small top-up.
                    </p>
                  </div>
                </Show>

                <div className="flex flex-col items-center gap-2 w-[87%]">
                  <Show
                    when={canFund}
                    whenFalseContent={<Button theme={theme} type="primary" label="OK" onClick={onCancel} />}
                  >
                    <Button theme={theme} type="primary" label="Fund overlay" onClick={onFund} />
                    <Button theme={theme} type="secondary-outline" label="Cancel" onClick={onCancel} />
                  </Show>
                </div>

                <div className="w-full mt-5 pt-4" style={{ borderTop: `1px solid ${gray}22` }}>
                  <p className="text-[11px] mb-2 leading-relaxed" style={{ color: gray }}>
                    Sending unverified skips the check. If any token it spends is invalid, the whole transfer is invalid
                    and every token in it is lost.
                  </p>
                  <button
                    type="button"
                    onClick={onSendUnverified}
                    className="text-xs font-semibold bg-transparent border-0 outline-none cursor-pointer"
                    style={{ color: WARN }}
                  >
                    Send unverified anyway
                  </button>
                </div>
              </motion.div>
            }
          >
            <PageLoader theme={theme} message={processingMessage} />
          </Show>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
