import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Referral',
};

export default function ReferralLayout({ children }: { children: React.ReactNode }) {
  return children;
}
