import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Database } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useStorageRepair } from '../hooks/useStorageRepair';
import type { ReconcilePhase } from '../services/storageReconcile';
import { Button } from './Button';

const ACCENT = '#A1FF8B';
const WARN = '#FBBF24';
const GRAY = '#98A2B3';
const DIM = '#475467';

/** The reconcile's phases, grouped into the few steps the user sees. */
const STEPS: { label: string; phases: ReconcilePhase[] }[] = [
  { label: 'Reading wallet data', phases: ['read-local', 'read-remote'] },
  { label: 'Checking spends on chain', phases: ['check-chain'] },
  { label: 'Syncing records', phases: ['push-to-remote', 'push-to-local', 'apply-corrections', 'push-corrections'] },
  { label: 'Verifying', phases: ['verify'] },
];

const stepIndex = (phase?: ReconcilePhase): number => (phase ? STEPS.findIndex((s) => s.phases.includes(phase)) : 0);

const Spinner = () => (
  <motion.div
    className="w-3.5 h-3.5 rounded-full"
    style={{ border: `2px solid ${ACCENT}33`, borderTopColor: ACCENT }}
    animate={{ rotate: 360 }}
    transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
  />
);

/**
 * Covers the popup while a storage repair holds the wallet's sync lock, and
 * after the one-time migration run, explains a result that was not clean
 * until the user dismisses it.
 */
export const StorageRepairOverlay = () => {
  const { theme } = useTheme();
  const { record, outcome, acknowledge } = useStorageRepair();

  const running = outcome === 'running';
  const showResult = !!record && record.trigger === 'migration' && (outcome === 'failed' || outcome === 'differences');
  const visible = running || (showResult && !record?.acknowledged);
  const current = stepIndex(record?.phase);

  return (
    <AnimatePresence>
      {visible && record && (
        <motion.div
          key="storage-repair"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col items-center justify-center w-full h-full z-[1000] absolute px-6"
          style={{ backgroundColor: theme.color.global.walletBackground }}
        >
          {running ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full flex flex-col items-center"
            >
              {/* Icon with a turning ring */}
              <div className="relative w-16 h-16 mb-5">
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ border: `2px solid ${ACCENT}1F`, borderTopColor: ACCENT }}
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}
                />
                <div
                  className="absolute inset-2 rounded-full flex items-center justify-center"
                  style={{ background: `${ACCENT}14` }}
                >
                  <Database size={20} color={ACCENT} />
                </div>
              </div>

              <h2 className="text-base font-bold m-0" style={{ color: '#FFFFFF' }}>
                Repairing Wallet Sync
              </h2>
              <p className="text-xs mt-1 mb-5" style={{ color: GRAY }}>
                This can take a few minutes
              </p>

              {/* Steps */}
              <div
                className="w-full rounded-xl px-4 py-1 bg-[#17191E]"
                style={{ border: '1px solid rgba(152,162,179,0.12)' }}
              >
                {STEPS.map((step, i) => {
                  const done = i < current;
                  const active = i === current;
                  return (
                    <div key={step.label} className="flex items-center gap-3 py-2.5">
                      <div className="w-5 h-5 flex items-center justify-center shrink-0">
                        {done ? (
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ background: `${ACCENT}1F` }}
                          >
                            <Check size={12} color={ACCENT} strokeWidth={3} />
                          </div>
                        ) : active ? (
                          <Spinner />
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: DIM }} />
                        )}
                      </div>
                      <span
                        className="text-sm flex-1"
                        style={{ color: active ? '#FFFFFF' : done ? GRAY : DIM, fontWeight: active ? 600 : 400 }}
                      >
                        {step.label}
                      </span>
                      {active && !!record.phaseItems && (
                        <span className="text-[11px] tabular-nums" style={{ color: GRAY }}>
                          {record.phaseItems.toLocaleString()}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-[11px] mt-4" style={{ color: DIM }}>
                Keep this window open until it finishes
              </p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full flex flex-col items-center text-center"
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
                style={{ background: `${WARN}1A` }}
              >
                <AlertTriangle size={24} color={WARN} />
              </div>
              <h2 className="text-base font-bold m-0" style={{ color: '#FFFFFF' }}>
                {outcome === 'failed' ? "Sync Repair Didn't Finish" : 'Sync Repair Needs Attention'}
              </h2>
              <p className="text-xs mt-2 mb-6 leading-relaxed px-2" style={{ color: GRAY }}>
                Nothing was removed from your wallet. Retry or copy the log from{' '}
                <span style={{ color: '#FFFFFF' }}>Settings › Troubleshooting</span>.
              </p>
              <Button theme={theme} type="primary" label="Got it" onClick={acknowledge} />
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
