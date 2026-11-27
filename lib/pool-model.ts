import type { CanonicalPool } from './types';
import { duration, formatSubscriptPrice, signedPct, usd, compactUsd } from './format';

export type Timeframe = '5m' | '1h' | '6h' | '24h';

/** Semantic pool identity group */
export interface PoolIdentityData {
  token0: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoUrl?: string | null;
  };
  token1: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoUrl?: string | null;
  };
  protocol: string;
  protocolVersion: 'v3' | 'v4' | string;
  dexId: string;
  poolAddress: string;
  id: string;
  feeTier: number;
  feeTierFormatted: string;
  tickSpacing: number;
  binStepPct: number | null;
  currentTick: number | null;
  hooks: string;
  hasHook?: boolean;
  launchpad?: string | null;
  tokenOrigin?: string | null;
  isDynamicFee?: boolean;
}

/** Semantic market context group */
export interface MarketData {
  marketCap: number | null;
  fdv: number | null;
  poolAgeMs: number | null;
  tokenAgeMs: number | null;
  priceUsd: number | null;
  priceQuote: number | null;
  quoteSymbol: string;
  priceChangePct: number | null;
  timeframe: Timeframe;
}

/** Semantic liquidity group */
export interface LiquidityData {
  tvlUsd: number | null;
  activeTvlUsd: number | null;
  activeLiquidityPercentage: number | null;
  netLiquidityFlowUsd: number | null;
  tvlChangePct: number | null;
  isConcentrated: boolean;
  liquiditySource?: 'coingecko' | 'dexscreener' | 'onchain' | 'unavailable' | string | null;
  bottleneckDepthUsd: number | null;
  depthToken0Usd: number | null;
  depthToken1Usd: number | null;
  executionStatus: string;
  executionModel: string;
  isDepthFresh: boolean;
}

/** Semantic activity group */
export interface ActivityData {
  volumeUsd: number | null;
  volumeChangePct: number | null;
  volumeToTvl: number | null;
  volumeToActiveTvl: number | null;
  swapsCount: number | null;
  buysCount: number | null;
  sellsCount: number | null;
  traders: number | null;
  makers: number | null;
}

/** Semantic fee & yield group */
export interface YieldData {
  feeRevenueUsd: number | null;
  feeToTvl: number | null;
  feeToActiveTvl: number | null;
  estimatedApr: number | null;
}

/** Semantic risk group */
export interface RiskData {
  volatility: number | null;
  holderConcentration: number | null;
  tokenRiskFlags: string[];
  warnings: string[];
}

/**
 * Normalized presentation model for pool discovery.
 * Decouples presentation components from raw wire formats and supports
 * configurable column layouts.
 */
export interface DiscoveredPool {
  id: string;
  canonicalId: string;
  raw: CanonicalPool;
  poolIdentity: PoolIdentityData;
  market: MarketData;
  liquidity: LiquidityData;
  activity: ActivityData;
  yield: YieldData;
  risk: RiskData;
}

export const formatFeeTier = (fee: number | null | undefined, hasHook?: boolean): string => {
  if (fee === null || fee === undefined) return '—';
  if (fee >= 800000 || (fee === 0 && hasHook)) return '0.00%';
  const pct = fee / 10000;
  // For fees >= 10% (4 digits 10.00%): format as 3 digits (1 decimal) -> 10.0%
  if (pct >= 9.995) {
    return `${pct.toFixed(1)}%`;
  }
  // If fee has sub-bip dust or >= 1% fee with trailing decimals (e.g. 1.008% -> 1.00%):
  if (pct >= 1 && Math.abs(pct - Math.round(pct)) < 0.015) {
    return `${Math.round(pct).toFixed(2)}%`;
  }
  if (pct >= 1) {
    return `${pct.toFixed(2)}%`;
  }
  // For fees < 1%: if close to standard bips (e.g. 0.0508 -> 0.05, 0.3008 -> 0.30):
  if (pct >= 0.01 && Math.abs(pct * 100 - Math.round(pct * 100)) < 0.15) {
    return `${(Math.round(pct * 100) / 100).toFixed(2)}%`;
  }
  const hasSubBip = Math.abs(pct * 100 - Math.round(pct * 100)) > 1e-4;
  return `${hasSubBip ? pct.toFixed(3) : pct.toFixed(2)}%`;
};

export const formatCompactAge = (createdAt: number | null): string => {
  if (!createdAt) return '—';
  const ms = createdAt < 1e11 ? createdAt * 1000 : createdAt;
  return `${duration(Date.now() - ms)} ago`;
};

export const formatTurnoverRatio = (ratio: number | null | undefined): string => {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—';
  if (ratio >= 1000) return '>999 TVL';
  if (ratio >= 100) return `${Math.round(ratio)} TVL`;
  if (ratio >= 10) return `${ratio.toFixed(1)} TVL`;
  if (ratio >= 0.01) return `${ratio.toFixed(2)} TVL`;
  if (ratio > 0) return '<0.01 TVL';
  return '0.00 TVL';
};

export const formatPriceUsd = (
  priceUsd: number | null | undefined,
  fallbackQuotePrice?: number | null,
  quoteSymbol?: string,
): string => {
  const isStable = quoteSymbol && ['USDG', 'USDC', 'USDT', 'DAI'].includes(quoteSymbol.toUpperCase());
  const effectiveUsd =
    priceUsd !== null && priceUsd !== undefined && Number.isFinite(priceUsd) && priceUsd > 0
      ? priceUsd
      : isStable && fallbackQuotePrice !== null && fallbackQuotePrice !== undefined && Number.isFinite(fallbackQuotePrice) && fallbackQuotePrice > 0
        ? fallbackQuotePrice
        : null;

  if (effectiveUsd !== null && effectiveUsd !== undefined && Number.isFinite(effectiveUsd) && effectiveUsd > 0) {
    if (effectiveUsd >= 1e12) {
      const val = (effectiveUsd / 1e12).toFixed(2);
      const clean = val.endsWith('.00') ? val.slice(0, -3) : val;
      return `$${clean}T`;
    }
    if (effectiveUsd >= 1e9) {
      const val = (effectiveUsd / 1e9).toFixed(2);
      const clean = val.endsWith('.00') ? val.slice(0, -3) : val;
      return `$${clean}B`;
    }
    if (effectiveUsd >= 1e6) {
      const val = (effectiveUsd / 1e6).toFixed(2);
      const clean = val.endsWith('.00') ? val.slice(0, -3) : val;
      return `$${clean}M`;
    }
    if (effectiveUsd < 0.01) return `$${formatSubscriptPrice(effectiveUsd)}`;
    if (effectiveUsd >= 1 && Math.abs(effectiveUsd - Math.round(effectiveUsd)) < 0.015) {
      return usd(Math.round(effectiveUsd));
    }
    return usd(effectiveUsd);
  }
  if (fallbackQuotePrice !== null && fallbackQuotePrice !== undefined && Number.isFinite(fallbackQuotePrice) && fallbackQuotePrice > 0) {
    return `$${formatSubscriptPrice(fallbackQuotePrice)}`;
  }
  return '—';
};

export const formatExecutionDepth = (
  depth: number | null | undefined,
  status?: string | null,
): string => {
  if (depth !== null && depth !== undefined) {
    if (depth === 0) return '$0';
    return compactUsd(depth);
  }
  switch (status) {
    case 'REQUIRES_SIMULATION':
      return 'Requires quote';
    case 'UNSUPPORTED':
      return 'Unsupported';
    case 'STALE':
      return 'Refreshing';
    case 'PENDING':
      return 'Pending';
    default:
      return 'Unavailable';
  }
};

export const formatApr = (apr: number | null | undefined): string => {
  if (apr === null || apr === undefined || !Number.isFinite(apr)) return '—';
  if (apr <= 0) return '0.0% APR';
  if (apr > 99_999) return '>99k% APR';
  if (apr >= 10_000) return `~${(apr / 1000).toFixed(1)}k% APR`;
  if (apr >= 1_000) return `~${Math.round(apr).toLocaleString('en-US')}% APR`;
  if (apr >= 0.01) return `~${apr.toFixed(1)}% APR`;
  return '<0.01% APR';
};

export const formatPctChange = (pct: number | null | undefined): string => {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
  if (Math.abs(pct) < 0.005) return '0.00%';
  if (pct > 99_999) return '>+99k%';
  if (pct < -99_999) return '<-99k%';
  if (Math.abs(pct) >= 10_000) return `${pct > 0 ? '+' : ''}${(pct / 1000).toFixed(1)}k%`;
  return signedPct(pct);
};

export const getVolumeForTimeframe = (p: CanonicalPool, tf: Timeframe): number | null => {
  if (tf === '5m') return p.volume5mUsd ?? p.volumeTimeframes?.m5 ?? null;
  if (tf === '1h') return p.volume1hUsd ?? p.volumeTimeframes?.h1 ?? null;
  if (tf === '6h') return p.volume6hUsd ?? p.volumeTimeframes?.h6 ?? null;
  return p.volume24hUsd ?? p.volumeTimeframes?.h24 ?? null;
};

export const getPriceChangeForTimeframe = (p: CanonicalPool, tf: Timeframe): number | null => {
  let val: number | null | undefined;
  if (tf === '5m') val = p.priceChange5m ?? p.priceChange?.m5;
  else if (tf === '1h') val = p.priceChange1h ?? p.priceChange?.h1;
  else if (tf === '6h') val = p.priceChange6h ?? p.priceChange?.h6;
  else val = p.priceChange24h ?? p.priceChange?.h24;

  if (val !== undefined && val !== null && Number.isFinite(val)) {
    return val;
  }

  // If confirmed 0 volume in this timeframe window and pool has a known spot price,
  // price was unswapped (0.0% flat change)
  const tfVol = getVolumeForTimeframe(p, tf);
  if (tfVol === 0 && p.priceNow !== null && p.priceNow !== undefined && p.priceNow > 0) {
    return 0;
  }

  return null;
};

export const getFeeRevenueForTimeframe = (
  p: CanonicalPool,
  tf: Timeframe,
  tfVol: number | null,
): number | null => {
  if (tf === '24h' && p.fees24hUsd !== null && p.fees24hUsd !== undefined) {
    return p.fees24hUsd;
  }
  if (tfVol === null || tfVol < 0) {
    return 0;
  }
  if (tfVol === 0) return 0;

  const hasHook = Boolean(p.hooks && !/^0x0{40}$/i.test(p.hooks));
  const isDyn =
    p.fee === 0x800000 ||
    p.effectiveFee === 0x800000 ||
    Boolean(p.warnings?.includes('DYNAMIC_FEE')) ||
    Boolean(p.labels?.includes('DYNAMIC_FEE')) ||
    (hasHook && (p.effectiveFee === 0 || p.fee === 0 || p.fee === 0x800000));
  const feeRate =
    p.effectiveFee > 0 && p.effectiveFee <= 1_000_000
      ? p.effectiveFee / 1_000_000
      : (p.launchpad === 'Pons' || p.hooks?.toLowerCase() === '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044')
        ? 0.01
        : p.launchpad
          ? ((p.launchpad === 'RWA' || p.launchpad === 'PAIR RWA') ? 0.0025 : 0.01)
          : (isDyn || hasHook)
            ? 0.003
            : p.feePct
              ? p.feePct / 100
              : (p.fee > 0 && p.fee <= 1_000_000 ? p.fee / 1_000_000 : 0);

  const fees = tfVol * feeRate;
  return Number.isFinite(fees) && fees >= 0 ? fees : 0;
};

export const getEstimatedAprForTimeframe = (
  p: CanonicalPool,
  tf: Timeframe,
  tfFees: number | null,
): number | null => {
  if (tf === '24h' && p.feeAprPct !== null && p.feeAprPct !== undefined) {
    return p.feeAprPct;
  }
  const effectiveLiq = p.discoverLiquidityUsd ?? p.externalLiquidityUsd ?? p.tvlUsd ?? 0;
  if (effectiveLiq <= 0) {
    return null;
  }
  if (tfFees === null || tfFees <= 0) {
    return 0;
  }

  // Pool age resolution for young pools
  const rawAge = p.poolCreatedAt ?? p.createdAt;
  const ageMs = rawAge ? (rawAge < 1e11 ? rawAge * 1000 : rawAge) : null;
  const poolAgeHours = ageMs ? Math.max(0.05, (Date.now() - ageMs) / 3600_000) : 24;

  // Annualization multiplier based on the window length and pool lifespan
  const multiplier =
    tf === '5m'
      ? 365 * 288
      : tf === '1h'
        ? 365 * 24
        : tf === '6h'
          ? (poolAgeHours < 6 ? (365 * 24) / Math.max(0.5, poolAgeHours) : 365 * 4)
          : (poolAgeHours < 24 ? (365 * 24) / Math.max(0.5, poolAgeHours) : 365);
  const annualizedFees = tfFees * multiplier;
  const apr = (annualizedFees / effectiveLiq) * 100;
  return Number.isFinite(apr) && apr >= 0 ? apr : 0;
};

export const getTvlChangeForTimeframe = (
  raw: CanonicalPool,
  timeframe: Timeframe,
): number | null => {
  if (timeframe === '5m') return raw.tvlChange5m ?? raw.tvlChange?.m5 ?? null;
  if (timeframe === '1h') return raw.tvlChange1h ?? raw.tvlChange?.h1 ?? null;
  if (timeframe === '6h') return raw.tvlChange6h ?? raw.tvlChange?.h6 ?? null;
  if (timeframe === '24h') return raw.tvlChange24h ?? raw.tvlChange?.h24 ?? null;
  return null;
};

export const getVolumeChangeForTimeframe = (
  p: CanonicalPool,
  tf: Timeframe,
): number | null => {
  // 1. If genuine prior-period volume change is provided by data feeds or projections, prioritize it
  const rawChange =
    (p as any)?.volumeChange?.[tf] ??
    (p as any)?.[`volumeChange${tf}`] ??
    (p as any)?.[`volumeChange${tf}Pct`];

  if (rawChange !== undefined && rawChange !== null && Number.isFinite(rawChange)) {
    return Number(rawChange);
  }

  const vTf = getVolumeForTimeframe(p, tf);
  if (vTf === null || vTf === undefined) return null;

  const v24 = p.volume24hUsd ?? p.volumeTimeframes?.h24 ?? null;
  const v5m = p.volume5mUsd ?? p.volumeTimeframes?.m5 ?? 0;
  const v1h = p.volume1hUsd ?? p.volumeTimeframes?.h1 ?? 0;
  const v6h = p.volume6hUsd ?? p.volumeTimeframes?.h6 ?? 0;
  const total24h = v24 !== null && v24 > 0 ? v24 : Math.max(v6h, v1h, v5m);

  if (vTf === 0 && total24h === 0) return 0;

  // Pool age resolution
  const rawAge = p.poolCreatedAt ?? p.createdAt;
  const ageMs = rawAge ? (rawAge < 1e11 ? rawAge * 1000 : rawAge) : null;
  const poolAgeHours = ageMs ? Math.max(0.05, (Date.now() - ageMs) / 3600_000) : 24;

  let pctResult: number | null = null;

  if (tf === '5m') {
    // Current 5m vs preceding 55m average (from 1h window)
    if (v1h > v5m) {
      const priorVol = v1h - v5m;
      const priorPace5m = priorVol / 11; // 55 mins = 11 intervals of 5m
      if (priorPace5m > 0) {
        pctResult = ((v5m - priorPace5m) / priorPace5m) * 100;
      }
    } else if (poolAgeHours < 0.2) {
      // New pool (<12m old) where all volume is in the first 5m slot: baseline established
      pctResult = 0;
    } else if (total24h > v5m && poolAgeHours >= 0.5) {
      const activeMinutes = Math.min(1440, poolAgeHours * 60);
      const priorMinutes = Math.max(5, activeMinutes - 5);
      const priorPace5m = ((total24h - v5m) / priorMinutes) * 5;
      if (priorPace5m > 0) {
        pctResult = ((v5m - priorPace5m) / priorPace5m) * 100;
      }
    } else {
      pctResult = 0;
    }
  } else if (tf === '1h') {
    // Current 1h vs preceding 5h average (from 6h window)
    if (v6h > v1h) {
      const priorVol = v6h - v1h;
      const priorPace1h = priorVol / 5;
      if (priorPace1h > 0) {
        pctResult = ((v1h - priorPace1h) / priorPace1h) * 100;
      }
    } else if (poolAgeHours <= 1.05) {
      // Pool is in its first hour of life: baseline established, NOT +2300%
      pctResult = 0;
    } else if (total24h > v1h) {
      const effectiveHours = Math.min(24, poolAgeHours);
      const priorHours = Math.max(1, effectiveHours - 1);
      const priorPace1h = (total24h - v1h) / priorHours;
      if (priorPace1h > 0) {
        pctResult = ((v1h - priorPace1h) / priorPace1h) * 100;
      }
    } else {
      pctResult = 0;
    }
  } else if (tf === '6h') {
    // Current 6h vs preceding 18h average (from 24h window)
    if (total24h > v6h) {
      const effectiveHours = Math.min(24, poolAgeHours);
      if (effectiveHours > 6) {
        const priorHours = effectiveHours - 6;
        const priorVol = total24h - v6h;
        const priorPace6h = (priorVol / priorHours) * 6;
        if (priorPace6h > 0) {
          pctResult = ((v6h - priorPace6h) / priorPace6h) * 100;
        }
      } else {
        pctResult = 0;
      }
    } else if (poolAgeHours <= 6.05) {
      pctResult = 0;
    } else {
      pctResult = 0;
    }
  } else if (tf === '24h') {
    // 24h timeframe:
    // If pool is young (< 24h old), compare recent hourly momentum against lifetime hourly average
    if (poolAgeHours < 24) {
      const effectiveHours = Math.max(0.5, poolAgeHours);
      const lifetimeHourlyPace = total24h / effectiveHours;
      const recentHourlyPace = v1h > 0 ? v1h : (v6h > 0 ? v6h / Math.min(6, effectiveHours) : lifetimeHourlyPace);
      if (lifetimeHourlyPace > 0 && Math.abs(recentHourlyPace - lifetimeHourlyPace) > 0.001) {
        pctResult = ((recentHourlyPace - lifetimeHourlyPace) / lifetimeHourlyPace) * 100;
      } else {
        pctResult = 0;
      }
    } else {
      // Mature pool (>= 24h old): compare recent 6h pace vs preceding 18h pace
      if (v6h > 0 && total24h > v6h) {
        const prior18h = total24h - v6h;
        const recentPace = v6h / 6;
        const priorPace = prior18h / 18;
        if (priorPace > 0) {
          pctResult = ((recentPace - priorPace) / priorPace) * 100;
        }
      } else if (v1h > 0 && total24h > 0) {
        const avgHourly = total24h / 24;
        if (avgHourly > 0) {
          pctResult = ((v1h - avgHourly) / avgHourly) * 100;
        }
      } else if (p.txns?.h24) {
        const { buys, sells } = p.txns.h24;
        const total = buys + sells;
        if (total > 0) {
          pctResult = ((buys - sells) / total) * 100;
        }
      }
      if (pctResult === null) {
        pctResult = 0;
      }
    }
  }

  if (pctResult !== null && Number.isFinite(pctResult)) {
    // Clamp extreme division-by-near-zero artifacts to ±9,999%
    return Math.max(-100, Math.min(9999, pctResult));
  }

  return 0;
};

export const toDiscoveredPool = (raw: CanonicalPool, timeframe: Timeframe): DiscoveredPool => {
  const tfVol = getVolumeForTimeframe(raw, timeframe);
  const tfPriceChange = getPriceChangeForTimeframe(raw, timeframe);
  const tfVolumeChange = getVolumeChangeForTimeframe(raw, timeframe);
  const tfTvlChange = getTvlChangeForTimeframe(raw, timeframe);
  const tfFees = getFeeRevenueForTimeframe(raw, timeframe, tfVol);
  const tfApr = getEstimatedAprForTimeframe(raw, timeframe, tfFees);

  const effectiveLiq = raw.discoverLiquidityUsd ?? raw.externalLiquidityUsd ?? raw.tvlUsd ?? 0;
  const volToTvl =
    effectiveLiq > 0 && tfVol !== null && tfVol >= 0
      ? tfVol / effectiveLiq
      : null;

  const txnsForTf =
    timeframe === '5m'
      ? raw.txns?.m5
      : timeframe === '1h'
        ? raw.txns?.h1
        : timeframe === '6h'
          ? raw.txns?.h6
          : (raw.txns?.h24 ?? raw.txns24h ?? null);

  const isConcentrated = raw.version === 'v3' || raw.version === 'v4';

  const hookAddress = raw.hooks || '';
  const hasHook = Boolean(hookAddress && !/^0x0{40}$/i.test(hookAddress));
  const isDynamicFee =
    raw.fee === 0x800000 ||
    raw.effectiveFee === 0x800000 ||
    Boolean(raw.warnings?.includes('DYNAMIC_FEE')) ||
    Boolean(raw.labels?.includes('DYNAMIC_FEE')) ||
    (hasHook && (raw.effectiveFee === 0 || raw.fee === 0 || raw.fee === 0x800000));

  const feeTierFormatted =
    isDynamicFee && (raw.effectiveFee === 0 || raw.effectiveFee === 0x800000 || (raw.fee === 0 && !raw.launchpad))
      ? '0.00%'
      : formatFeeTier(raw.effectiveFee, hasHook);

  return {
    id: raw.id,
    canonicalId: raw.canonicalId,
    raw,
    poolIdentity: {
      token0: {
        address: raw.token.address,
        symbol: raw.token.symbol,
        name: raw.token.name,
        decimals: raw.token.decimals,
        logoUrl: (raw.token as any)?.logoUrl ?? (raw.token as any)?.logoURI ?? null,
      },
      token1: {
        address: raw.quote.address,
        symbol: raw.quote.symbol,
        name: raw.quote.name,
        decimals: raw.quote.decimals,
        logoUrl: (raw.quote as any)?.logoUrl ?? (raw.quote as any)?.logoURI ?? null,
      },
      protocol: raw.protocol || raw.dexId || 'uniswap',
      protocolVersion: raw.version,
      dexId: raw.dexId,
      poolAddress: raw.pairAddress || raw.id,
      id: raw.id,
      feeTier: raw.effectiveFee,
      feeTierFormatted,
      tickSpacing: raw.tickSpacing,
      binStepPct: raw.binStepPct ?? null,
      currentTick: raw.tick ?? null,
      hooks: raw.hooks,
      hasHook,
      launchpad: raw.launchpad ?? null,
      tokenOrigin: raw.tokenOrigin ?? null,
      isDynamicFee,
    },
    market: {
      marketCap: raw.marketCap ?? null,
      fdv:
        raw.totalSupply && raw.totalSupply > 0 && raw.priceUsd && raw.priceUsd > 0
          ? raw.totalSupply * raw.priceUsd
          : (raw.fdv ?? null),
      poolAgeMs: (raw.poolCreatedAt ?? raw.createdAt) ? (((raw.poolCreatedAt ?? raw.createdAt)! < 1e11) ? (raw.poolCreatedAt ?? raw.createdAt)! * 1000 : (raw.poolCreatedAt ?? raw.createdAt)!) : null,
      tokenAgeMs: raw.tokenCreatedAt ? (raw.tokenCreatedAt < 1e11 ? raw.tokenCreatedAt * 1000 : raw.tokenCreatedAt) : null,
      priceUsd: raw.priceUsd,
      priceQuote: raw.priceNow,
      quoteSymbol: raw.quote.symbol,
      priceChangePct: tfPriceChange,
      timeframe,
    },
    liquidity: {
      tvlUsd: raw.tvlUsd ?? raw.discoverLiquidityUsd ?? raw.externalLiquidityUsd ?? null,
      activeTvlUsd: (raw as any).activeTvlUsd ?? null,
      activeLiquidityPercentage: null,
      netLiquidityFlowUsd: null,
      tvlChangePct: tfTvlChange,
      isConcentrated,
      liquiditySource: raw.liquiditySource ?? null,
      bottleneckDepthUsd: raw.execution?.bottleneckUsd1Pct ?? raw.bottleneckLiquidityUsd ?? null,
      depthToken0Usd: raw.execution?.token0UsdDepth1Pct ?? raw.depthToken0Usd1Pct ?? null,
      depthToken1Usd: raw.execution?.token1UsdDepth1Pct ?? raw.depthToken1Usd1Pct ?? null,
      executionStatus: raw.execution?.status ?? raw.executionStatus ?? 'UNAVAILABLE',
      executionModel: raw.execution?.model ?? raw.executionModel ?? 'STANDARD_CLMM',
      isDepthFresh: raw.execution?.isFresh ?? raw.isDepthFresh ?? false,
    },
    activity: {
      volumeUsd: tfVol,
      volumeChangePct: tfVolumeChange,
      volumeToTvl: volToTvl,
      volumeToActiveTvl: null,
      swapsCount: txnsForTf ? (txnsForTf.buys ?? 0) + (txnsForTf.sells ?? 0) : null,
      buysCount: txnsForTf?.buys ?? null,
      sellsCount: txnsForTf?.sells ?? null,
      traders: null,
      makers: null,
    },
    yield: {
      feeRevenueUsd: tfFees,
      feeToTvl: effectiveLiq > 0 && tfFees !== null ? tfFees / effectiveLiq : null,
      feeToActiveTvl: null,
      estimatedApr: tfApr,
    },
    risk: {
      volatility: null,
      holderConcentration: null,
      tokenRiskFlags: raw.warnings ?? [],
      warnings: raw.warnings ?? [],
    },
  };
};

/**
 * Generates an array of page numbers and ellipsis strings for pagination UI.
 * Always caps the visible items at 7 to prevent horizontal layout blowout.
 * Example outputs:
 * - 5 pages, current 1: [1, 2, 3, 4, 5]
 * - 10 pages, current 1: [1, 2, 3, 4, 5, '...', 10]
 * - 10 pages, current 6: [1, '...', 5, 6, 7, '...', 10]
 * - 10 pages, current 9: [1, '...', 6, 7, 8, 9, 10]
 */
export function generatePagination(currentPage: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 1) return [1];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const safeCurrent = Math.max(1, Math.min(currentPage, totalPages));

  // Near the start: 1, 2, 3, 4, 5, ..., totalPages
  if (safeCurrent <= 4) {
    return [1, 2, 3, 4, 5, '...', totalPages];
  }

  // Near the end: 1, ..., totalPages-4, totalPages-3, totalPages-2, totalPages-1, totalPages
  if (safeCurrent >= totalPages - 3) {
    return [
      1,
      '...',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  // Middle: 1, ..., safeCurrent-1, safeCurrent, safeCurrent+1, ..., totalPages
  return [1, '...', safeCurrent - 1, safeCurrent, safeCurrent + 1, '...', totalPages];
}
