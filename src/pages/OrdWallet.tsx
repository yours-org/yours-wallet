import validate from 'bitcoin-address-validation';
import { useCallback, useEffect, useState } from 'react';
import { Beef, type BEEF, type WalletOutput } from '@bsv/sdk';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, ImageOff, Send, Tag, X } from 'lucide-react';
import { Ordinal } from '../components/Ordinal';
import { PageLoader } from '../components/PageLoader';
import { Show } from '../components/Show';
import { useSnackbar } from '../hooks/useSnackbar';
import { useTheme } from '../hooks/useTheme';
import { useServiceContext } from '../hooks/useServiceContext';
import { cancelListing, deriveDepositAddresses, getOrdinals, listOrdinal, transferOrdinals } from '@1sat/actions';
import { BSV_DECIMAL_CONVERSION } from '../utils/constants';
import { sleep } from '../utils/sleep';
import { TopNav } from '../components/TopNav';
import { getErrorMessage } from '../utils/tools';
import { useIntersectionObserver } from '../hooks/useIntersectObserver';
import { getTagValue, getOutputName, hasTag, resolveOriginOutpoint } from '../utils/format';

type Addresses = Record<string, string>;
type PageState = 'main' | 'transfer' | 'list' | 'cancel';
type FilterTab = 'all' | 'listings' | 'ordinals';

// ─── animation variants ───────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 12 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', damping: 20, stiffness: 260 },
  },
};

const slideUp = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', damping: 26, stiffness: 300 } },
  exit: { opacity: 0, y: 32, transition: { duration: 0.18 } },
};

const pageFade = {
  hidden: { opacity: 0, x: 16 },
  show: { opacity: 1, x: 0, transition: { type: 'spring', damping: 28, stiffness: 280 } },
  exit: { opacity: 0, x: -16, transition: { duration: 0.15 } },
};

// ─── SkeletonCard ─────────────────────────────────────────────────────────────

const SkeletonCard = () => (
  <div className="rounded-xl overflow-hidden animate-pulse" style={{ background: '#17191E', aspectRatio: '1/1' }} />
);

// ─── OrdCard — grid card wrapper with selection overlay ───────────────────────

type OrdCardProps = {
  output: WalletOutput;
  url: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  theme: ReturnType<typeof useTheme>['theme'];
  index: number;
};

const OrdCard = ({ output, url, selected, disabled, onClick, theme, index }: OrdCardProps) => {
  return (
    <motion.div
      variants={cardVariants}
      custom={index}
      animate={{ opacity: disabled ? 0.3 : 1 }}
      transition={{ duration: 0.2 }}
      className="relative rounded-xl overflow-hidden"
      style={{
        background: '#17191E',
        border: selected ? '1.5px solid #A1FF8B' : '1px solid rgba(255,255,255,0.06)',
        aspectRatio: '1/1',
        cursor: disabled ? 'not-allowed' : 'pointer',
        pointerEvents: disabled ? 'none' : 'auto',
      }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      onClick={disabled ? undefined : onClick}
    >
      {/* Ordinal content fills the card */}
      <div className="w-full h-full flex items-center justify-center">
        <Ordinal theme={theme} output={output} url={url} isTransfer size="100%" />
      </div>

      {/* Selection checkmark */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 18, stiffness: 350 }}
            className="absolute top-1.5 right-1.5 flex items-center justify-center rounded-full w-5 h-5"
            style={{ background: '#A1FF8B' }}
          >
            <Check size={12} color="#010101" strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Listed badge */}
      {output.tags?.includes('ordlock') && (
        <div
          className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[0.55rem] font-bold"
          style={{ background: '#E5A920', color: '#010101' }}
        >
          Listed
        </div>
      )}

      {/* Name label */}
      <div
        className="absolute bottom-0 left-0 right-0 px-1.5 py-1"
        style={{
          background: 'linear-gradient(to top, rgba(1,1,1,0.85) 0%, transparent 100%)',
        }}
      >
        <p className="text-white text-[0.6rem] font-medium truncate">{getOutputName(output)}</p>
      </div>
    </motion.div>
  );
};

// ─── FilterPill ───────────────────────────────────────────────────────────────

const FilterPill = ({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}) => (
  <motion.button
    onClick={onClick}
    whileTap={{ scale: 0.95 }}
    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors"
    style={{
      background: active ? 'linear-gradient(135deg, #A1FF8B, #34D399)' : '#17191E',
      color: active ? '#010101' : '#98A2B3',
      border: active ? 'none' : '1px solid rgba(255,255,255,0.06)',
    }}
  >
    {label}
    {count !== undefined && count > 0 && (
      <span className="text-[0.6rem] px-1 rounded-full" style={{ background: active ? 'rgba(0,0,0,0.2)' : '#2a2d33' }}>
        {count}
      </span>
    )}
  </motion.button>
);

// ─── FlowHeader ───────────────────────────────────────────────────────────────

const FlowHeader = ({ title, onBack }: { title: string; onBack: () => void }) => (
  <div className="flex items-center gap-3 px-4 pt-4 pb-3">
    <motion.button
      onClick={onBack}
      whileTap={{ scale: 0.9 }}
      className="flex items-center justify-center w-8 h-8 rounded-full"
      style={{ background: '#17191E', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <ArrowLeft size={16} color="#98A2B3" />
    </motion.button>
    <h2 className="text-base font-semibold text-white">{title}</h2>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const OrdWallet = () => {
  const { theme } = useTheme();
  const [pageState, setPageState] = useState<PageState>('main');
  const { apiContext } = useServiceContext();

  /** Build an ORDFS content URL via the 1sat client. Pass the outpoint through
   *  in its native `txid.vout` form. */
  const getContentUrl = (outpoint: string) => apiContext.services!.ordfs.getContentUrl(outpoint);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedOrdinals, setSelectedOrdinals] = useState<WalletOutput[]>([]);
  const [bsvListAmount, setBsvListAmount] = useState<number | null>();
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const [ordinals, setOrdinals] = useState<WalletOutput[]>([]);
  const [ordinalsBEEFs, setOrdinalsBEEFs] = useState<BEEF[]>([]);
  const [from, setFrom] = useState<string>();
  const listedOrdinals = ordinals.filter((o) => o.tags?.includes('ordlock'));
  const myOrdinals = ordinals.filter((o) => !o.tags?.includes('ordlock'));
  const [useSameAddress, setUseSameAddress] = useState(false);
  const [addresses, setAddresses] = useState<Addresses>({});
  const [addressErrors, setAddressErrors] = useState<Addresses>({});
  const [commonAddress, setCommonAddress] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  // ── selection logic (unchanged) ─────────────────────────────────────────────

  // Selection mode: once you start selecting, you're locked to one type.
  // 'transfer' = selecting unlisted items, 'cancel' = selecting listed items, null = nothing selected.
  const isListedOrdinal = (o: WalletOutput) => o.tags?.includes('ordlock') ?? false;

  // Selection mode: once you start selecting, you're locked to one type.
  // 'transfer' = selecting unlisted items, 'cancel' = selecting listed items, null = nothing selected.
  const selectionMode: 'transfer' | 'cancel' | null =
    selectedOrdinals.length === 0 ? null : selectedOrdinals.every(isListedOrdinal) ? 'cancel' : 'transfer';

  const toggleOrdinalSelection = (ord: WalletOutput) => {
    const outpoint = ord.outpoint;
    const isSelected = selectedOrdinals.some((selected) => selected.outpoint === outpoint);
    const isListing = isListedOrdinal(ord);

    if (isSelected) {
      setSelectedOrdinals(selectedOrdinals.filter((selected) => selected.outpoint !== outpoint));
    } else if (selectedOrdinals.length === 0) {
      // First selection — sets the mode
      setSelectedOrdinals([ord]);
    } else if (isListing && selectionMode === 'transfer') {
      // Can't mix: trying to select a listing while in transfer mode
      return;
    } else if (!isListing && selectionMode === 'cancel') {
      // Can't mix: trying to select an unlisted item while in cancel mode
      return;
    } else {
      setSelectedOrdinals([...selectedOrdinals, ord]);
    }
  };

  const isOrdinalDisabled = (ord: WalletOutput): boolean => {
    if (selectionMode === null) return false;
    const isListing = isListedOrdinal(ord);
    if (selectionMode === 'transfer' && isListing) return true;
    if (selectionMode === 'cancel' && !isListing) return true;
    return false;
  };

  // ── intersection observer for infinite scroll ───────────────────────────────

  const { isIntersecting, elementRef } = useIntersectionObserver({
    root: null,
    threshold: 1.0,
  });

  // ── data loading (unchanged) ────────────────────────────────────────────────

  const loadOrdinals = useCallback(async () => {
    if (!apiContext) return;
    if (ordinals.length === 0) setIsProcessing(true);
    const offset = from ? parseInt(from, 10) : 0;
    const { outputs, BEEF } = await getOrdinals.execute(apiContext, { limit: 50, offset });

    if (BEEF) {
      setOrdinalsBEEFs((prev) => [...prev, BEEF]);
    }

    const filtered = outputs.filter((o) => {
      const contentType = getTagValue(o.tags, 'type');
      return contentType !== 'panda/tag' && contentType !== 'yours/tag';
    });

    setFrom((offset + outputs.length).toString());
    setOrdinals((prev) => [...prev, ...filtered]);
    setIsProcessing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiContext, from]);

  useEffect(() => {
    if (isIntersecting && from) {
      loadOrdinals();
    }
  }, [isIntersecting, from, loadOrdinals]);

  useEffect(() => {
    if (!successTxId) return;
    resetSendState();
    setPageState('main');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId, message]);

  useEffect(() => {
    loadOrdinals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── state helpers (unchanged) ───────────────────────────────────────────────

  const resetSendState = () => {
    setSuccessTxId('');
    setBsvListAmount(undefined);
    setIsProcessing(false);
    setSelectedOrdinals([]);
    setUseSameAddress(false);
    setCommonAddress('');
  };

  const refreshOrdinals = async () => {
    const { outputs, BEEF } = await getOrdinals.execute(apiContext, { limit: 50, offset: 0 });
    setOrdinalsBEEFs(BEEF ? [BEEF] : []);

    const filtered = outputs.filter((o) => {
      const contentType = getTagValue(o.tags, 'type');
      return contentType !== 'panda/tag' && contentType !== 'yours/tag';
    });

    setOrdinals(filtered);
    setFrom(outputs.length.toString());
  };

  const getMergedBeefForOrdinals = (selected: WalletOutput[]): number[] | undefined => {
    if (ordinalsBEEFs.length === 0) return undefined;

    const neededTxids = new Set(selected.map((o) => o.outpoint.split('.')[0]));
    const merged = new Beef();

    for (const beefBytes of ordinalsBEEFs) {
      const beef = Beef.fromBinary(beefBytes);
      for (const txid of neededTxids) {
        if (beef.findTxid(txid)?.tx) {
          merged.mergeBeef(beef);
          break;
        }
      }
    }

    return merged.toBinary();
  };

  // ── handlers (unchanged) ────────────────────────────────────────────────────

  const handleMultiTransferOrdinal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);

    try {
      const inputBEEF = getMergedBeefForOrdinals(selectedOrdinals);
      if (!inputBEEF) {
        console.error('[OrdWallet] No BEEF available');
        addSnackbar('No transaction data available', 'error');
        setIsProcessing(false);
        return;
      }

      const transfers = selectedOrdinals.map((ordinal) => ({
        ordinal,
        address: addresses[ordinal.outpoint],
      }));

      const transferRes = await transferOrdinals.execute(apiContext, {
        transfers,
        inputBEEF,
      });

      if (!transferRes.txid || transferRes.error) {
        console.error('[OrdWallet] Transfer failed:', transferRes.error);
        addSnackbar(getErrorMessage(transferRes.error), 'error');
        setIsProcessing(false);
        return;
      }

      console.log('[OrdWallet] Transfer success:', transferRes.txid);
      setSuccessTxId(transferRes.txid);
      addSnackbar('Transfer Successful!', 'success');
      refreshOrdinals();
    } catch (error) {
      console.error('[OrdWallet] Transfer exception:', error);
      addSnackbar(error instanceof Error ? error.message : 'Transfer failed', 'error');
      setIsProcessing(false);
    }
  };

  const handleListOrdinal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);

    if (Number(bsvListAmount) < 0.00000001) {
      addSnackbar('Must be more than 1 sat', 'error');
      setIsProcessing(false);
      return;
    }

    if (!bsvListAmount) {
      addSnackbar('You must enter a valid BSV amount!', 'error');
      setIsProcessing(false);
      return;
    }

    const inputBEEF = getMergedBeefForOrdinals(selectedOrdinals);
    if (!inputBEEF) {
      addSnackbar('No transaction data available', 'error');
      setIsProcessing(false);
      return;
    }

    const { derivations } = await deriveDepositAddresses.execute(apiContext, {
      startIndex: 0,
      count: 1,
    });
    const payAddress = derivations[0]?.address;
    if (!payAddress) {
      addSnackbar('Could not derive payment address', 'error');
      setIsProcessing(false);
      return;
    }

    const listRes = await listOrdinal.execute(apiContext, {
      ordinal: selectedOrdinals[0],
      inputBEEF,
      price: Math.ceil(bsvListAmount * BSV_DECIMAL_CONVERSION),
      payAddress,
    });

    if (!listRes.txid || listRes.error) {
      addSnackbar(getErrorMessage(listRes.error), 'error');
      setIsProcessing(false);
      return;
    }

    setSuccessTxId(listRes.txid);
    addSnackbar('Listing Successful!', 'success');
    refreshOrdinals();
  };

  const handleCancelListing = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);

    const inputBEEF = getMergedBeefForOrdinals(selectedOrdinals);
    if (!inputBEEF) {
      addSnackbar('No transaction data available', 'error');
      setIsProcessing(false);
      return;
    }

    const cancelRes = await cancelListing.execute(apiContext, {
      listing: selectedOrdinals[0],
      inputBEEF,
    });

    if (!cancelRes.txid || cancelRes.error) {
      addSnackbar(getErrorMessage(cancelRes.error), 'error');
      setIsProcessing(false);
      return;
    }

    setSuccessTxId(cancelRes.txid);
    addSnackbar('Successfully canceled the listing!', 'success');
    refreshOrdinals();
  };

  const handleAddressChange = useCallback((outpoint: string, address: string) => {
    setAddresses((prev) => ({ ...prev, [outpoint]: address }));
    setAddressErrors((prev) => ({
      ...prev,
      [outpoint]: validate(address) ? '' : 'Invalid 1sat address format',
    }));
  }, []);

  const handleCommonAddressChange = useCallback(
    (address: string) => {
      setCommonAddress(address);
      if (useSameAddress) {
        const newAddresses = selectedOrdinals.reduce<Addresses>((acc, ordinal) => {
          acc[ordinal.outpoint] = address;
          return acc;
        }, {});
        setAddresses(newAddresses);
      }

      if (address) {
        const isValid = validate(address);
        setAddressErrors(
          selectedOrdinals.reduce<Addresses>((acc, ordinal) => {
            acc[ordinal.outpoint] = isValid ? '' : 'Invalid 1sat address format';
            return acc;
          }, {}),
        );
      }
    },
    [useSameAddress, selectedOrdinals],
  );

  const toggleUseSameAddress = useCallback(() => {
    setUseSameAddress((prev) => !prev);
    if (!useSameAddress) {
      handleCommonAddressChange(commonAddress);
    }
  }, [commonAddress, useSameAddress, handleCommonAddressChange]);

  // ── derived display list based on active filter ─────────────────────────────

  const displayList = (() => {
    const base = ordinals.filter((output) => {
      const contentType = getTagValue(output.tags, 'type');
      return contentType !== 'application/bsv-20';
    });
    if (activeFilter === 'listings') return base.filter((o) => o.tags?.includes('ordlock'));
    if (activeFilter === 'ordinals') return base.filter((o) => !o.tags?.includes('ordlock'));
    return base;
  })();

  const totalNftCount = ordinals.filter((output) => {
    const contentType = getTagValue(output.tags, 'type');
    return contentType !== 'application/bsv-20';
  }).length;

  // ── selected ordinal is a listing? ─────────────────────────────────────────

  const selectedIsListing = selectionMode === 'cancel';

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — Main Grid View
  // ═══════════════════════════════════════════════════════════════════════════

  const mainView = (
    <motion.div
      key="main"
      variants={pageFade}
      initial="hidden"
      animate="show"
      exit="exit"
      className="flex flex-col"
      style={{ height: '100%', paddingBottom: '3.75rem' }}
    >
      {/* Filter pills */}
      <div className="flex gap-2 px-4 pt-3 pb-2">
        <FilterPill
          label="All"
          active={activeFilter === 'all'}
          onClick={() => setActiveFilter('all')}
          count={totalNftCount}
        />
        <FilterPill
          label="My Listings"
          active={activeFilter === 'listings'}
          onClick={() => setActiveFilter('listings')}
          count={listedOrdinals.length}
        />
        <FilterPill
          label="My Ordinals"
          active={activeFilter === 'ordinals'}
          onClick={() => setActiveFilter('ordinals')}
          count={
            myOrdinals.filter((o) => {
              const ct = getTagValue(o.tags, 'type');
              return ct !== 'application/bsv-20';
            }).length
          }
        />
      </div>

      {/* Grid */}
      <div
        className="flex-1 overflow-y-auto px-4"
        style={{ paddingBottom: selectedOrdinals.length > 0 ? '8rem' : '5rem' }}
      >
        {isProcessing && ordinals.length === 0 ? (
          /* Skeleton loading state */
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : displayList.length === 0 ? (
          /* Empty state */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center gap-3 pt-16"
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#17191E' }}>
              <ImageOff size={26} color="#98A2B3" />
            </div>
            <p className="text-sm" style={{ color: '#98A2B3' }}>
              {theme.settings.services.ordinals ? 'No ordinals yet' : 'Ordinals not supported'}
            </p>
          </motion.div>
        ) : (
          /* NFT grid with staggered entrance */
          <motion.div
            className="grid grid-cols-2 gap-2.5 pt-1"
            variants={containerVariants}
            initial="hidden"
            animate="show"
          >
            {displayList.map((output, index) => {
              const originOutpoint = resolveOriginOutpoint(output);
              const outpoint = output.outpoint;
              return (
                <OrdCard
                  key={originOutpoint ?? outpoint}
                  output={output}
                  url={`${getContentUrl(originOutpoint ?? outpoint)}?outpoint=${outpoint}`}
                  selected={selectedOrdinals.some((s) => s.outpoint === outpoint)}
                  disabled={isOrdinalDisabled(output)}
                  onClick={() => toggleOrdinalSelection(output)}
                  theme={theme}
                  index={index}
                />
              );
            })}
            {/* Infinite scroll sentinel */}
            <div ref={elementRef} style={{ height: '1px', gridColumn: '1/-1' }} />
          </motion.div>
        )}
      </div>

      {/* Bottom action bar — slides up when items are selected */}
      <AnimatePresence>
        {selectedOrdinals.length > 0 && (
          <motion.div
            variants={slideUp}
            initial="hidden"
            animate="show"
            exit="exit"
            className="absolute left-0 right-0 flex gap-2 px-4 py-3"
            style={{
              bottom: '3.75rem',
              background: 'rgba(1,1,1,0.92)',
              backdropFilter: 'blur(12px)',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {selectedIsListing ? (
              /* Cancel Listing action */
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  if (!selectedOrdinals.length) {
                    addSnackbar('You must select an ordinal!', 'info');
                    return;
                  }
                  setPageState('cancel');
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm"
                style={{
                  background: 'rgba(239,68,68,0.15)',
                  color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.3)',
                }}
              >
                <X size={15} />
                {selectedOrdinals.length > 1 ? `Cancel ${selectedOrdinals.length} Listings` : 'Cancel Listing'}
              </motion.button>
            ) : (
              <>
                {/* Transfer */}
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    if (!selectedOrdinals.length) {
                      addSnackbar('You must select an ordinal to transfer!', 'info');
                      return;
                    }
                    setPageState('transfer');
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm"
                  style={{
                    background: 'linear-gradient(135deg, #A1FF8B, #34D399)',
                    color: '#010101',
                  }}
                >
                  <Send size={14} />
                  Transfer
                  {selectedOrdinals.length > 1 && (
                    <span
                      className="text-[0.65rem] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: 'rgba(0,0,0,0.2)' }}
                    >
                      {selectedOrdinals.length}
                    </span>
                  )}
                </motion.button>

                {/* List — only when exactly 1 selected */}
                {selectedOrdinals.length === 1 && (
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                      if (!selectedOrdinals.length) {
                        addSnackbar('You must select an ordinal to list!', 'info');
                        return;
                      }
                      setPageState('list');
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm"
                    style={{
                      background: '#17191E',
                      color: '#FFFFFF',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <Tag size={14} />
                    List
                  </motion.button>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — Transfer Flow
  // ═══════════════════════════════════════════════════════════════════════════

  const isSingleTransfer = selectedOrdinals.length === 1;
  const singleTransferOrdinal = selectedOrdinals[0];
  const singleTransferOutpoint = singleTransferOrdinal?.outpoint;
  const singleTransferOriginOutpoint = singleTransferOrdinal ? resolveOriginOutpoint(singleTransferOrdinal) : undefined;
  const singleTransferName = singleTransferOrdinal ? getOutputName(singleTransferOrdinal) : '';
  const singleTransferError = singleTransferOutpoint ? addressErrors[singleTransferOutpoint] : undefined;

  const transferView = (
    <motion.div
      key="transfer"
      variants={pageFade}
      initial="hidden"
      animate="show"
      exit="exit"
      className="flex flex-col"
      style={{ height: '100%' }}
    >
      <FlowHeader
        title={isSingleTransfer ? 'Transfer Ordinal' : `Transfer ${selectedOrdinals.length} Ordinals`}
        onBack={() => {
          setPageState('main');
          resetSendState();
        }}
      />

      <form noValidate onSubmit={handleMultiTransferOrdinal} className="flex flex-col flex-1 overflow-hidden">
        {/* SINGLE-ORDINAL VIEW — spacious preview + labeled address input */}
        <Show when={isSingleTransfer && !!singleTransferOrdinal}>
          <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-4">
            {/* Ordinal preview */}
            <div
              className="flex items-center gap-4 p-4 rounded-2xl"
              style={{ background: '#17191E', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                <Ordinal
                  theme={theme}
                  output={singleTransferOrdinal}
                  url={`${getContentUrl(singleTransferOriginOutpoint ?? singleTransferOutpoint ?? '')}?outpoint=${singleTransferOutpoint}`}
                  isTransfer
                  size="4rem"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs" style={{ color: '#98A2B3' }}>
                  Transferring
                </p>
                <p className="text-sm font-semibold text-white truncate">{singleTransferName}</p>
              </div>
            </div>

            {/* Address input */}
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: '#98A2B3' }}>
                Send to
              </label>
              <input
                placeholder="Recipient address"
                type="text"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => singleTransferOutpoint && handleAddressChange(singleTransferOutpoint, e.target.value)}
                value={(singleTransferOutpoint && addresses[singleTransferOutpoint]) || ''}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors"
                style={{
                  background: '#17191E',
                  border: `1px solid ${singleTransferError ? '#ef4444' : 'rgba(255,255,255,0.08)'}`,
                  color: '#FFFFFF',
                }}
              />
              <Show when={!!singleTransferError}>
                <p className="text-xs mt-1.5" style={{ color: '#ef4444' }}>
                  {singleTransferError}
                </p>
              </Show>
            </div>
          </div>
        </Show>

        {/* MULTI-ORDINAL VIEW — shared-address toggle + per-ordinal cards */}
        <Show when={!isSingleTransfer}>
          <>
            {/* "Use same address" toggle */}
            <div
              className="mx-4 mb-3 flex items-center justify-between px-3 py-2.5 rounded-xl"
              style={{ background: '#17191E', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span className="text-sm" style={{ color: '#98A2B3' }}>
                Use same address for all
              </span>
              <motion.button
                type="button"
                onClick={toggleUseSameAddress}
                whileTap={{ scale: 0.9 }}
                className="relative w-10 h-5 rounded-full transition-colors"
                style={{ background: useSameAddress ? '#A1FF8B' : '#2a2d33' }}
              >
                <motion.div
                  animate={{ x: useSameAddress ? 20 : 2 }}
                  transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                  className="absolute top-0.5 w-4 h-4 rounded-full"
                  style={{ background: useSameAddress ? '#010101' : '#98A2B3' }}
                />
              </motion.button>
            </div>

            {/* Common address input */}
            <Show when={useSameAddress}>
              <div className="px-4 mb-3">
                <input
                  placeholder="Shared recipient address"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => handleCommonAddressChange(e.target.value)}
                  value={commonAddress}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-colors"
                  style={{
                    background: '#17191E',
                    border: `1px solid ${addressErrors[selectedOrdinals[0]?.outpoint] ? '#ef4444' : 'rgba(255,255,255,0.08)'}`,
                    color: '#FFFFFF',
                  }}
                />
                {addressErrors[selectedOrdinals[0]?.outpoint] && (
                  <p className="text-xs mt-1" style={{ color: '#ef4444' }}>
                    {addressErrors[selectedOrdinals[0]?.outpoint]}
                  </p>
                )}
              </div>
            </Show>

            {/* Per-ordinal cards */}
            <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-2.5 pb-4">
              {selectedOrdinals.map((output) => {
                const originOutpoint = resolveOriginOutpoint(output);
                const outpoint = output.outpoint;
                const name = getOutputName(output);

                return (
                  <div
                    key={originOutpoint ?? outpoint}
                    className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ background: '#17191E', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    {/* Thumbnail */}
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden">
                      <Ordinal
                        theme={theme}
                        output={output}
                        url={`${getContentUrl(originOutpoint ?? outpoint)}?outpoint=${outpoint}`}
                        isTransfer
                        size="3rem"
                      />
                    </div>

                    {/* Name + address input */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white mb-1.5 truncate">{name}</p>
                      <Show when={!useSameAddress}>
                        <>
                          <input
                            placeholder="Recipient address"
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(e) => handleAddressChange(outpoint, e.target.value)}
                            value={addresses[outpoint] || ''}
                            className="w-full px-2.5 py-2 rounded-lg text-xs outline-none transition-colors"
                            style={{
                              background: '#0f1012',
                              border: `1px solid ${addressErrors[outpoint] ? '#ef4444' : 'rgba(255,255,255,0.08)'}`,
                              color: '#FFFFFF',
                            }}
                          />
                          {addressErrors[outpoint] && (
                            <p className="text-[0.65rem] mt-1" style={{ color: '#ef4444' }}>
                              {addressErrors[outpoint]}
                            </p>
                          )}
                        </>
                      </Show>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        </Show>

        {/* Sticky submit — pb clears the absolute BottomMenu (3.75rem) plus breathing room */}
        <div className="px-4 pt-2 pb-20" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <motion.button
            type="submit"
            disabled={isProcessing}
            whileTap={{ scale: 0.97 }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
            style={{
              background: isProcessing ? 'rgba(161,255,139,0.4)' : 'linear-gradient(135deg, #A1FF8B, #34D399)',
              color: '#010101',
            }}
          >
            <Send size={15} />
            {isSingleTransfer ? 'Transfer Now' : `Transfer ${selectedOrdinals.length}`}
          </motion.button>
        </div>
      </form>
    </motion.div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — List for Sale Flow
  // ═══════════════════════════════════════════════════════════════════════════

  const listOriginOutpoint = getTagValue(selectedOrdinals[0]?.tags, 'origin');
  const listName = selectedOrdinals[0] ? getOutputName(selectedOrdinals[0], 'Ordinal') : 'Ordinal';

  const listView = (
    <motion.div
      key="list"
      variants={pageFade}
      initial="hidden"
      animate="show"
      exit="exit"
      className="flex flex-col"
      style={{ height: '100%' }}
    >
      <FlowHeader
        title={`List ${listName}`}
        onBack={() => {
          setPageState('main');
          setBsvListAmount(null);
          resetSendState();
        }}
      />

      <form noValidate onSubmit={handleListOrdinal} className="flex flex-col flex-1 overflow-hidden">
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-4">
          {/* Ordinal preview */}
          <div
            className="flex items-center gap-4 p-4 rounded-2xl"
            style={{ background: '#17191E', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
              <Ordinal
                theme={theme}
                output={selectedOrdinals[0]}
                url={`${getContentUrl(listOriginOutpoint || '')}?outpoint=${selectedOrdinals[0]?.outpoint}`}
                selected
                isTransfer
                size="4rem"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs" style={{ color: '#98A2B3' }}>
                Listing
              </p>
              <p className="text-sm font-semibold text-white truncate">{listName}</p>
              <p className="text-xs mt-0.5" style={{ color: '#98A2B3' }}>
                Global orderbook
              </p>
            </div>
          </div>

          {/* Price input */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#98A2B3' }}>
              Price
            </label>
            <div className="relative">
              <input
                placeholder="0.00000000"
                type="number"
                step="0.00000001"
                onChange={(e) => {
                  const inputValue = e.target.value;
                  if (inputValue === '') {
                    setBsvListAmount(null);
                  } else {
                    setBsvListAmount(Number(inputValue));
                  }
                }}
                value={bsvListAmount !== null && bsvListAmount !== undefined ? bsvListAmount : ''}
                className="w-full px-4 py-3 rounded-xl text-base font-mono outline-none pr-14"
                style={{
                  background: '#17191E',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#FFFFFF',
                }}
              />
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold"
                style={{ color: '#98A2B3' }}
              >
                BSV
              </span>
            </div>
          </div>
        </div>

        {/* Sticky submit — pb clears the absolute BottomMenu (3.75rem) plus breathing room */}
        <div className="px-4 pt-2 pb-20" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <motion.button
            type="submit"
            disabled={isProcessing}
            whileTap={{ scale: 0.97 }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
            style={{
              background: isProcessing ? 'rgba(161,255,139,0.4)' : 'linear-gradient(135deg, #A1FF8B, #34D399)',
              color: '#010101',
            }}
          >
            <Tag size={15} />
            List Now
          </motion.button>
        </div>
      </form>
    </motion.div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — Cancel Listing Flow
  // ═══════════════════════════════════════════════════════════════════════════

  const cancelOriginOutpoint = getTagValue(selectedOrdinals[0]?.tags, 'origin');

  const cancelView = (
    <motion.div
      key="cancel"
      variants={pageFade}
      initial="hidden"
      animate="show"
      exit="exit"
      className="flex flex-col"
      style={{ height: '100%' }}
    >
      <FlowHeader
        title="Cancel Listing"
        onBack={() => {
          setPageState('main');
          resetSendState();
        }}
      />

      <form noValidate onSubmit={handleCancelListing} className="flex flex-col flex-1 overflow-hidden">
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4">
          {/* Ordinal preview */}
          <div
            className="flex items-center gap-4 p-4 rounded-2xl"
            style={{ background: '#17191E', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
              <Ordinal
                theme={theme}
                output={selectedOrdinals[0]}
                url={`${getContentUrl(cancelOriginOutpoint || '')}?outpoint=${selectedOrdinals[0]?.outpoint}`}
                selected
                isTransfer
                size="4rem"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs mb-0.5" style={{ color: '#98A2B3' }}>
                Listed ordinal
              </p>
              <p className="text-sm font-semibold text-white truncate">
                {selectedOrdinals[0] ? getOutputName(selectedOrdinals[0], 'Ordinal') : 'Ordinal'}
              </p>
              <p className="text-xs mt-1" style={{ color: '#ef4444' }}>
                This will cancel your listing
              </p>
            </div>
          </div>
        </div>

        {/* Sticky footer — pb clears the absolute BottomMenu (3.75rem) plus breathing room */}
        <div
          className="px-4 pt-2 pb-20 flex flex-col gap-2.5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <motion.button
            type="submit"
            disabled={isProcessing}
            whileTap={{ scale: 0.97 }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
            style={{
              background: isProcessing ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.15)',
              color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.3)',
            }}
          >
            <X size={15} />
            Cancel Listing
          </motion.button>

          <motion.button
            type="button"
            disabled={isProcessing}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              setPageState('main');
              resetSendState();
            }}
            className="w-full py-3 rounded-xl font-medium text-sm"
            style={{
              background: '#17191E',
              color: '#98A2B3',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            Keep Listing
          </motion.button>
        </div>
      </form>
    </motion.div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOT RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div
      className="flex flex-col relative"
      style={{ width: '100%', height: '100vh', background: '#010101', overflow: 'hidden' }}
    >
      <TopNav />

      {/* Processing overlays */}
      <Show when={isProcessing && pageState === 'main'}>
        <PageLoader theme={theme} message="Loading ordinals..." />
      </Show>
      <Show when={isProcessing && pageState === 'transfer'}>
        <PageLoader theme={theme} message="Transferring ordinal..." />
      </Show>
      <Show when={isProcessing && pageState === 'list'}>
        <PageLoader theme={theme} message="Listing ordinal..." />
      </Show>
      <Show when={isProcessing && pageState === 'cancel'}>
        <PageLoader theme={theme} message="Cancelling listing..." />
      </Show>

      {/* Page content — animated transitions */}
      <Show when={!isProcessing}>
        <div className="flex-1 relative" style={{ marginTop: '3.5rem', overflow: 'hidden' }}>
          <AnimatePresence mode="wait">
            {pageState === 'main' && theme.settings.services.ordinals && mainView}
            {pageState === 'main' && !theme.settings.services.ordinals && (
              <motion.div
                key="unsupported"
                variants={pageFade}
                initial="hidden"
                animate="show"
                exit="exit"
                className="flex flex-col items-center justify-center gap-3 pt-24"
              >
                <ImageOff size={28} color="#98A2B3" />
                <p className="text-sm" style={{ color: '#98A2B3' }}>
                  Ordinals not supported in this wallet configuration
                </p>
              </motion.div>
            )}
            {pageState === 'transfer' && transferView}
            {pageState === 'list' && listView}
            {pageState === 'cancel' && cancelView}
          </AnimatePresence>
        </div>
      </Show>
    </div>
  );
};
