'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface PersistentTabOptions<T extends string> {
  key: string;
  defaultValue: T;
  validValues?: readonly T[];
  urlParam?: string;
  syncUrl?: boolean;
}

export function usePersistentTab<T extends string>({
  key,
  defaultValue,
  validValues,
  urlParam,
  syncUrl = false,
}: PersistentTabOptions<T>): [T, (val: T) => void] {
  const isValid = useCallback(
    (val: unknown): val is T => {
      if (!val || typeof val !== 'string') return false;
      if (!validValues || validValues.length === 0) return true;
      return (validValues as readonly string[]).includes(val);
    },
    [validValues],
  );

  const getInitialValue = (): T => {
    if (typeof window !== 'undefined') {
      // 1. URL search params have priority if present (for initial deep-link)
      if (urlParam) {
        try {
          const sp = new URLSearchParams(window.location.search);
          const fromUrl = sp.get(urlParam);
          if (isValid(fromUrl)) {
            return fromUrl;
          }
        } catch {}
      }
      // 2. Saved session storage
      try {
        const fromStorage = sessionStorage.getItem(key);
        if (isValid(fromStorage)) {
          return fromStorage;
        }
      } catch {}
    }
    return defaultValue;
  };

  const [value, setValue] = useState<T>(getInitialValue);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Sync to sessionStorage on mount and value changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(key, value);
    } catch {}

    if (urlParam) {
      try {
        const sp = new URLSearchParams(window.location.search);
        if (syncUrl) {
          if (value !== defaultValue) {
            if (sp.get(urlParam) !== value) {
              sp.set(urlParam, value);
              const target = `${window.location.pathname}?${sp.toString()}`;
              window.history.replaceState(null, '', target);
            }
          } else if (sp.has(urlParam)) {
            sp.delete(urlParam);
            const qs = sp.toString();
            const target = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
            window.history.replaceState(null, '', target);
          }
        } else if (sp.has(urlParam)) {
          // Keep URL clean without ?tab=, ?filter=, etc.
          sp.delete(urlParam);
          const qs = sp.toString();
          const target = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
          window.history.replaceState(null, '', target);
        }
      } catch {}
    }
  }, [key, value, defaultValue, urlParam, syncUrl]);

  // Listen to popstate for browser back/forward navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      try {
        if (urlParam && syncUrl) {
          const sp = new URLSearchParams(window.location.search);
          const fromUrl = sp.get(urlParam);
          if (isValid(fromUrl)) {
            setValue(fromUrl);
            return;
          }
        }
        const fromStorage = sessionStorage.getItem(key);
        if (isValid(fromStorage)) {
          setValue(fromStorage);
        } else {
          setValue(defaultValue);
        }
      } catch {}
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [urlParam, syncUrl, key, isValid, defaultValue]);

  const setPersistentValue = useCallback(
    (newVal: T) => {
      if (newVal === valueRef.current) return;
      setValue(newVal);
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(key, newVal);
        } catch {}
        if (urlParam) {
          try {
            const sp = new URLSearchParams(window.location.search);
            if (syncUrl) {
              if (newVal === defaultValue) {
                sp.delete(urlParam);
              } else {
                sp.set(urlParam, newVal);
              }
              const qs = sp.toString();
              const target = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
              window.history.replaceState(null, '', target);
            } else if (sp.has(urlParam)) {
              sp.delete(urlParam);
              const qs = sp.toString();
              const target = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
              window.history.replaceState(null, '', target);
            }
          } catch {}
        }
      }
    },
    [key, defaultValue, urlParam, syncUrl],
  );

  return [value, setPersistentValue];
}
