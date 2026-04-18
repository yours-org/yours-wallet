import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Loader2, X, ImageIcon } from 'lucide-react';
import { getOrdinals } from '@1sat/actions';
import type { OneSatContext } from '@1sat/actions';
import type { WalletOutput } from '@bsv/sdk';
import { getTagValue, resolveOriginOutpoint, getOutputName } from '../utils/format';
import { Theme } from '../theme.types';

const PAGE_SIZE = 50;

type Props = {
  theme: Theme;
  apiContext: OneSatContext;
  onSelectExisting: (url: string) => void;
  onUploadNew: (file: File) => void;
  onClose: () => void;
};

export const AvatarPicker = ({ theme, apiContext, onSelectExisting, onUploadNew, onClose }: Props) => {
  const [imageOrdinals, setImageOrdinals] = useState<WalletOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const offsetRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const getContentUrl = useCallback(
    (outpoint: string) => apiContext.services!.ordfs.getContentUrl(outpoint),
    [apiContext],
  );

  const filterImages = (outputs: WalletOutput[]) =>
    outputs.filter((o) => {
      const contentType = getTagValue(o.tags, 'type');
      return contentType?.startsWith('image/');
    });

  const loadPage = useCallback(
    async (isInitial: boolean) => {
      if (isInitial) {
        setLoading(true);
        offsetRef.current = 0;
      } else {
        setLoadingMore(true);
      }

      try {
        const { outputs } = await getOrdinals.execute(apiContext, {
          limit: PAGE_SIZE,
          offset: offsetRef.current,
        });
        const images = filterImages(outputs);
        setImageOrdinals((prev) => (isInitial ? images : [...prev, ...images]));
        offsetRef.current += outputs.length;
        setHasMore(outputs.length === PAGE_SIZE);
      } catch (err) {
        console.error('Failed to load ordinals:', err);
        setHasMore(false);
      }

      if (isInitial) setLoading(false);
      else setLoadingMore(false);
    },
    [apiContext],
  );

  useEffect(() => {
    loadPage(true);
  }, [loadPage]);

  // Infinite scroll — load more when near bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
      loadPage(false);
    }
  }, [loadPage, loadingMore, hasMore]);

  const filtered = searchTerm
    ? imageOrdinals.filter((o) => {
        const name = getOutputName(o) ?? '';
        const origin = resolveOriginOutpoint(o) ?? o.outpoint;
        const q = searchTerm.toLowerCase();
        return name.toLowerCase().includes(q) || origin.toLowerCase().includes(q);
      })
    : imageOrdinals;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadNew(file);
    e.target.value = '';
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          className="w-full max-w-[400px] rounded-t-2xl flex flex-col"
          style={{
            background: '#0D0D0D',
            border: '1px solid rgba(255,255,255,0.08)',
            borderBottom: 'none',
            maxHeight: '85vh',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <span className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>
              Choose Avatar
            </span>
            <button onClick={onClose} className="p-1">
              <X size={16} style={{ color: '#98A2B3' }} />
            </button>
          </div>

          {/* Upload button */}
          <div className="px-4 pt-3 pb-2">
            <input
              id="avatar-file-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />
            <label
              htmlFor="avatar-file-upload"
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg cursor-pointer"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px dashed rgba(161,255,139,0.3)',
              }}
            >
              <Upload size={16} style={{ color: theme.color.component.primaryButtonLeftGradient }} />
              <span className="text-xs font-medium" style={{ color: '#D0D5DD' }}>
                Upload new image
              </span>
              <span className="text-[10px] ml-auto" style={{ color: '#667085' }}>
                Inscribed on-chain
              </span>
            </label>
          </div>

          {/* Search */}
          <div className="px-4 pb-2">
            <input
              type="text"
              placeholder="Search by name or outpoint..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs rounded-lg px-3 py-2 outline-none"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#D0D5DD',
              }}
            />
          </div>

          {/* Divider + label */}
          <div className="px-4 pb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#667085' }}>
              Your image ordinals
            </span>
          </div>

          {/* Grid */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-16" onScroll={handleScroll}>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin" style={{ color: '#98A2B3' }} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <ImageIcon size={24} style={{ color: '#475467' }} />
                <p className="text-xs" style={{ color: '#667085' }}>
                  {searchTerm ? 'No matching ordinals' : 'No image ordinals found'}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {filtered.map((output) => {
                    const origin = resolveOriginOutpoint(output);
                    const url = getContentUrl(origin ?? output.outpoint);
                    const name = getOutputName(output);
                    return (
                      <motion.button
                        key={output.outpoint}
                        whileTap={{ scale: 0.95 }}
                        className="aspect-square rounded-lg overflow-hidden relative group"
                        style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                        onClick={() => onSelectExisting(url)}
                        title={name}
                      >
                        <img src={url} className="w-full h-full object-cover" alt={name} loading="lazy" />
                      </motion.button>
                    );
                  })}
                </div>
                {loadingMore && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 size={16} className="animate-spin" style={{ color: '#98A2B3' }} />
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
