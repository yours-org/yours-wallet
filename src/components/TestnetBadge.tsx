import { FlaskConical } from 'lucide-react';

/** Amber used for every testnet indicator so they read as one system. */
export const TESTNET_COLOR = '#FDB022';

type Props = {
  /** `pill` is the header/dropdown chip; `tag` is the tiny inline label. */
  size?: 'pill' | 'tag';
  className?: string;
};

/** Small amber "TESTNET" chip. Render only when the account is on testnet. */
export const TestnetBadge = ({ size = 'pill', className = '' }: Props) => {
  const isPill = size === 'pill';
  return (
    <span
      title="This account is on testnet. Coins have no real value."
      className={`inline-flex items-center gap-1 rounded-md font-bold uppercase tracking-wider select-none shrink-0 ${
        isPill ? 'px-1.5 py-0.5 text-[9px]' : 'px-1 py-px text-[8px]'
      } ${className}`}
      style={{
        color: TESTNET_COLOR,
        background: 'rgba(253,176,34,0.12)',
        border: '1px solid rgba(253,176,34,0.35)',
        lineHeight: 1.2,
      }}
    >
      {isPill && <FlaskConical size={9} strokeWidth={2.5} />}
      Testnet
    </span>
  );
};
