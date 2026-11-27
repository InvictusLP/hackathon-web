export const usd = (n: number | null | undefined): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  if (n === 0) return '$0';
  const a = Math.abs(n);
  if (a >= 1e9) {
    const formatted = (n / 1e9).toFixed(2);
    const clean = formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
    return `$${clean}B`;
  }
  if (a >= 1e6) {
    const formatted = (n / 1e6).toFixed(2);
    const clean = formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
    return `$${clean}M`;
  }
  if (a >= 1e5) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (a >= 1) {
    const formatted = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const clean = formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
    return `$${clean}`;
  }
  if (a >= 0.1) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (a >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
};

/** A pool's DEXTools page: trades show live there, where DexScreener lags. A v3 pool address or a v4 pool id. */
export const poolChartUrl = (poolId: string): string =>
  `https://www.dextools.io/app/robinhood/pair-explorer/${poolId.toLowerCase()}`;

/** 2-decimal precision with a k / M / B suffix, omitting trailing .00 (e.g. 102.02M, 54.30k, $100M, $1B, $0). */
export const compactUsd = (n: number | null | undefined): string => {
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return '-';
  const [unit, suffix] =
    n >= 1e12 ? [1e12, 'T'] : n >= 1e9 ? [1e9, 'B'] : n >= 1e6 ? [1e6, 'M'] : n >= 1e3 ? [1e3, 'k'] : [1, ''];
  const val = n / unit;
  const formatted = val.toFixed(2);
  if (Number(formatted) >= 1000 && unit < 1e12) {
    return compactUsd(Number(formatted) * unit);
  }
  const clean = formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
  return `$${clean}${suffix}`;
};

export const signedUsd = (n: number): string =>
  Math.abs(n) < 0.005 ? '$0.00' : `${n >= 0 ? '+' : '-'}${usd(Math.abs(n))}`;

/** 1 USD = `rate` of `code`. */
export interface Fx {
  code: string;
  rate: number;
}

const LOCALES: Record<string, string> = { IDR: 'id-ID' };

/** A USD amount in the other currency: "Rp 17.606.130", "+Rp 1.250". Mirrors src/fx.ts. */
export const fiat = (usdAmount: number, fx: Fx, signed = false): string => {
  const v = usdAmount * fx.rate;
  if (!Number.isFinite(v)) return '-';
  const dp = fx.rate >= 100 ? 0 : 2;
  const body = new Intl.NumberFormat(LOCALES[fx.code] ?? 'en-US', {
    style: 'currency',
    currency: fx.code,
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })
    .format(Math.abs(v))
    .replace(/\s/g, ' ');
  const rounded = Math.round(Math.abs(v) * 10 ** dp) === 0;
  return `${rounded ? '' : v < 0 ? '-' : signed ? '+' : ''}${body}`;
};

export const pct = (n: number, dp = 2): string => `${n.toFixed(dp)}%`;
// Rounded before the sign is chosen: -0.001 is "0.00%", not "-0.00%".
export const signedPct = (n: number, dp = 2): string => {
  const r = Number(n.toFixed(dp)) || 0;
  return `${r > 0 ? '+' : ''}${r.toFixed(dp)}%`;
};

export const num = (n: number | null | undefined, maxDp = 6): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const a = Math.abs(n);
  if (a === 0) return '0';
  if (a >= 1e6) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: Math.min(maxDp, 4) });
  if (a >= 1e-6) return n.toFixed(Math.min(maxDp + 2, 12)).replace(/0+$/, '');
  return n.toExponential(3);
};

export const eth = (n: number): string => `${num(n, 5)} ETH`;

/** A balance written out for an input, every digit kept: MAX must not round a balance up past itself, or a dust balance down to 0. */
export const plainAmount = (n: number): string =>
  n > 0 ? n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 18 }) : '0';

export const shortAddr = (a: string | null | undefined): string =>
  a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '-';

export const ago = (at: number | null): string => {
  if (!at) return 'never';
  const d = Math.max(0, Date.now() - at);
  if (d >= 86_400_000) return `${Math.floor(d / 86_400_000)}d ago`;
  if (d >= 3_600_000) return `${Math.floor(d / 3_600_000)}h ago`;
  if (d >= 60_000) return `${Math.floor(d / 60_000)}m ago`;
  return 'just now';
};

export const duration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return '<1m';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${Math.max(1, m)}m`;
};

export type Tone = 'up' | 'down' | 'flat';

export const tone = (n: number): Tone => (Math.abs(n) < 0.005 ? 'flat' : n > 0 ? 'up' : 'down');

export const toneClass = (n: number): string =>
  Math.abs(n) < 0.005 ? 'text-muted-foreground' : n > 0 ? 'text-up' : 'text-down';

export const isDynamicFee = (fee?: number | null): boolean => fee === 8388608 || fee === 0x800000;

export const feeTier = (fee: number): string => {
  if (isDynamicFee(fee) || fee >= 800000) return '0.00%';
  const pct = fee / 10_000;
  if (pct >= 9.995) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
};

/** Formats small decimal prices with unicode subscript zero notation, and standard prices with commas. */
export const formatSubscriptPrice = (price: number): string => {
  if (!price || price <= 0 || !Number.isFinite(price)) return '-';
  const a = Math.abs(price);
  if (a >= 1000) {
    return a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (a >= 1) {
    const s = a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return s.endsWith('.00') ? s.slice(0, -3) : s;
  }
  if (a >= 0.01) {
    return a.toFixed(4);
  }
  const s = a.toFixed(18);
  const m = s.match(/^0\.(0{3,})(\d+)/);
  if (m && m[1] && m[2]) {
    const zeroCount = m[1].length;
    const digits = m[2].slice(0, 4);
    const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
    const subStr = String(zeroCount)
      .split('')
      .map((d) => subscripts[Number(d)] ?? d)
      .join('');
    return `0.0${subStr}${digits}`;
  }
  return a.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
};

/** Formats price standardized in USD with dollar sign prefix. */
export const formatUsdPrice = (price: number | null | undefined): string => {
  if (price === null || price === undefined || !Number.isFinite(price) || price <= 0) return '-';
  return `$${formatSubscriptPrice(price)}`;
};

export const formatCompactIdr = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return 'Rp 0';
  const sign = amount < 0 ? '-' : '';
  const a = Math.abs(amount);
  if (a < 1) return `${sign}Rp 0`;

  let unit = '';
  let div = 1;
  if (a >= 1e12) {
    div = 1e12;
    unit = 'T';
  } else if (a >= 1e9) {
    div = 1e9;
    unit = 'M';
  } else if (a >= 1e6) {
    div = 1e6;
    unit = 'jt';
  } else if (a >= 1e3) {
    div = 1e3;
    unit = 'rb';
  } else {
    return `${sign}Rp ${Math.round(a).toLocaleString('id-ID')}`;
  }

  const val = a / div;
  let formatted: string;
  if (val >= 100) {
    formatted = val.toFixed(0);
  } else if (val >= 10) {
    formatted = val.toFixed(1).replace(/\.0$/, '');
  } else {
    formatted = val.toFixed(2).replace(/(\.[0-9]*[1-9])0+$|\.00$/, '$1');
  }

  return `${sign}Rp ${formatted}${unit}`;
};
