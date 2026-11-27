import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Liquidity',
};

export default function LiquidityLayout({ children }: { children: React.ReactNode }) {
  return children;
}

