import { NetWork } from '../services/types/provider.types';
import { Theme } from '../theme.types';

export const NetworkChoice = ({
  network,
  onChange,
  theme,
}: {
  network: NetWork;
  onChange: (network: NetWork) => void;
  theme: Theme;
}) => {
  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const accent = theme.color.component.primaryButtonLeftGradient;

  const option = (value: NetWork, label: string) => {
    const selected = network === value;
    return (
      <button
        type="button"
        onClick={() => onChange(value)}
        className="flex-1 rounded-lg py-2 text-xs font-semibold"
        style={{
          color: selected ? accent : contrast,
          background: selected ? accent + '18' : 'transparent',
          border: `1px solid ${selected ? accent : gray + '40'}`,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="w-[87%] mb-4">
      <p className="text-[10px] mb-1.5 text-center" style={{ color: gray }}>
        Network. This cannot be changed later.
      </p>
      <div className="flex gap-2">
        {option(NetWork.Mainnet, 'Mainnet')}
        {option(NetWork.Testnet, 'Testnet')}
      </div>
    </div>
  );
};
