'use client';

import { createContext, useContext, type ReactNode } from 'react';

interface PortfolioActionContextValue {
  action: ReactNode;
  setAction: (action: ReactNode) => void;
  onRefresh?: (() => void | Promise<void>) | null;
  setOnRefresh: (fn: (() => void | Promise<void>) | null) => void;
  refreshing?: boolean;
  setRefreshing: (refreshing: boolean) => void;
}

export const PortfolioActionContext = createContext<PortfolioActionContextValue>({
  action: null,
  setAction: () => {},
  onRefresh: null,
  setOnRefresh: () => {},
  refreshing: false,
  setRefreshing: () => {},
});

export const usePortfolioAction = () => useContext(PortfolioActionContext);
