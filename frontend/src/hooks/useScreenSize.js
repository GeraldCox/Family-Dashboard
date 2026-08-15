import { useState, useEffect } from 'react';

function getScreenSize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return {
    width,
    height,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1200,
  };
}

export function useScreenSize() {
  const [size, setSize] = useState(getScreenSize);

  useEffect(() => {
    function handleResize() {
      setSize(getScreenSize());
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
}
