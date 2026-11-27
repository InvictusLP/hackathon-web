'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';

// 1. Motion Duration Tokens
export const motion = {
  fast: '120ms',
  normal: '180ms',
  structural: '250ms',
};

// 2. Easing Tokens
export const easing = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  enter: 'cubic-bezier(0, 0, 0.2, 1)',
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
  reorder: 'cubic-bezier(0.2, 0, 0.2, 1)',
};

// 3. CSS transition string helpers
export function transition(
  property: string,
  durationLevel: keyof typeof motion = 'normal',
  easeLevel: keyof typeof easing = 'standard'
) {
  return `${property} ${motion[durationLevel]} ${easing[easeLevel]}`;
}

// 4. useReducedMotion() hook
export function useReducedMotion(): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setMatches(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener('change', handler);
    
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return matches;
}

// 5. useValueChange hook
export type ValueChangeResult = {
  displayValue: string;
  previousDisplayValue: string | null;
  changed: boolean;
  direction: 'up' | 'down' | 'none';
  key: number;
};

export function useValueChange<T>(
  value: T,
  formatFn: (v: T) => string = String
): ValueChangeResult {
  const [state, setState] = useState<ValueChangeResult>({
    displayValue: formatFn(value),
    previousDisplayValue: null,
    changed: false,
    direction: 'none',
    key: 0,
  });

  const prevRawRef = useRef<T>(value);
  const prevDisplayRef = useRef<string>(state.displayValue);

  useEffect(() => {
    const currentDisplay = formatFn(value);

    if (currentDisplay !== prevDisplayRef.current) {
      let direction: 'up' | 'down' | 'none' = 'none';
      if (typeof value === 'number' && typeof prevRawRef.current === 'number') {
        direction = value > prevRawRef.current ? 'up' : value < prevRawRef.current ? 'down' : 'none';
      }

      setState((s) => ({
        displayValue: currentDisplay,
        previousDisplayValue: prevDisplayRef.current,
        changed: true,
        direction,
        key: s.key + 1,
      }));

      prevRawRef.current = value;
      prevDisplayRef.current = currentDisplay;

      const timer = setTimeout(() => {
        setState((s) => ({ ...s, changed: false }));
      }, parseInt(motion.normal, 10)); // ~180ms

      return () => clearTimeout(timer);
    } else {
      // Even if display didn't change, raw value might have
      prevRawRef.current = value;
    }
  }, [value, formatFn]);

  return state;
}

// 6. useFLIP hook
export function useFLIP(ref: React.RefObject<HTMLElement | null>, key: any) {
  const reducedMotion = useReducedMotion();
  const rectRef = useRef<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!ref.current || reducedMotion) return;

    const el = ref.current;
    const newRect = el.getBoundingClientRect();
    const oldRect = rectRef.current;

    if (oldRect) {
      const deltaX = oldRect.left - newRect.left;
      const deltaY = oldRect.top - newRect.top;

      if (deltaX !== 0 || deltaY !== 0) {
        el.animate(
          [
            { transform: `translate(${deltaX}px, ${deltaY}px)` },
            { transform: 'translate(0, 0)' }
          ],
          {
            duration: parseInt(motion.structural, 10), // 250ms
            easing: easing.reorder,
          }
        );
      }
    }

    rectRef.current = newRect;
  }, [key, ref, reducedMotion]);
}

// 7. useInteractionLock hook
export function useInteractionLock() {
  const [pointerDown, setPointerDown] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hasOpenPopover, setHasOpenPopover] = useState(false);

  const checkPopover = (target: EventTarget | null) => {
    if (target instanceof Element) {
      setHasOpenPopover(!!target.closest('[data-state="open"]'));
    }
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      setPointerDown(true);
      checkPopover(e.currentTarget);
    },
    onPointerUp: () => setPointerDown(false),
    onFocus: (e: React.FocusEvent) => {
      setFocused(true);
      checkPopover(e.currentTarget);
    },
    onBlur: () => setFocused(false),
    onMouseEnter: (e: React.MouseEvent) => {
      checkPopover(e.currentTarget);
    },
    onMouseLeave: () => {
      setPointerDown(false);
      setHasOpenPopover(false);
    }
  };

  const locked = pointerDown || focused || hasOpenPopover;

  return { locked, handlers };
}

// 8. Motion Event Types
export type MotionEvent = 
  | 'RANK_REVISION_CHANGED'
  | 'POOL_VALUE_CHANGED'
  | 'POOL_ENTERED_RANKING'
  | 'POOL_EXITED_RANKING'
  | 'FILTER_APPLIED'
  | 'TIMEFRAME_CHANGED'
  | 'SORT_CHANGED'
  | 'PAGE_CHANGED'
  | 'DEPOSIT_CONFIRMED'
  | 'SSE_RECONNECTED';

// 9. Change classification
export type ChangeClass = 'DATA_ONLY' | 'ORDER' | 'MEMBERSHIP' | 'QUERY' | 'USER_ACTION';

// 10. CHANGE_THRESHOLDS
export const CHANGE_THRESHOLDS = {
  price: 0.01,
  tvl: 0.1,
  volume: 1.0,
  fees: 1.0,
  rank: 0,
};

// 11. Helper: shouldAnimate
export function shouldAnimate(_changeClass: ChangeClass, reducedMotion: boolean): boolean {
  if (reducedMotion) return false;
  return true;
}

// 12. useNumberTicker hook
export interface NumberTickerResult {
  displayValue: string;
  direction: 'up' | 'down' | 'none';
  showIndicator: boolean;
  indicatorKey: number;
}

export function useNumberTicker(
  value: number | null | undefined,
  formatFn: (v: number | null | undefined) => string,
  duration = 450
): NumberTickerResult {
  const reducedMotion = useReducedMotion();
  const formatFnRef = useRef(formatFn);
  formatFnRef.current = formatFn;

  const [displayValue, setDisplayValue] = useState<string>(() => formatFn(value));
  const [indicatorState, setIndicatorState] = useState<{
    show: boolean;
    direction: 'up' | 'down' | 'none';
    key: number;
  }>({
    show: false,
    direction: 'none',
    key: 0,
  });

  const prevValueRef = useRef<number | null | undefined>(value);
  const currentAnimValRef = useRef<number | null>(typeof value === 'number' ? value : null);
  const indicatorKeyRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstMountRef = useRef(true);

  useEffect(() => {
    // Initial mount - display static value without animation or indicator
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      prevValueRef.current = value;
      currentAnimValRef.current = typeof value === 'number' && Number.isFinite(value) ? value : null;
      return;
    }

    const prev = prevValueRef.current;
    prevValueRef.current = value;

    const prevDisplay = formatFnRef.current(prev);
    const currentDisplay = formatFnRef.current(value);

    // If either previous or current value is non-numeric, jump directly
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(value) ||
      prev === null ||
      prev === undefined ||
      !Number.isFinite(prev)
    ) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      currentAnimValRef.current = typeof value === 'number' && Number.isFinite(value) ? value : null;
      setDisplayValue(currentDisplay);
      return;
    }

    // Check difference
    const diff = (value ?? 0) - (prev ?? 0);
    if (Math.abs(diff) < 1e-9) {
      currentAnimValRef.current = typeof value === 'number' && Number.isFinite(value) ? value : null;
      setDisplayValue(currentDisplay);
      return;
    }

    const dir: 'up' | 'down' = diff > 0 ? 'up' : 'down';
    indicatorKeyRef.current += 1;
    const nextKey = indicatorKeyRef.current;

    // Trigger single-shot triangle indicator
    setIndicatorState({
      show: true,
      direction: dir,
      key: nextKey,
    });

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setIndicatorState((s) => (s.key === nextKey ? { ...s, show: false } : s));
    }, 1200);

    // If reduced motion is preferred, jump without ticker animation
    if (reducedMotion) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      currentAnimValRef.current = value;
      setDisplayValue(currentDisplay);
      return;
    }

    // If the formatted display string has NOT changed, jump directly without ticking
    if (prevDisplay === currentDisplay) {
      currentAnimValRef.current = typeof value === 'number' && Number.isFinite(value) ? value : null;
      setDisplayValue(currentDisplay);
      return;
    }

    // Animate ticker
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const startVal = currentAnimValRef.current ?? prev;
    const endVal = value;
    const startTime = performance.now();
    let lastRenderTime = 0;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = startVal + (endVal - startVal) * eased;
      currentAnimValRef.current = current;

      if (progress < 1) {
        // Throttle to ~40fps (25ms) to save CPU overhead
        if (now - lastRenderTime >= 25) {
          lastRenderTime = now;
          setDisplayValue(formatFnRef.current(current));
        }
        rafRef.current = requestAnimationFrame(step);
      } else {
        currentAnimValRef.current = endVal;
        setDisplayValue(formatFnRef.current(endVal));
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, duration, reducedMotion]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    displayValue,
    direction: indicatorState.direction,
    showIndicator: indicatorState.show,
    indicatorKey: indicatorState.key,
  };
}

