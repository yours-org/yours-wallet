/**
 * "Is one of your registered USB keys inserted?" Used by add, rotate, and
 * disable. Polls every two seconds while the key is absent, asks Chrome to
 * re-confirm access after a browser restart, and offers the picker as a way
 * to re-find a drive whose saved handle no longer works.
 */
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Usb } from 'lucide-react';
import { Button } from '../../components/Button';
import { useTheme } from '../../hooks/useTheme';
import {
  adoptPickedDrive,
  getHandle,
  pickDrive,
  probeSticks,
  requestHandlePermission,
  type StickProbe,
} from '../../services/UsbKey.service';
import type { UsbSecurity } from '../../services/types/chromeStorage.types';
import { decodeRecoveryCode, verifyMasterCheck } from '../../utils/usbCrypto';
import { ErrorText, Heading, Note, StepBody, TextLink } from './UsbLayout';
import { errorText, isAbort, MONO, MUTED } from './usbHelpers';

export type PresentStick = Extract<StickProbe, { status: 'ok' }>;

const RETRY_MS = 2000;

export const useStickProbe = (usbSecurity: UsbSecurity, onOk: (probe: PresentStick) => void) => {
  const [probe, setProbe] = useState<StickProbe | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onOkRef = useRef(onOk);
  onOkRef.current = onOk;
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const run = async () => {
      if (doneRef.current) return;
      let result: StickProbe;
      try {
        result = await probeSticks(usbSecurity);
      } catch {
        result = { status: 'absent' };
      }
      if (cancelled) return;
      setProbe(result);
      if (result.status === 'ok') {
        doneRef.current = true;
        onOkRef.current(result);
        return;
      }
      if (result.status === 'absent' || result.status === 'no-handles') {
        timer = window.setTimeout(run, RETRY_MS);
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [usbSecurity, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  /** Needs a user gesture: Chrome shows its own bubble per handle. */
  const allowAccess = useCallback(async () => {
    if (probe?.status !== 'permission') return;
    setBusy(true);
    setError(null);
    try {
      for (const id of probe.stickIds) {
        const handle = await getHandle(id);
        if (handle) await requestHandlePermission(handle);
      }
    } finally {
      setBusy(false);
      retry();
    }
  }, [probe, retry]);

  const findKey = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      let handle: FileSystemDirectoryHandle;
      try {
        handle = await pickDrive();
      } catch (e) {
        if (isAbort(e)) return;
        throw e;
      }
      const result = await adoptPickedDrive(handle, usbSecurity);
      if (result.status === 'ok') {
        doneRef.current = true;
        setProbe(result);
        onOkRef.current(result);
        return;
      }
      setError("That drive doesn't hold a registered key.");
      retry();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, [usbSecurity, retry]);

  return { probe, busy, error, allowAccess, findKey, retry };
};

/** Presence UI without the recovery-code alternative. */
const PresenceBody = ({ probe, busy, error, allowAccess, findKey }: ReturnType<typeof useStickProbe>) => {
  const { theme } = useTheme();
  const waiting = probe === null || probe.status === 'absent' || probe.status === 'no-handles';
  return (
    <>
      <div
        className="flex items-center justify-center gap-3 w-full rounded-xl py-5 mb-3"
        style={{ backgroundColor: theme.color.global.row }}
      >
        {probe?.status === 'ok' ? (
          <Usb size={28} style={{ color: theme.color.component.primaryButtonLeftGradient }} />
        ) : (
          <>
            <Loader2 size={18} className="animate-spin" style={{ color: MUTED }} />
            <span className="text-sm" style={{ color: MUTED }}>
              {probe === null
                ? 'Checking for your USB key…'
                : probe.status === 'permission'
                  ? 'Allow Chrome to read your USB key'
                  : 'Insert a registered USB key'}
            </span>
          </>
        )}
      </div>
      {probe?.status === 'permission' && (
        <Button
          theme={theme}
          type="primary"
          label="Allow USB access"
          onClick={() => void allowAccess()}
          loading={busy}
        />
      )}
      {waiting && (
        <Button
          theme={theme}
          type="secondary-outline"
          label="Find my USB key"
          onClick={() => void findKey()}
          loading={busy}
        />
      )}
      <ErrorText>{error}</ErrorText>
    </>
  );
};

export type PresenceStepProps = {
  usbSecurity: UsbSecurity;
  title?: string;
  subtitle?: string;
  onPresent: (probe: PresentStick) => void;
};

/** Add-key step (a): block until a registered stick opens the master. */
export const PresenceStep = ({ usbSecurity, title, subtitle, onPresent }: PresenceStepProps) => {
  const state = useStickProbe(usbSecurity, onPresent);
  return (
    <StepBody stepKey="presence">
      <Heading
        title={title ?? 'Insert a registered USB key'}
        subtitle={subtitle ?? 'Any key you already registered.'}
      />
      <PresenceBody {...state} />
    </StepBody>
  );
};

export type Identified = {
  master: string;
  /** Set when the master came from an inserted stick rather than the recovery code. */
  handle?: FileSystemDirectoryHandle;
  stickId?: string;
};

export type IdentityStepProps = {
  usbSecurity: UsbSecurity;
  title?: string;
  subtitle?: string;
  onIdentified: (result: Identified) => void;
};

/** Rotate/disable step (a): a registered stick, or the current recovery code. */
export const IdentityStep = ({ usbSecurity, title, subtitle, onIdentified }: IdentityStepProps) => {
  const { theme } = useTheme();
  const state = useStickProbe(usbSecurity, (p) =>
    onIdentified({ master: p.master, handle: p.handle, stickId: p.stickId }),
  );
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setCodeError(null);
    setCodeBusy(true);
    try {
      const master = await decodeRecoveryCode(code);
      if (!master) {
        setCodeError('Not a valid recovery code.');
        return;
      }
      if (!(await verifyMasterCheck(master, usbSecurity.masterCheck))) {
        setCodeError("This code doesn't belong to this wallet.");
        return;
      }
      onIdentified({ master });
    } finally {
      setCodeBusy(false);
    }
  };

  return (
    <StepBody stepKey="identity">
      <Heading
        title={title ?? 'Confirm it’s you'}
        subtitle={subtitle ?? 'Insert a registered USB key or enter your recovery code.'}
      />
      <PresenceBody {...state} />
      {!showCode && state.probe?.status !== 'ok' && (
        <TextLink label="Use my recovery code instead" onClick={() => setShowCode(true)} />
      )}
      {showCode && state.probe?.status !== 'ok' && (
        <form onSubmit={(e) => void submitCode(e)} className="flex flex-col items-center w-full mt-3">
          <Note>Enter the code you wrote down.</Note>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={3}
            spellCheck={false}
            autoCapitalize="characters"
            autoComplete="off"
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
            <Button
              theme={theme}
              type="primary"
              label="Use recovery code"
              isSubmit
              disabled={!code.trim()}
              loading={codeBusy}
            />
          </div>
          <ErrorText>{codeError}</ErrorText>
        </form>
      )}
    </StepBody>
  );
};
