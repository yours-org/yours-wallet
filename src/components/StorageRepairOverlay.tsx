import { useContext } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Database, X } from 'lucide-react';
import { BottomMenuContext } from '../contexts/BottomMenuContext';
import { useTheme } from '../hooks/useTheme';
import { useStorageRepair } from '../hooks/useStorageRepair';
import type { ReconcileOutcome, ReconcilePhase, ReconcileRecord } from '../services/storageReconcile';
import { Button } from './Button';

const ACCENT = '#A1FF8B';
const FAIL = '#F97066';
const GRAY = '#98A2B3';
const DIM = '#475467';

/** The reconcile's phases, grouped into the few steps the user sees. */
const STEPS: { label: string; phases: ReconcilePhase[] }[] = [
  { label: 'Reading wallet data', phases: ['read-local', 'read-remote'] },
  { label: 'Checking spends on chain', phases: ['check-chain'] },
  { label: 'Syncing records', phases: ['push-to-remote', 'push-to-local', 'apply-corrections', 'push-corrections'] },
  { label: 'Verifying', phases: ['verify'] },
];

type StepState = 'done' | 'active' | 'failed' | 'pending';

const stepIndex = (phase?: ReconcilePhase): number => (phase ? STEPS.findIndex((s) => s.phases.includes(phase)) : 0);

/**
 * Where each step ended up. A failed run keeps the phase it stopped in; a run
 * that finished with differences failed its verification.
 */
const stepStates = (record: ReconcileRecord, outcome: ReconcileOutcome): StepState[] => {
  const at =
    outcome === 'clean' ? STEPS.length : outcome === 'differences' ? STEPS.length - 1 : stepIndex(record.phase);
  const atState: StepState = outcome === 'running' ? 'active' : 'failed';
  return STEPS.map((_, i) => (i < at ? 'done' : i === at ? atState : 'pending'));
};

const Spinner = () => (
  <motion.div
    className="w-3.5 h-3.5 rounded-full"
    style={{ border: `2px solid ${ACCENT}33`, borderTopColor: ACCENT }}
    animate={{ rotate: 360 }}
    transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
  />
);

const StepIcon = ({ state }: { state: StepState }) => {
  if (state === 'active') return <Spinner />;
  if (state === 'pending') return <div className="w-1.5 h-1.5 rounded-full" style={{ background: DIM }} />;
  const color = state === 'done' ? ACCENT : FAIL;
  return (
    <motion.div
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="w-5 h-5 rounded-full flex items-center justify-center"
      style={{ background: `${color}1F` }}
    >
      {state === 'done' ? (
        <Check size={12} color={color} strokeWidth={3} />
      ) : (
        <X size={12} color={color} strokeWidth={3} />
      )}
    </motion.div>
  );
};

/**
 * Covers the popup while a storage repair holds the wallet's sync lock, then
 * holds the result (green or red) until the user continues.
 */
export const StorageRepairOverlay = () => {
  const { theme } = useTheme();
  const menu = useContext(BottomMenuContext);
  const { record, outcome, acknowledge } = useStorageRepair();

  const visible = !!record && !!outcome && (outcome === 'running' || !record.acknowledged);
  const running = outcome === 'running';
  const success = outcome === 'clean';
  const states = record && outcome ? stepStates(record, outcome) : [];

  const continueTo = async (target: 'wallet' | 'troubleshooting') => {
    await acknowledge();
    if (target === 'wallet') menu?.handleSelect('bsv');
    else menu?.handleSelect('settings', 'troubleshooting');
  };

  const title = running
    ? 'Repairing Wallet Sync'
    : success
      ? 'Wallet Sync Repaired'
      : outcome === 'failed'
        ? 'Sync Repair Failed'
        : 'Sync Repair Incomplete';
  const subtitle = running
    ? 'This can take a few minutes'
    : success
      ? 'Local and remote storage match'
      : 'Nothing was removed from your wallet';
  const color = running || success ? ACCENT : FAIL;

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
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full flex flex-col items-center"
          >
            {/* Status icon: a turning ring while running, then the result */}
            <div className="relative w-16 h-16 mb-5">
              {running ? (
                <>
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
                </>
              ) : (
                <motion.div
                  key={outcome}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                  className="absolute inset-0 rounded-full flex items-center justify-center"
                  style={{ background: `${color}1A`, border: `2px solid ${color}` }}
                >
                  {success ? (
                    <Check size={28} color={color} strokeWidth={3} />
                  ) : (
                    <X size={28} color={color} strokeWidth={3} />
                  )}
                </motion.div>
              )}
            </div>

            <h2 className="text-base font-bold m-0" style={{ color: '#FFFFFF' }}>
              {title}
            </h2>
            <p className="text-xs mt-1 mb-5" style={{ color: running ? GRAY : color }}>
              {subtitle}
            </p>

            {/* Steps */}
            <div
              className="w-full rounded-xl px-4 py-1 bg-[#17191E]"
              style={{ border: `1px solid ${running ? 'rgba(152,162,179,0.12)' : `${color}33`}` }}
            >
              {STEPS.map((step, i) => {
                const state = states[i];
                return (
                  <div key={step.label} className="flex items-center gap-3 py-2.5">
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      <StepIcon state={state} />
                    </div>
                    <span
                      className="text-sm flex-1"
                      style={{
                        color:
                          state === 'active' ? '#FFFFFF' : state === 'failed' ? FAIL : state === 'done' ? GRAY : DIM,
                        fontWeight: state === 'active' || state === 'failed' ? 600 : 400,
                      }}
                    >
                      {step.label}
                    </span>
                    {state === 'active' && !!record.phaseItems && (
                      <span className="text-[11px] tabular-nums" style={{ color: GRAY }}>
                        {record.phaseItems.toLocaleString()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {running ? (
              <p className="text-[11px] mt-4" style={{ color: DIM }}>
                Keep this window open until it finishes
              </p>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="w-full mt-5"
              >
                {success ? (
                  <Button
                    theme={theme}
                    type="primary"
                    label="Continue to Wallet"
                    onClick={() => continueTo('wallet')}
                  />
                ) : (
                  <Button
                    theme={theme}
                    type="warn"
                    label="Continue to Troubleshooting"
                    style={{ background: FAIL, color: '#FFFFFF' }}
                    onClick={() => continueTo('troubleshooting')}
                  />
                )}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
