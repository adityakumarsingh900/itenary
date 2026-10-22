import { useEffect, useState } from 'react';

/**
 * Hook to detect if the current window matches a mobile breakpoint.
 * Defaults to 768px.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.innerWidth <= breakpoint;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);

    const updateMatches = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };

    updateMatches(mediaQuery);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateMatches);
      return () => mediaQuery.removeEventListener('change', updateMatches);
    } else {
      // Legacy Safari compatibility
      mediaQuery.addListener(updateMatches);
      return () => mediaQuery.removeListener(updateMatches);
    }
  }, [breakpoint]);

  return isMobile;
}
