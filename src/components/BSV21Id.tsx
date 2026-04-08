import { Theme } from '../theme.types';
import { IconButton } from './IconButton';
import copyIcon from '../assets/copy.svg';

export type BSV21IdProps = {
  theme: Theme;
  id: string;
  onCopyTokenId: () => void;
};

function showId(id: string) {
  return id.substring(0, 5) + '...' + id.substring(id.length - 6);
}

export const BSV21Id = (props: BSV21IdProps) => {
  const { id, theme, onCopyTokenId } = props;

  const copy = (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    onCopyTokenId();
  };

  return (
    <div className="flex items-center justify-center w-full mt-[0.4rem]" onClick={copy}>
      <IconButton icon={copyIcon} onClick={(e) => copy(e)} />
      <span
        className="text-[0.85rem] max-w-[16rem] whitespace-nowrap overflow-hidden text-ellipsis w-fit cursor-pointer"
        style={{ color: theme.color.global.gray }}
        title={id}
      >
        {showId(id)}
      </span>
    </div>
  );
};
