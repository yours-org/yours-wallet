import { NetWork } from '../services/types/provider.types';
import { useTheme } from '../hooks/useTheme';

export const NetworkPicker = ({ value, onChange }: { value: NetWork; onChange: (network: NetWork) => void }) => {
  const { theme } = useTheme();
  return (
    <label
      className="flex items-center justify-between w-[85%] my-2 text-sm"
      style={{ color: theme.color.global.contrast }}
    >
      Network
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as NetWork)}
        className="rounded-xl border px-3 py-2 text-sm outline-none"
        style={{
          backgroundColor: theme.color.global.row,
          borderColor: theme.color.global.gray + '40',
          color: theme.color.global.contrast,
        }}
      >
        <option value={NetWork.Mainnet}>Mainnet</option>
        <option value={NetWork.Testnet}>Testnet</option>
      </select>
    </label>
  );
};
