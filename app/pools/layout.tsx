import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pools',
};

export default function PoolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
