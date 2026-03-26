import { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { PrivateKey } from '@bsv/sdk';
import { scanAddressUtxos, prepareSweepInputs, sweepBsv, sweepOrdinals, sweepBsv21 } from '@1sat/actions';
import type { TokenBalance } from '@1sat/actions/dist/sweep/scan';
import type { SweepInput } from '@1sat/actions/dist/sweep';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { HeaderText, Warning } from '../components/Reusable';
import { PageLoader } from '../components/PageLoader';
import { Show } from '../components/Show';
import { TopNav } from '../components/TopNav';
import { YoursIcon } from '../components/YoursIcon';
import { useTheme } from '../hooks/useTheme';
import { useServiceContext } from '../hooks/useServiceContext';
import { BottomMenuContext } from '../contexts/BottomMenuContext';
import { WhiteLabelTheme } from '../theme.types';
import { decrypt } from '../utils/crypto';
import type { Keys } from '../utils/keys';
import type { SweepStep, SweepSelection, SweepTxResult, AddressScanStatus } from '../sweep/types';
import { FaArrowRight, FaCheck, FaCoins, FaExclamationTriangle, FaImage, FaLock, FaTimes } from 'react-icons/fa';

// --- Styled Components ---

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: calc(75%);
  overflow-y: auto;
  overflow-x: hidden;
`;

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 90%;
  padding: 0.5rem 0;
`;

const Subtitle = styled.p<WhiteLabelTheme>`
  font-size: 0.8rem;
  color: ${({ theme }) => theme.color.global.contrast + 'aa'};
  text-align: center;
  margin: 0.25rem 0 1rem;
  line-height: 1.5;
`;

const Card = styled.div<WhiteLabelTheme>`
  width: 100%;
  border: 1px solid ${({ theme }) => theme.color.global.contrast + '15'};
  border-radius: 0.75rem;
  padding: 1rem;
  margin-bottom: 0.75rem;
  background: ${({ theme }) => theme.color.global.contrast + '05'};
`;

const CardHeader = styled.div<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
  font-weight: 600;
  font-size: 0.85rem;
  color: ${({ theme }) => theme.color.global.contrast};
`;

const CardIcon = styled.div<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  background: ${({ theme }) => theme.color.global.primaryTheme + '15'};
  color: ${({ theme }) => theme.color.global.primaryTheme};
  font-size: 0.9rem;
  flex-shrink: 0;
`;

const ScrollableContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 22rem;
  overflow-y: auto;
  padding: 0.25rem 0;
`;

const AssetRow = styled.label<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.color.global.contrast};
  cursor: pointer;
  border-radius: 0.375rem;
  &:hover {
    background: ${({ theme }) => theme.color.global.contrast + '08'};
  }
`;

const Badge = styled.span<WhiteLabelTheme>`
  font-size: 0.65rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 1rem;
  background: ${({ theme }) => theme.color.global.primaryTheme + '18'};
  color: ${({ theme }) => theme.color.global.primaryTheme};
  margin-left: auto;
`;

const ProgressRow = styled.div<WhiteLabelTheme & { $done?: boolean; $error?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
  margin-bottom: 0.4rem;
  border-radius: 0.5rem;
  font-size: 0.8rem;
  background: ${({ theme, $done, $error }) =>
    $error ? '#e53e3e10' : $done ? theme.color.global.primaryTheme + '10' : theme.color.global.contrast + '05'};
  color: ${({ theme, $done, $error }) =>
    $error ? '#e53e3e' : $done ? theme.color.global.primaryTheme : theme.color.global.contrast};
`;

const StatusIcon = styled.div<{ $color: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  background: ${({ $color }) => $color + '20'};
  color: ${({ $color }) => $color};
  font-size: 0.65rem;
  flex-shrink: 0;
`;

const ResultCard = styled.div<WhiteLabelTheme & { $success?: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  border-radius: 0.5rem;
  background: ${({ theme, $success }) => ($success ? theme.color.global.primaryTheme + '08' : '#e53e3e08')};
  border-left: 3px solid ${({ theme, $success }) => ($success ? theme.color.global.primaryTheme : '#e53e3e')};
`;

const TxLink = styled.a<WhiteLabelTheme>`
  font-size: 0.7rem;
  color: ${({ theme }) => theme.color.global.primaryTheme};
  word-break: break-all;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const Notice = styled.div<WhiteLabelTheme>`
  margin-top: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: ${({ theme }) => theme.color.global.primaryTheme + '08'};
  border-left: 3px solid ${({ theme }) => theme.color.global.primaryTheme + '40'};
  font-size: 0.75rem;
  color: ${({ theme }) => theme.color.global.contrast + '90'};
  line-height: 1.5;
`;

const SelectActions = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
`;

const SelectLink = styled.span<WhiteLabelTheme>`
  font-size: 0.7rem;
  color: ${({ theme }) => theme.color.global.primaryTheme};
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
`;

const Checkbox = styled.input`
  width: 1rem;
  height: 1rem;
  accent-color: currentColor;
  flex-shrink: 0;
`;

const Spacer = styled.div<{ $h?: string }>`
  height: ${({ $h }) => $h || '0.5rem'};
`;

const EXPLORER_BASE = 'https://bananablocks.com/tx/';

// --- Component ---

export const SweepMigration = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const menuContext = useContext(BottomMenuContext);
  const { chromeStorageService, apiContext } = useServiceContext();

  const [step, setStep] = useState<SweepStep>('intro');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [legacyKeys, setLegacyKeys] = useState<Keys | null>(null);

  const [scanStatuses, setScanStatuses] = useState<AddressScanStatus[]>([]);
  const [allFunding, setAllFunding] = useState<SweepInput[]>([]);
  const [allOrdinals, setAllOrdinals] = useState<SweepInput[]>([]);
  const [allBsv21, setAllBsv21] = useState<TokenBalance[]>([]);
  const [totalFundingSats, setTotalFundingSats] = useState(0);

  const [selection, setSelection] = useState<SweepSelection>({
    sweepBsv: false,
    selectedOrdinals: new Set(),
    selectedBsv21TokenIds: new Set(),
  });

  const [sweepResults, setSweepResults] = useState<SweepTxResult[]>([]);
  const [currentSweepOp, setCurrentSweepOp] = useState('');

  useEffect(() => {
    menuContext?.clearSelection();
    menuContext?.hideMenu();
    return () => {
      menuContext?.showMenu();
    };
  }, [menuContext]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setPasswordError('');

    const isVerified = chromeStorageService.verifyPassword(password);
    if (!isVerified) {
      setPasswordError('Incorrect password');
      setIsProcessing(false);
      return;
    }

    try {
      const { account, passKey } = chromeStorageService.getCurrentAccountObject();
      if (!account?.encryptedKeys || !passKey) {
        setPasswordError('No encrypted keys found');
        setIsProcessing(false);
        return;
      }
      const decrypted = decrypt(account.encryptedKeys, passKey);
      const keys: Keys = JSON.parse(decrypted);
      if (!keys.walletWif && !keys.ordWif) {
        setPasswordError('No legacy keys found in this account');
        setIsProcessing(false);
        return;
      }
      setLegacyKeys(keys);
      setStep('scanning');
    } catch {
      setPasswordError('Failed to decrypt keys');
    }
    setIsProcessing(false);
  };

  const runScan = useCallback(async () => {
    if (!legacyKeys || !apiContext.services) return;

    const addresses: { address: string; label: string; wif: string }[] = [];
    if (legacyKeys.walletWif) {
      addresses.push({
        address: PrivateKey.fromWif(legacyKeys.walletWif).toPublicKey().toAddress(),
        label: 'Pay',
        wif: legacyKeys.walletWif,
      });
    }
    if (legacyKeys.ordWif) {
      const ordAddr = PrivateKey.fromWif(legacyKeys.ordWif).toPublicKey().toAddress();
      if (!addresses.some((a) => a.address === ordAddr)) {
        addresses.push({ address: ordAddr, label: 'Ordinals', wif: legacyKeys.ordWif });
      }
    }
    if (legacyKeys.identityWif) {
      const idAddr = PrivateKey.fromWif(legacyKeys.identityWif).toPublicKey().toAddress();
      if (!addresses.some((a) => a.address === idAddr)) {
        addresses.push({ address: idAddr, label: 'Identity', wif: legacyKeys.identityWif });
      }
    }

    setScanStatuses(addresses.map((a) => ({ address: a.address, label: a.label, status: 'scanning' })));

    const results: Awaited<ReturnType<typeof scanAddressUtxos>>[] = [];
    const promises = addresses.map(async (addr, i) => {
      try {
        const result = await scanAddressUtxos(apiContext.services!, addr.address);
        results[i] = result;
        setScanStatuses((prev) => prev.map((s, j) => (j === i ? { ...s, status: 'done' } : s)));
      } catch (err) {
        setScanStatuses((prev) => prev.map((s, j) => (j === i ? { ...s, status: 'error', error: String(err) } : s)));
      }
    });

    await Promise.all(promises);

    const funding: SweepInput[] = [];
    const ordinals: SweepInput[] = [];
    const bsv21Map = new Map<string, TokenBalance>();
    let fundingSats = 0;

    for (const r of results) {
      if (!r) continue;
      funding.push(...r.funding);
      ordinals.push(...r.ordinals);
      fundingSats += r.totalFundingSats;
      for (const t of r.bsv21Tokens) {
        const existing = bsv21Map.get(t.tokenId);
        if (existing) {
          existing.inputs.push(...t.inputs);
          existing.totalAmount = String(BigInt(existing.totalAmount) + BigInt(t.totalAmount));
        } else {
          bsv21Map.set(t.tokenId, { ...t });
        }
      }
    }

    setAllFunding(funding);
    setAllOrdinals(ordinals);
    setAllBsv21(Array.from(bsv21Map.values()));
    setTotalFundingSats(fundingSats);
    setStep('review');
  }, [legacyKeys, apiContext.services]);

  useEffect(() => {
    if (step === 'scanning') runScan();
  }, [step, runScan]);

  // Toggle helpers
  const toggleBsv = () => setSelection((s) => ({ ...s, sweepBsv: !s.sweepBsv }));
  const toggleOrdinal = (outpoint: string) =>
    setSelection((s) => {
      const next = new Set(s.selectedOrdinals);
      next.has(outpoint) ? next.delete(outpoint) : next.add(outpoint);
      return { ...s, selectedOrdinals: next };
    });
  const selectAllOrdinals = () =>
    setSelection((s) => ({ ...s, selectedOrdinals: new Set(allOrdinals.map((o) => o.outpoint)) }));
  const deselectAllOrdinals = () => setSelection((s) => ({ ...s, selectedOrdinals: new Set() }));
  const toggleBsv21 = (tokenId: string) =>
    setSelection((s) => {
      const next = new Set(s.selectedBsv21TokenIds);
      next.has(tokenId) ? next.delete(tokenId) : next.add(tokenId);
      return { ...s, selectedBsv21TokenIds: next };
    });

  const hasSelection =
    selection.sweepBsv || selection.selectedOrdinals.size > 0 || selection.selectedBsv21TokenIds.size > 0;

  const executeSweeps = async () => {
    if (!legacyKeys) return;
    setStep('sweeping');
    const results: SweepTxResult[] = [];

    if (selection.sweepBsv && allFunding.length > 0) {
      setCurrentSweepOp('Sweeping BSV...');
      try {
        const inputs = await prepareSweepInputs(apiContext, allFunding);
        const resp = await sweepBsv.execute(apiContext, {
          inputs,
          wif: legacyKeys.walletWif,
          amount: selection.bsvAmount,
        });
        results.push({
          type: 'bsv',
          label: `BSV (${totalFundingSats.toLocaleString()} sats)`,
          txid: resp.txid,
          error: resp.error,
        });
      } catch (err) {
        results.push({ type: 'bsv', label: 'BSV', error: String(err) });
      }
    }

    if (selection.selectedOrdinals.size > 0) {
      setCurrentSweepOp('Sweeping Ordinals...');
      try {
        const selectedInputs = allOrdinals.filter((o) => selection.selectedOrdinals.has(o.outpoint));
        const inputs = await prepareSweepInputs(apiContext, selectedInputs);
        const resp = await sweepOrdinals.execute(apiContext, { inputs, wif: legacyKeys.ordWif });
        results.push({
          type: 'ordinals',
          label: `Ordinals (${selection.selectedOrdinals.size})`,
          txid: resp.txid,
          error: resp.error,
        });
      } catch (err) {
        results.push({ type: 'ordinals', label: 'Ordinals', error: String(err) });
      }
    }

    for (const token of allBsv21) {
      if (!selection.selectedBsv21TokenIds.has(token.tokenId)) continue;
      const label = token.symbol || token.tokenId.slice(0, 8);
      setCurrentSweepOp(`Sweeping ${label}...`);
      try {
        const inputs = await prepareSweepInputs(apiContext, token.inputs);
        const resp = await sweepBsv21.execute(apiContext, {
          inputs: inputs.map((inp) => ({ ...inp, tokenId: token.tokenId, amount: token.totalAmount })),
          wif: legacyKeys.ordWif,
        });
        results.push({ type: 'bsv21', label: `${label} (${token.totalAmount})`, txid: resp.txid, error: resp.error });
      } catch (err) {
        results.push({ type: 'bsv21', label, error: String(err) });
      }
    }

    setSweepResults(results);
    setStep('results');
  };

  const handleSkip = async () => {
    await chromeStorageService.update({ sweepCompleted: true });
    navigate('/bsv-wallet');
  };

  const handleDone = async () => {
    await chromeStorageService.update({ sweepCompleted: true });
    navigate('/bsv-wallet');
  };

  // ===================== RENDER =====================

  // Step: Intro
  if (step === 'intro') {
    return (
      <Content>
        <TopNav />
        <PageWrapper>
          <YoursIcon width="3rem" />
          <Spacer $h="0.5rem" />
          <HeaderText theme={theme}>Migrate to BRC-100</HeaderText>
          <Subtitle theme={theme}>
            Your wallet has been upgraded. Sweep assets from your legacy addresses into your new BRC-100 wallet.
          </Subtitle>

          <Card theme={theme}>
            <CardHeader theme={theme}>
              <CardIcon theme={theme}>
                <FaLock />
              </CardIcon>
              Keys are safe
            </CardHeader>
            <Subtitle theme={theme} style={{ textAlign: 'left', margin: 0 }}>
              Your old keys will always be preserved, even after sweeping.
            </Subtitle>
          </Card>

          <Card theme={theme}>
            <CardHeader theme={theme}>
              <CardIcon theme={theme}>
                <FaExclamationTriangle />
              </CardIcon>
              Some assets need manual handling
            </CardHeader>
            <Subtitle theme={theme} style={{ textAlign: 'left', margin: 0 }}>
              BSV-20, RUN tokens, and time-locked outputs can't be swept automatically. You'll be guided through your
              options.
            </Subtitle>
          </Card>

          <Spacer $h="0.25rem" />
          <Button theme={theme} type="primary" label="Start Migration" onClick={() => setStep('password')} />
          <Button theme={theme} type="secondary-outline" label="I'll Do This Later" onClick={handleSkip} />
        </PageWrapper>
      </Content>
    );
  }

  // Step: Password
  if (step === 'password') {
    return (
      <Content>
        <TopNav />
        <PageWrapper>
          <CardIcon
            theme={theme}
            style={{ width: '3rem', height: '3rem', fontSize: '1.3rem', marginBottom: '0.75rem' }}
          >
            <FaLock />
          </CardIcon>
          <HeaderText theme={theme}>Verify Password</HeaderText>
          <Subtitle theme={theme}>Enter your wallet password to decrypt your legacy keys.</Subtitle>
          <form onSubmit={handlePasswordSubmit} style={{ width: '100%' }}>
            <Input
              theme={theme}
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Show when={!!passwordError}>
              <Warning theme={theme} style={{ margin: '0.5rem 0' }}>
                {passwordError}
              </Warning>
            </Show>
            <Spacer $h="0.5rem" />
            <Button
              theme={theme}
              type="primary"
              label={isProcessing ? 'Decrypting...' : 'Continue'}
              disabled={isProcessing || !password}
              isSubmit
            />
          </form>
          <Button theme={theme} type="secondary-outline" label="Back" onClick={() => setStep('intro')} />
        </PageWrapper>
      </Content>
    );
  }

  // Step: Scanning
  if (step === 'scanning') {
    const doneCount = scanStatuses.filter((s) => s.status === 'done').length;
    return (
      <Content>
        <TopNav />
        <PageWrapper>
          <HeaderText theme={theme}>Scanning Addresses</HeaderText>
          <Subtitle theme={theme}>
            Looking for assets on {scanStatuses.length} legacy address{scanStatuses.length !== 1 ? 'es' : ''}...
          </Subtitle>
          {scanStatuses.map((s) => (
            <ProgressRow key={s.address} theme={theme} $done={s.status === 'done'} $error={s.status === 'error'}>
              <StatusIcon
                $color={
                  s.status === 'done'
                    ? theme.color.global.primaryTheme
                    : s.status === 'error'
                      ? '#e53e3e'
                      : theme.color.global.contrast + '60'
                }
              >
                {s.status === 'done' && <FaCheck />}
                {s.status === 'error' && <FaTimes />}
                {s.status === 'scanning' && <span className="spinner">...</span>}
              </StatusIcon>
              <span>
                <strong>{s.label}</strong>
                <span style={{ opacity: 0.6, marginLeft: '0.4rem', fontSize: '0.7rem' }}>
                  {s.address.slice(0, 6)}...{s.address.slice(-4)}
                </span>
              </span>
            </ProgressRow>
          ))}
          <Show when={scanStatuses.length === 0}>
            <PageLoader message="Preparing scan..." theme={theme} />
          </Show>
          <Show when={scanStatuses.length > 0 && doneCount < scanStatuses.length}>
            <Spacer $h="1rem" />
            <PageLoader message={`${doneCount}/${scanStatuses.length} complete`} theme={theme} />
          </Show>
        </PageWrapper>
      </Content>
    );
  }

  // Step: Review
  if (step === 'review') {
    const hasAnyAssets = allFunding.length > 0 || allOrdinals.length > 0 || allBsv21.length > 0;

    return (
      <Content>
        <TopNav />
        <PageWrapper>
          <Show when={!hasAnyAssets}>
            <CardIcon
              theme={theme}
              style={{ width: '3rem', height: '3rem', fontSize: '1.3rem', marginBottom: '0.75rem' }}
            >
              <FaCheck />
            </CardIcon>
            <HeaderText theme={theme}>All Clear</HeaderText>
            <Subtitle theme={theme}>
              No assets found on your legacy addresses. Your keys are preserved — you can scan again from Tools.
            </Subtitle>
            <Button theme={theme} type="primary" label="Done" onClick={handleDone} />
          </Show>

          <Show when={hasAnyAssets}>
            <HeaderText theme={theme} style={{ fontSize: '1.1rem' }}>
              Select Assets to Sweep
            </HeaderText>
            <Subtitle theme={theme}>Choose which assets to move to your BRC-100 wallet.</Subtitle>

            <ScrollableContainer>
              {/* BSV Funding */}
              <Show when={allFunding.length > 0}>
                <Card theme={theme}>
                  <CardHeader theme={theme}>
                    <CardIcon theme={theme}>
                      <FaCoins />
                    </CardIcon>
                    BSV Funding
                    <Badge theme={theme}>{(totalFundingSats / 1e8).toFixed(8)} BSV</Badge>
                  </CardHeader>
                  <AssetRow theme={theme}>
                    <Checkbox type="checkbox" checked={selection.sweepBsv} onChange={toggleBsv} />
                    Sweep {totalFundingSats.toLocaleString()} sats ({allFunding.length} UTXOs)
                  </AssetRow>
                </Card>
              </Show>

              {/* Ordinals */}
              <Show when={allOrdinals.length > 0}>
                <Card theme={theme}>
                  <CardHeader theme={theme}>
                    <CardIcon theme={theme}>
                      <FaImage />
                    </CardIcon>
                    Ordinals
                    <Badge theme={theme}>{allOrdinals.length}</Badge>
                  </CardHeader>
                  <SelectActions>
                    <SelectLink theme={theme} onClick={selectAllOrdinals}>
                      Select all
                    </SelectLink>
                    <SelectLink theme={theme} onClick={deselectAllOrdinals}>
                      Clear
                    </SelectLink>
                  </SelectActions>
                  {allOrdinals.map((o) => (
                    <AssetRow key={o.outpoint} theme={theme}>
                      <Checkbox
                        type="checkbox"
                        checked={selection.selectedOrdinals.has(o.outpoint)}
                        onChange={() => toggleOrdinal(o.outpoint)}
                      />
                      <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {o.outpoint.slice(0, 8)}...{o.outpoint.slice(-6)}
                      </span>
                    </AssetRow>
                  ))}
                </Card>
              </Show>

              {/* BSV-21 Tokens */}
              <Show when={allBsv21.length > 0}>
                <Card theme={theme}>
                  <CardHeader theme={theme}>
                    <CardIcon theme={theme}>
                      <FaCoins />
                    </CardIcon>
                    BSV-21 Tokens
                  </CardHeader>
                  {allBsv21.map((t) => (
                    <AssetRow key={t.tokenId} theme={theme}>
                      <Checkbox
                        type="checkbox"
                        checked={selection.selectedBsv21TokenIds.has(t.tokenId)}
                        onChange={() => toggleBsv21(t.tokenId)}
                      />
                      <span style={{ flex: 1 }}>{t.symbol || t.tokenId.slice(0, 8)}</span>
                      <Badge theme={theme}>
                        {t.totalAmount} ({t.inputs.length})
                      </Badge>
                    </AssetRow>
                  ))}
                </Card>
              </Show>

              <Notice theme={theme}>
                <strong>Non-sweepable assets</strong> (BSV-20, RUN, locked outputs) are not shown here. Your legacy keys
                are always preserved — export them from Settings to access those assets with a compatible wallet.
              </Notice>
            </ScrollableContainer>

            <Spacer $h="0.5rem" />
            <Button
              theme={theme}
              type="primary"
              label={hasSelection ? 'Sweep Selected' : 'Select assets above'}
              onClick={executeSweeps}
              disabled={!hasSelection}
            />
            <Button theme={theme} type="secondary-outline" label="Skip for Now" onClick={handleSkip} />
          </Show>
        </PageWrapper>
      </Content>
    );
  }

  // Step: Sweeping
  if (step === 'sweeping') {
    return (
      <Content>
        <TopNav />
        <PageWrapper>
          <HeaderText theme={theme}>Sweeping Assets</HeaderText>
          <Warning theme={theme} style={{ margin: '0.5rem 0 1rem', fontSize: '0.75rem' }}>
            Do not close the wallet during this process
          </Warning>
          <PageLoader message={currentSweepOp || 'Processing...'} theme={theme} />
          <Spacer $h="0.5rem" />
          {sweepResults.map((r, i) => (
            <ProgressRow key={i} theme={theme} $done={!!r.txid} $error={!!r.error && !r.txid}>
              <StatusIcon $color={r.txid ? theme.color.global.primaryTheme : '#e53e3e'}>
                {r.txid ? <FaCheck /> : <FaTimes />}
              </StatusIcon>
              {r.label}
            </ProgressRow>
          ))}
        </PageWrapper>
      </Content>
    );
  }

  // Step: Results
  if (step === 'results') {
    const successes = sweepResults.filter((r) => r.txid);
    const failures = sweepResults.filter((r) => r.error && !r.txid);

    return (
      <Content>
        <TopNav />
        <PageWrapper>
          <CardIcon
            theme={theme}
            style={{
              width: '3rem',
              height: '3rem',
              fontSize: '1.3rem',
              marginBottom: '0.75rem',
              background: failures.length > 0 ? '#e53e3e15' : undefined,
              color: failures.length > 0 ? '#e53e3e' : undefined,
            }}
          >
            {failures.length > 0 ? <FaExclamationTriangle /> : <FaCheck />}
          </CardIcon>
          <HeaderText theme={theme}>{failures.length > 0 ? 'Partially Complete' : 'Migration Complete'}</HeaderText>
          <Subtitle theme={theme}>
            {successes.length} swept{failures.length > 0 ? `, ${failures.length} failed` : ''}
          </Subtitle>

          <ScrollableContainer>
            {sweepResults.map((r, i) => (
              <ResultCard key={i} theme={theme} $success={!!r.txid}>
                <StatusIcon $color={r.txid ? theme.color.global.primaryTheme : '#e53e3e'}>
                  {r.txid ? <FaCheck /> : <FaTimes />}
                </StatusIcon>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>{r.label}</div>
                  {r.txid && (
                    <TxLink theme={theme} href={`${EXPLORER_BASE}${r.txid}`} target="_blank" rel="noreferrer">
                      {r.txid.slice(0, 16)}...
                      <FaArrowRight style={{ fontSize: '0.55rem', marginLeft: '0.25rem' }} />
                    </TxLink>
                  )}
                  {r.error && !r.txid && <span style={{ fontSize: '0.7rem', color: '#e53e3e' }}>{r.error}</span>}
                </div>
              </ResultCard>
            ))}

            <Notice theme={theme}>
              Your legacy keys are preserved. Return anytime via <strong>Tools → Migrate Legacy Assets</strong>.
            </Notice>
          </ScrollableContainer>

          <Spacer $h="0.5rem" />
          <Button theme={theme} type="primary" label="Done" onClick={handleDone} />
        </PageWrapper>
      </Content>
    );
  }

  return null;
};
