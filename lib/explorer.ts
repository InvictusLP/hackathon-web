'use client';

import { useEffect, useState } from 'react';

export type BlockExplorerId = 'rh-scan' | 'robinscan' | 'blockscout';

export interface BlockExplorerConfig {
  id: BlockExplorerId;
  name: string;
  baseUrl: string;
  domain: string;
  description: string;
  isDefault?: boolean;
}

export const BLOCK_EXPLORERS: Record<BlockExplorerId, BlockExplorerConfig> = {
  'rh-scan': {
    id: 'rh-scan',
    name: 'RH-Scan',
    baseUrl: 'https://rh-scan.com',
    domain: 'rh-scan.com',
    description: 'Primary community explorer (Etherscan-compatible)',
    isDefault: true,
  },
  'robinscan': {
    id: 'robinscan',
    name: 'Robinscan',
    baseUrl: 'https://robinscan.io',
    domain: 'robinscan.io',
    description: 'Fast normalized indexer & contract explorer',
  },
  'blockscout': {
    id: 'blockscout',
    name: 'Blockscout',
    baseUrl: 'https://robinhoodchain.blockscout.com',
    domain: 'robinhoodchain.blockscout.com',
    description: 'Official hosted Blockscout explorer instance',
  },
};

export const EXPLORER_OPTIONS: BlockExplorerConfig[] = [
  BLOCK_EXPLORERS['rh-scan'],
  BLOCK_EXPLORERS['robinscan'],
  BLOCK_EXPLORERS['blockscout'],
];

export const DEFAULT_EXPLORER_ID: BlockExplorerId = 'rh-scan';
const STORAGE_KEY = 'invictus:block_explorer';
const CHANGE_EVENT = 'invictus:explorer-changed';

let currentExplorerId: BlockExplorerId = DEFAULT_EXPLORER_ID;

export const getActiveExplorerId = (): BlockExplorerId => {
  if (typeof window === 'undefined') return DEFAULT_EXPLORER_ID;
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as BlockExplorerId;
    if (saved && BLOCK_EXPLORERS[saved]) {
      currentExplorerId = saved;
      return saved;
    }
  } catch {
    // Ignore storage restrictions
  }
  return currentExplorerId;
};

export const getActiveExplorer = (): BlockExplorerConfig => {
  const id = getActiveExplorerId();
  return BLOCK_EXPLORERS[id] || BLOCK_EXPLORERS[DEFAULT_EXPLORER_ID];
};

export const setActiveExplorerId = (id: BlockExplorerId): void => {
  if (!BLOCK_EXPLORERS[id]) return;
  currentExplorerId = id;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Ignore storage restrictions
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
  }
};

export const setServerDefaultExplorerUrl = (url: string): void => {
  if (!url) return;
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return;
    } catch {
      // Ignore storage restrictions
    }
  }
  const matchedKey = (Object.keys(BLOCK_EXPLORERS) as BlockExplorerId[]).find(
    (key) => url.includes(BLOCK_EXPLORERS[key].domain)
  );
  if (matchedKey) {
    currentExplorerId = matchedKey;
  }
};

/**
 * Universal explorer URL builder supporting:
 * - /address/0x...
 * - /token/0x...
 * - /token/0x...?a=123 (position NFT instances)
 * - /tx/0x...
 * - /block/123
 * - Raw 0x addresses / hashes (auto-detects length)
 */
export const formatExplorerUrl = (target: string, explorerId?: BlockExplorerId): string => {
  const explorer = explorerId ? BLOCK_EXPLORERS[explorerId] : getActiveExplorer();
  const base = (explorer?.baseUrl || BLOCK_EXPLORERS[DEFAULT_EXPLORER_ID].baseUrl).replace(/\/+$/, '');

  if (!target) return base;
  if (target.startsWith('http://') || target.startsWith('https://')) return target;
  if (target.startsWith('/')) return `${base}${target}`;
  if (target.startsWith('0x')) {
    if (target.length === 66) return `${base}/tx/${target}`;
    return `${base}/token/${target}`;
  }
  return `${base}/${target}`;
};

/**
 * React hook providing reactive block explorer selection across all UI components.
 */
export const useBlockExplorer = () => {
  const [activeId, setActiveId] = useState<BlockExplorerId>(() => getActiveExplorerId());

  useEffect(() => {
    setActiveId(getActiveExplorerId());

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && BLOCK_EXPLORERS[e.newValue as BlockExplorerId]) {
        setActiveId(e.newValue as BlockExplorerId);
      }
    };

    const handleCustom = (e: Event) => {
      const custom = e as CustomEvent<BlockExplorerId>;
      if (custom.detail && BLOCK_EXPLORERS[custom.detail]) {
        setActiveId(custom.detail);
      } else {
        setActiveId(getActiveExplorerId());
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(CHANGE_EVENT, handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(CHANGE_EVENT, handleCustom);
    };
  }, []);

  return {
    explorerId: activeId,
    explorer: BLOCK_EXPLORERS[activeId] || BLOCK_EXPLORERS[DEFAULT_EXPLORER_ID],
    setExplorerId: setActiveExplorerId,
    options: EXPLORER_OPTIONS,
    formatUrl: (target: string) => formatExplorerUrl(target, activeId),
  };
};
