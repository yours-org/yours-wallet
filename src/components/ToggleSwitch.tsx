import { ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import { Theme } from '../theme.types';

export type ToggleSwitchProps = {
  on: boolean;
  theme: Theme;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
};

export const ToggleSwitch = (props: ToggleSwitchProps) => {
  const { on, theme } = props;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (props.onChange) {
      props.onChange(e);
    }
  };

  const trackOn = theme.color.component.toggleSwitchOn;
  const trackOff = theme.color.global.contrast + '30';

  return (
    <label className="flex items-center gap-2.5 cursor-pointer">
      <input checked={on} type="checkbox" onChange={handleChange} className="sr-only" />
      <div
        className="relative w-10 h-5 rounded-full transition-colors duration-300"
        style={{ background: on ? trackOn : trackOff }}
      >
        <motion.div
          className="absolute top-1/2 w-4 h-4 rounded-full bg-white shadow-sm"
          style={{ y: '-50%' }}
          animate={{ x: on ? '1.25rem' : '0.125rem' }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      </div>
    </label>
  );
};
