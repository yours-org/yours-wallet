import { useState } from 'react';
import { Theme } from '../theme.types';
import { Show } from './Show';
import { BSV21Id } from './BSV21Id';

export type BSV21ItemProps = {
  theme: Theme;
  id: string;
  name: string;
  amount: string;
  iconUrl: string | null;
  selected?: boolean;
  onClick?: () => void;
  onCopyTokenId: () => void;
};

export const BSV21Item = (props: BSV21ItemProps) => {
  const { id, iconUrl, name, amount, theme, onClick, onCopyTokenId } = props;
  const [containerColor, setContainerColor] = useState(theme.color.global.row);

  return (
    <div
      className="flex flex-col w-4/5 p-3 rounded-lg m-1"
      style={{
        backgroundColor: containerColor,
        cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={() => (onClick ? setContainerColor(theme.color.global.row + '99') : undefined)}
      onMouseLeave={() => setContainerColor(theme.color.global.row)}
      onClick={onClick}
    >
      <div className="flex items-center justify-between w-full mt-[0.4rem]">
        <div className="flex items-center max-w-[50%] w-fit">
          <Show when={!!iconUrl && iconUrl.length > 0}>
            <img src={iconUrl as string} className="w-10 h-10 rounded-full object-cover mr-4" />
          </Show>
          <h1
            className="text-[0.9rem] text-left max-w-[5rem] whitespace-nowrap overflow-hidden text-ellipsis m-0 font-semibold"
            style={{ color: theme.color.global.contrast, fontFamily: "'Inter', Arial, Helvetica, sans-serif" }}
          >
            {name}
          </h1>
        </div>
        <p
          className="text-base m-0 text-right w-fit whitespace-nowrap overflow-hidden text-ellipsis"
          style={{ color: theme.color.global.contrast, fontFamily: "'Inter', Arial, Helvetica, sans-serif" }}
        >
          {amount}
        </p>
      </div>

      <BSV21Id theme={theme} id={id} onCopyTokenId={onCopyTokenId} />
    </div>
  );
};
