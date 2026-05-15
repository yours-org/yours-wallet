import { motion } from 'framer-motion';
import ProgressBar from '@ramonak/react-progress-bar';
import { YoursIcon } from './YoursIcon';
import { Show } from './Show';
import { Theme } from '../theme.types';

export type PageLoaderProps = {
  theme: Theme;
  message?: string;
  showProgressBar?: boolean;
  barProgress?: number;
};

export const PageLoader = (props: PageLoaderProps) => {
  const { message, theme, showProgressBar = false, barProgress = 0 } = props;

  return (
    <motion.div
      className="flex flex-col items-center justify-center w-full h-full top-0 left-0 z-[9998]"
      style={{ backgroundColor: theme.color.global.walletBackground }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <YoursIcon width="3.5rem" />

      {message && (
        <motion.p
          className="text-sm text-center mt-3 mb-2 px-6"
          style={{
            color: theme.color.component.pageLoaderText,
            fontFamily: "'Inter', Arial, Helvetica, sans-serif",
          }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.25 }}
        >
          {message}
        </motion.p>
      )}

      <Show
        when={showProgressBar && barProgress > 0}
        whenFalseContent={
          <motion.div
            className="mt-4"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <div
              className="w-8 h-8 rounded-full border-[3px]"
              style={{
                borderColor: theme.color.global.contrast + '30',
                borderTopColor: theme.color.component.pageLoaderSpinner,
              }}
            />
          </motion.div>
        }
      >
        <div className="w-4/5 rounded-full my-1">
          <ProgressBar
            completed={barProgress}
            bgColor={theme.color.component.progressBar}
            baseBgColor={theme.color.component.progressBarTrack}
            height="16px"
          />
        </div>
      </Show>
    </motion.div>
  );
};

// Re-export for backward compatibility with files that import these directly
export const LoaderContainer = ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) => (
  <div className="flex flex-col items-center justify-center w-full h-full" style={style}>
    {children}
  </div>
);

export const Loader = ({ style }: { style?: React.CSSProperties }) => (
  <div className="w-8 h-8 rounded-full border-[3px] border-t-transparent animate-spin" style={style} />
);
