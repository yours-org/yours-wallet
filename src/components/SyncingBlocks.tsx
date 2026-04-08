import { useBlockHeightTracker } from '../hooks/useBlockHeightTracker';
import { Show } from './Show';
import ProgressBar from '@ramonak/react-progress-bar';
import { useTheme } from '../hooks/useTheme';
import { YoursIcon } from './YoursIcon';

export const SyncingBlocks = () => {
  const { theme } = useTheme();
  const { percentCompleted, showSyncPage } = useBlockHeightTracker();

  return (
    <Show when={showSyncPage}>
      {percentCompleted !== 100 && (
        <div
          className="flex flex-col items-center justify-center w-full h-full z-[1000] absolute"
          style={{ backgroundColor: theme.color.global.walletBackground }}
        >
          <YoursIcon width="4rem" />
          <h1 className="text-center w-full mt-0 mb-4" style={{ color: theme.color.global.contrast }}>
            Syncing Blocks...
          </h1>
          <p className="text-center w-4/5 -mt-2 mb-4" style={{ color: theme.color.global.gray }}>
            Yours SPV Wallet will be ready to use once this process is complete.
          </p>
          <ProgressBar
            completed={percentCompleted}
            bgColor={theme.color.component.progressBar}
            baseBgColor={theme.color.component.progressBarTrack}
            height="16px"
            width="80vw"
          />
        </div>
      )}
    </Show>
  );
};
