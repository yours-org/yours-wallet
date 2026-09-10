/**
 * Reusable steps for the USB window flows. Each step owns its own inline
 * error state and never navigates on failure, so cancelling the OS picker or
 * mistyping a code leaves the user where they were.
 */
import { FormEvent, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, CheckCircle2, Copy, HardDrive } from 'lucide-react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useTheme } from '../../hooks/useTheme';
import { pickDrive } from '../../services/UsbKey.service';
import { decodeRecoveryCode, encodeRecoveryCode } from '../../utils/usbCrypto';
import { ErrorText, Heading, Note, StepBody, TextLink } from './UsbLayout';
import { errorText, INTER, isAbort, MONO, MUTED, WARN } from './usbHelpers';

// --- Choose drive ---

export type ChooseDriveStepProps = {
  title?: string;
  subtitle?: string;
  /** Receives the picked handle. Throw to show an inline error and stay on the step. */
  onPicked: (handle: FileSystemDirectoryHandle) => Promise<void>;
};

export const ChooseDriveStep = ({ title = 'Choose your USB drive', subtitle, onPicked }: ChooseDriveStepProps) => {
  const { theme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async () => {
    setError(null);
    setBusy(true);
    try {
      let handle: FileSystemDirectoryHandle;
      try {
        handle = await pickDrive();
      } catch (e) {
        if (isAbort(e)) return; // user closed the picker; stay here
        throw e;
      }
      await onPicked(handle);
    } catch (e) {
      setError(errorText(e, 'Could not use that drive'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepBody stepKey="choose-drive">
      <Heading title={title} subtitle={subtitle} />
      <Note>
        The dialog will say <strong>&ldquo;Yours Wallet wants to edit files&rdquo;</strong>. Pick the USB drive itself,
        at its top level, not a folder inside it.
      </Note>
      <div
        className="flex items-center justify-center w-full rounded-xl py-6 mb-3"
        style={{ backgroundColor: theme.color.global.row }}
      >
        <HardDrive size={40} style={{ color: MUTED }} />
      </div>
      <Button theme={theme} type="primary" label="Choose USB drive" onClick={() => void choose()} loading={busy} />
      <ErrorText>{error}</ErrorText>
    </StepBody>
  );
};

// --- Label ---

export type LabelStepProps = {
  defaultLabel: string;
  note?: string;
  buttonLabel?: string;
  /** Throw to show an inline error and stay. */
  onNext: (label: string) => Promise<void> | void;
};

export const LabelStep = ({ defaultLabel, note, buttonLabel = 'Continue', onNext }: LabelStepProps) => {
  const { theme } = useTheme();
  const [label, setLabel] = useState(defaultLabel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setLabel(defaultLabel), [defaultLabel]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    setError(null);
    setBusy(true);
    try {
      await onNext(trimmed);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepBody stepKey="label">
      <Heading title="Name this USB key" subtitle="A short name so you can tell your keys apart in Settings." />
      {note && <Note>{note}</Note>}
      <form onSubmit={(e) => void submit(e)} className="flex flex-col items-center w-full">
        <Input
          theme={theme}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="USB key name"
          maxLength={40}
          autoFocus
        />
        <div className="w-full mt-2">
          <Button theme={theme} type="primary" label={buttonLabel} isSubmit disabled={!label.trim()} loading={busy} />
        </div>
      </form>
      <ErrorText>{error}</ErrorText>
    </StepBody>
  );
};

// --- Recovery code: show once, then type back ---

export type RecoveryCodeStepProps = {
  master: string;
  onConfirmed: () => void;
};

const CodeBox = ({ code }: { code: string }) => {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; the code is still on screen.
    }
  };
  return (
    <div
      className="relative w-full rounded-xl p-3 pr-10 mb-3"
      style={{ backgroundColor: theme.color.global.row, border: `1px solid ${theme.color.global.gray}40` }}
    >
      <div className="flex flex-wrap gap-x-2 gap-y-1 justify-center">
        {code.split('-').map((group, i) => (
          <span
            key={i}
            className="text-sm tracking-wider select-all"
            style={{ fontFamily: MONO, color: theme.color.global.contrast }}
          >
            {group}
          </span>
        ))}
      </div>
      <motion.button
        type="button"
        onClick={() => void copy()}
        whileTap={{ scale: 0.9 }}
        className="absolute top-2 right-2 p-1.5 rounded-lg border-none cursor-pointer bg-transparent"
        style={{ color: copied ? theme.color.component.primaryButtonLeftGradient : MUTED }}
        title="Copy recovery code"
        aria-label="Copy recovery code"
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </motion.button>
    </div>
  );
};

export const RecoveryCodeStep = ({ master, onConfirmed }: RecoveryCodeStepProps) => {
  const { theme } = useTheme();
  const [code, setCode] = useState<string | null>(null);
  const [phase, setPhase] = useState<'show' | 'verify'>('show');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void encodeRecoveryCode(master).then((c) => {
      if (!cancelled) setCode(c);
    });
    return () => {
      cancelled = true;
    };
  }, [master]);

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const decoded = await decodeRecoveryCode(typed);
      if (decoded !== master) {
        setError("That doesn't match the recovery code. Check it and try again.");
        return;
      }
      onConfirmed();
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'show') {
    return (
      <StepBody stepKey="recovery-show">
        <Heading
          title="Your recovery code"
          subtitle="Write this down and keep it somewhere safe, away from the USB key."
        />
        <Note tone="warn">
          This code is shown <strong>once</strong>. It restores access if every USB key is lost. Without it and without
          a USB key, this wallet can only be restored from your backup.
        </Note>
        {code ? <CodeBox code={code} /> : null}
        <Button
          theme={theme}
          type="primary"
          label="I've written it down"
          disabled={!code}
          onClick={() => setPhase('verify')}
        />
      </StepBody>
    );
  }

  return (
    <StepBody stepKey="recovery-verify">
      <Heading
        title="Confirm your recovery code"
        subtitle="Type the code you wrote down. Dashes and case don't matter."
      />
      <form onSubmit={(e) => void verify(e)} className="flex flex-col items-center w-full">
        <textarea
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          rows={3}
          spellCheck={false}
          autoCapitalize="characters"
          autoComplete="off"
          autoFocus
          placeholder="XXXXX-XXXXX-XXXXX-…"
          className="w-[85%] px-4 py-3 mx-1 my-1 rounded-xl border text-sm outline-none resize-none uppercase"
          style={{
            backgroundColor: theme.color.global.row,
            borderColor: theme.color.global.gray + '40',
            color: theme.color.global.contrast,
            fontFamily: MONO,
            letterSpacing: '0.05em',
          }}
        />
        <div className="w-full mt-2">
          <Button theme={theme} type="primary" label="Confirm" isSubmit disabled={!typed.trim()} loading={busy} />
        </div>
      </form>
      <ErrorText>{error}</ErrorText>
      <TextLink label="Show the code again" onClick={() => setPhase('show')} />
    </StepBody>
  );
};

// --- Password ---

export type PasswordStepProps = {
  title?: string;
  subtitle?: string;
  buttonLabel: string;
  busyLabel?: string;
  /** Extra controls rendered between the input and the button (e.g. a checkbox). */
  extra?: React.ReactNode;
  /** Return an error string to show inline and stay; return null on success. */
  onConfirm: (password: string) => Promise<string | null>;
};

export const PasswordStep = ({
  title = 'Enter your password',
  subtitle,
  buttonLabel,
  extra,
  onConfirm,
}: PasswordStepProps) => {
  const { theme } = useTheme();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !password) return;
    setError(null);
    setBusy(true);
    try {
      const err = await onConfirm(password);
      if (err) {
        setError(err);
        setShake(true);
        setTimeout(() => setShake(false), 600);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepBody stepKey="password">
      <Heading title={title} subtitle={subtitle} />
      <form onSubmit={(e) => void submit(e)} className="flex flex-col items-center w-full">
        <Input
          theme={theme}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          shake={shake ? 'true' : 'false'}
          autoFocus
          onKeyDown={(e) => e.stopPropagation()}
        />
        {extra}
        <div className="w-full mt-2">
          <Button theme={theme} type="primary" label={buttonLabel} isSubmit disabled={!password} loading={busy} />
        </div>
      </form>
      <ErrorText>{error}</ErrorText>
    </StepBody>
  );
};

export const Checkbox = ({
  checked,
  onChange,
  label,
  warning,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  warning?: string;
}) => {
  const { theme } = useTheme();
  return (
    <label className="flex gap-2 w-[85%] mt-2 mb-1 cursor-pointer select-none text-xs leading-snug">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 shrink-0 cursor-pointer"
        style={{ accentColor: theme.color.component.primaryButtonLeftGradient }}
      />
      <span style={{ color: theme.color.global.contrast, fontFamily: INTER }}>
        {label}
        {warning && (
          <span className="block mt-0.5" style={{ color: WARN }}>
            {warning}
          </span>
        )}
      </span>
    </label>
  );
};

// --- Done ---

export const DoneStep = ({ title, message }: { title: string; message: string }) => {
  const { theme } = useTheme();
  return (
    <StepBody stepKey="done">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="mb-4 mt-2"
      >
        <CheckCircle2 size={48} style={{ color: theme.color.component.primaryButtonLeftGradient }} />
      </motion.div>
      <h1 className="text-xl font-bold tracking-tight m-0 mb-2 text-center">{title}</h1>
      <p className="text-sm text-center m-0 mb-6 leading-snug px-2" style={{ color: MUTED }}>
        {message}
      </p>
      <Button theme={theme} type="primary" label="Done" onClick={() => window.close()} />
    </StepBody>
  );
};

/** Terminal message for a flow that cannot run (feature off, unsupported browser, ...). */
export const BlockedStep = ({ title, message }: { title: string; message: string }) => {
  const { theme } = useTheme();
  return (
    <StepBody stepKey="blocked">
      <Heading title={title} subtitle={message} />
      <Button theme={theme} type="secondary-outline" label="Close" onClick={() => window.close()} />
    </StepBody>
  );
};
