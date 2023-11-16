import { useEffect, useState } from 'react';

export const useViewport = () => {
  const [windowSize, setWindowSize] = useState(window.innerWidth);

  const handleResize = () => {
    setWindowSize(window.innerWidth);
  };

  useEffect(() => {
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const isMobile = windowSize <= 780 && windowSize > 360; //360 is the size of extension viewport and we don't want mobile rendering there
  const isTablet = windowSize > 780 && windowSize <= 1024;
  const isDesktop = windowSize > 1024;

  console.log(isMobile);

  return { isMobile, isTablet, isDesktop };
};
