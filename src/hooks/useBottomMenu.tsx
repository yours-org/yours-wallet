import { useContext, useEffect } from 'react';
import { BottomMenuContext } from '../contexts/BottomMenuContext';
import { useNavigate } from 'react-router-dom';

export const useBottomMenu = () => {
  const context = useContext(BottomMenuContext);
  const navigate = useNavigate();

  if (!context) {
    throw new Error('useBottomMenu must be used within a BottomMenuProvier');
  }

  useEffect(() => {
    if (!context || !navigate) return;
    switch (context.selected) {
      case 'bsv':
        navigate('/bsv-wallet');
        break;
      case 'ords':
        navigate('/ord-wallet');
        break;
      case 'settings':
        navigate('/settings');
        break;
      case 'tools':
        navigate('/tools');
        break;
      default:
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.selected]);

  return context;
};
