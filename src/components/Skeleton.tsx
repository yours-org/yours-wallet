import { motion } from 'framer-motion';
import { useTheme } from '../hooks/useTheme';

/** A placeholder block that breathes while the real content loads; sized by `className` and `style`. */
export const Skeleton = ({ className = '', style }: { className?: string; style?: React.CSSProperties }) => {
  const { theme } = useTheme();
  return (
    <motion.div
      aria-hidden
      className={`rounded-md ${className}`}
      style={{ backgroundColor: theme.color.global.row, ...style }}
      animate={{ opacity: [0.55, 1, 0.55] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
};

/** One asset row's shape while its balance or price is still loading. */
export const AssetRowSkeleton = () => {
  const { theme } = useTheme();
  return (
    <div
      aria-hidden
      className="flex items-center justify-between w-full px-4 py-3 rounded-xl"
      style={{ background: theme.color.global.row, border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="w-9 h-9 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="w-20 h-3.5" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <Skeleton className="w-28 h-3" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <Skeleton className="w-16 h-3.5" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
        <Skeleton className="w-10 h-3" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
      </div>
    </div>
  );
};
