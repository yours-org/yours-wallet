import { FaArrowLeft } from 'react-icons/fa';
import { Theme } from '../theme.types';

export type BackButtonProps = {
  theme: Theme;
  onClick: () => void;
};

export const BackButton = (props: BackButtonProps) => {
  const { onClick, theme } = props;
  return (
    <FaArrowLeft size={'1rem'} style={{ cursor: 'pointer' }} color={theme.color.global.contrast} onClick={onClick} />
  );
};
