/** Read-only wire model shared by Discover and global Search. Trading keeps its bigint Pool domain model. */
export interface DirectoryToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string | null;
}

export interface TimeframeMetrics<T> {
  m5?: T;
  h1?: T;
  h6?: T;
  h24?: T;
}

export interface MetricProvenance<TSource = string> {
  source: TSource;
  updatedAt: number;
  blockNumber?: string | null;
  stateVersion?: number | null;
}

export type ExecutionStatus = 'READY' | 'STALE' | 'PENDING' | 'REQUIRES_SIMULATION' | 'UNSUPPORTED' | 'UNAVAILABLE';

export interface PoolIdentityData {
  canonicalId: string;
  chainId: number;
  deploymentId: string;
  protocol: string;
  version: 'v3' | 'v4' | string;
  poolId: string;
}

export interface PoolExecutionData {
  model?: string | null;
  status?: ExecutionStatus;
  profile?: string | null;
  token0UsdDepth1Pct?: number | null;
  token1UsdDepth1Pct?: number | null;
  token0AmountDepth1Pct?: number | null;
  token1AmountDepth1Pct?: number | null;
  bottleneckUsd1Pct?: number | null;
  computedFromStateVersion?: number | null;
  isFresh?: boolean;
}

/**
 * Domain A: Pool Identity (Immutable)
 * Source of truth: Factory / PoolManager initialization events
 */
export interface CanonicalPoolIdentity {
  canonicalId: string;
  chainId: number;
  protocol: string;
  id: string;
  pairAddress: string;
  version: 'v3' | 'v4';
  dexId: string;
  token: DirectoryToken;
  quote: DirectoryToken;
  token0: string;
  token1: string;
  quoteIsToken0: boolean;
  quoteIsNative: boolean;
  verification: 'contract-identified';
  createdAt: number | null;
  poolCreatedAt?: number | null;
  tokenCreatedAt: number | null;
  tokenOrigin?: string | null;
  launchpad?: string | null;
}

/**
 * Domain B: Protocol Configuration
 * Source of truth: PoolKey parameters & deployment bytecode
 */
export interface CanonicalPoolConfig {
  fee: number;
  effectiveFee: number;
  feePct: number;
  tickSpacing: number;
  binStepPct: number;
  hooks: string;
  hooksAddress?: string | null;
  isDynamicFee?: boolean | null;
  poolKeyFeeMode?: 'STATIC' | 'DYNAMIC' | 'INVALID' | null;
  executionModel?: 'STANDARD_CLMM' | 'STANDARD_CLMM_DYNAMIC_FEE' | 'HOOKED_CLMM_ANALYTICALLY_SAFE' | 'HOOKED_REQUIRES_SIMULATION' | 'UNSUPPORTED_EXECUTION_MODEL' | string | null;
}

/**
 * Domain C: Current On-Chain State
 * Source of truth: Pool slot0, active liquidity, and event logs
 */
export interface CanonicalPoolState {
  tick?: number | null;
  sqrtPriceX96?: string | null;
  activeLiquidity?: string | null;
  currentLpFeePips?: number | null;
  poolState?: string | null;
  poolStateVersion?: number | null;
  stateVersion?: number | null;
  depthComputedFromStateVersion?: number | null;
  isDepthFresh?: boolean;
  blockNumber: string | null;
  stateUpdatedAt: number;
}

/**
 * Domain D: Valuation Snapshot
 * Source of truth: Canonical pricing graph, token quote profiles, reserve accounting
 */
export interface PoolValuationSnapshot {
  priceNow: number | null;
  priceUsd: number | null;
  tvlUsd: number | null;
  onchainTvlUsd?: number | null;
  marketCap: number | null;
  fdv: number | null;
  totalSupply?: number | null;
  reserves?: {
    token: number;
    quote: number;
    tokenUsd: number;
    quoteUsd: number;
  } | null;
  tvlUpdatedAt: number | null;
  marketCapUpdatedAt: number | null;
  fdvUpdatedAt: number | null;
}

/**
 * Domain E: Execution Snapshot
 * Source of truth: Tick-based CLMM directional depth traversal or V4Quoter simulation
 */
export interface PoolExecutionSnapshot {
  depthToken0Usd1Pct?: number | null;
  depthToken1Usd1Pct?: number | null;
  depthToken0Amount1Pct?: number | null;
  depthToken1Amount1Pct?: number | null;
  spotMoveToken0Usd1Pct?: number | null;
  spotMoveToken1Usd1Pct?: number | null;
  bottleneckLiquidityUsd?: number | null;
  executableLiquidityUsd?: number | null;
  executionStatus?: ExecutionStatus;
  executionProfile?: string | null;
  lastDepthAt?: string | Date | null;
}

/**
 * Domain F: Historical Analytics
 * Source of truth: Swap events, liquidity events, rolling time-window projection engine
 */
export interface PoolAnalyticsSnapshot {
  volume24hUsd: number | null;
  volume6hUsd?: number | null;
  volume1hUsd?: number | null;
  volume5mUsd?: number | null;
  priceChange5m?: number | null;
  priceChange1h?: number | null;
  priceChange6h?: number | null;
  priceChange24h?: number | null;
  tvlChange5m?: number | null;
  tvlChange1h?: number | null;
  tvlChange6h?: number | null;
  tvlChange24h?: number | null;
  volumeTimeframes?: TimeframeMetrics<number> | null;
  priceChange?: TimeframeMetrics<number> | null;
  tvlChange?: TimeframeMetrics<number> | null;
  txns?: TimeframeMetrics<{ buys: number; sells: number }> | null;
  txns24h?: { buys: number; sells: number } | null;
  lastSwapDirection?: 'up' | 'down' | null;
  lastSwapAt?: number | null;
  fees24hUsd: number | null;
  feeAprPct: number | null;
  grossFees24hUsd?: number | null;
  grossFeeAprPct?: number | null;
  lpNetFees24hUsd?: number | null;
  lpNetFeeAprPct?: number | null;
  swaps24h?: number | null;
  traders24h?: number | null;
  totalLps?: number | null;
  newLps24h?: number | null;
  positionsCreated?: number | null;
  openPositions?: number | null;
  netDeposits24hUsd?: number | null;
  volToTvlRatio: number | null;
  analyticsUpdatedAt?: number | null;
  volumeUpdatedAt?: number | null;
}

/**
 * Domain G: Discovery & Product Projection
 * Source of truth: Directory ranking engine and product policy flags
 */
export interface PoolDiscoveryProjection {
  topScore?: number | null;
  topScore5m?: number | null;
  topScore1h?: number | null;
  topScore6h?: number | null;
  topScore24h?: number | null;
  trendingScore?: number | null;
  trendingScore5m?: number | null;
  trendingScore1h?: number | null;
  trendingScore6h?: number | null;
  trendingScore24h?: number | null;
  discoverLiquidityUsd?: number | null;
  policyFlags?: string[] | null;
  labels: string[];
  warnings: string[];
  rankUpdatedAt?: number | null;
}

/**
 * Domain H: External Market Enrichment
 * Source of truth: DexScreener & CoinGecko ingest workers
 */
export interface PoolExternalEnrichment {
  externalLiquidityUsd?: number | null;
  externalLiquiditySource?: 'coingecko' | 'dexscreener' | null;
  liquiditySource?: 'coingecko' | 'dexscreener' | 'onchain' | 'unavailable';
  liquidityUpdatedAt?: number | null;
}

/**
 * Composite CanonicalPool wire model.
 * Composes domain models while preserving flat field access for backward compatibility.
 */
export interface CanonicalPool
  extends CanonicalPoolIdentity,
    CanonicalPoolConfig,
    CanonicalPoolState,
    PoolValuationSnapshot,
    PoolExecutionSnapshot,
    PoolAnalyticsSnapshot,
    PoolDiscoveryProjection,
    PoolExternalEnrichment {
  identity?: PoolIdentityData;
  execution?: PoolExecutionData;
  executionStatus?: ExecutionStatus;
  updatedAt: number;
  indexedAt: number | null;
  provenance: {
    price: 'onchain';
    quoteUsd: 'stable-peg' | 'onchain' | 'dexscreener-fallback' | 'unavailable';
    tvl: 'onchain-balances' | 'onchain-ticks' | 'unavailable';
    volume: 'dexscreener' | 'unavailable';
    marketCap: 'onchain' | 'dexscreener' | 'coingecko' | 'unavailable';
    fees: 'estimated-volume-times-current-fee';
  };
}

export interface PoolPage {
  pools: CanonicalPool[];
  nextCursor: string | null;
  snapshot: string;
  updatedAt: number;
  stale: boolean;
  total?: number | null;
  page?: number | null;
}

export type PoolSort =
  | 'tvl'
  | 'volume'
  | 'volume5m'
  | 'volume1h'
  | 'volume6h'
  | 'price'
  | 'mcap'
  | 'age'
  | 'fee'
  | 'apr'
  | 'binstep'
  | 'spacing'
  | 'tick'
  | 'topScore'
  | 'trendingScore';

export const toBlockBigInt = (val: unknown): bigint | null => {
  if (val === null || val === undefined || val === '') return null;
  try {
    return BigInt(val as string | number | bigint | boolean);
  } catch {
    return null;
  }
};

/** Merge independent observations without making an older field appear freshly fetched. */
export const mergePoolObservation = (
  old: CanonicalPool | undefined,
  incoming: CanonicalPool,
): CanonicalPool => {
  const p: CanonicalPool = {
    ...incoming,
    provenance: {
      price: 'onchain',
      fees: 'estimated-volume-times-current-fee',
      tvl: incoming.provenance?.tvl ?? 'unavailable',
      volume: incoming.provenance?.volume ?? 'unavailable',
      marketCap: incoming.provenance?.marketCap ?? 'unavailable',
      quoteUsd: incoming.provenance?.quoteUsd ?? 'unavailable',
    },
  };
  if (old) {
    // RPC completion order is not chain order. An unpinned discovery observation
    // also cannot displace state already read at an identified block.
    const oldBlock = toBlockBigInt(old.blockNumber);
    const newBlock = toBlockBigInt(p.blockNumber);
    const oldVersion = old.poolStateVersion ?? old.stateVersion ?? null;
    const newVersion = p.poolStateVersion ?? p.stateVersion ?? null;
    const olderVersion = oldVersion !== null && newVersion !== null && oldVersion > newVersion;
    const newerVersion = oldVersion !== null && newVersion !== null && newVersion > oldVersion;
    const keepState =
      olderVersion
        ? true
        : newerVersion
        ? false
        : oldBlock !== null && newBlock === null
        ? true
        : oldBlock !== null && newBlock !== null && oldBlock !== newBlock
          ? oldBlock > newBlock
          : old.stateUpdatedAt > p.stateUpdatedAt;
    if (keepState) {
      p.priceNow = old.priceNow;
      p.priceUsd = old.priceUsd;
      p.tick = old.tick;
      p.sqrtPriceX96 = old.sqrtPriceX96 ?? p.sqrtPriceX96;
      p.effectiveFee = old.effectiveFee;
      p.feePct = old.feePct;
      p.stateUpdatedAt = old.stateUpdatedAt;
      p.blockNumber = old.blockNumber;
      p.poolStateVersion = old.poolStateVersion;
      p.stateVersion = old.stateVersion;
      if (old.provenance?.quoteUsd) p.provenance.quoteUsd = old.provenance.quoteUsd;
    } else {
      p.tick ??= old.tick;
      p.sqrtPriceX96 ??= old.sqrtPriceX96;
    }

    // Preserve critical on-chain identity and supply/reserve invariants from old if incoming lacks them
    p.token0 = p.token0 || old.token0;
    p.token1 = p.token1 || old.token1;
    if (p.quoteIsToken0 === undefined) p.quoteIsToken0 = old.quoteIsToken0;
    if (p.quoteIsNative === undefined) p.quoteIsNative = old.quoteIsNative;
    p.totalSupply ??= old.totalSupply;
    p.reserves ??= old.reserves;
    p.fees24hUsd ??= old.fees24hUsd;
    p.feeAprPct ??= old.feeAprPct;

    if ((p.tvlUsd === null || (old.tvlUpdatedAt ?? 0) > (p.tvlUpdatedAt ?? 0)) && old.tvlUsd !== null) {
      p.tvlUsd = old.tvlUsd;
      p.tvlUpdatedAt = old.tvlUpdatedAt;
      if (old.provenance?.tvl) p.provenance.tvl = old.provenance.tvl;
    }
    if (p.onchainTvlUsd == null && old.onchainTvlUsd != null) {
      p.onchainTvlUsd = old.onchainTvlUsd;
    }
    if (p.externalLiquidityUsd == null && old.externalLiquidityUsd != null) {
      p.externalLiquidityUsd = old.externalLiquidityUsd;
      p.liquidityUpdatedAt = old.liquidityUpdatedAt;
    }
    if (p.discoverLiquidityUsd == null && old.discoverLiquidityUsd != null) {
      p.discoverLiquidityUsd = old.discoverLiquidityUsd;
      p.liquiditySource = old.liquiditySource;
    }
    if (p.topScore == null && old.topScore != null) {
      p.topScore = old.topScore;
      p.rankUpdatedAt = old.rankUpdatedAt;
    }
    if (p.trendingScore5m == null && old.trendingScore5m != null) {
      p.trendingScore5m = old.trendingScore5m;
    }
    if (p.trendingScore1h == null && old.trendingScore1h != null) {
      p.trendingScore1h = old.trendingScore1h;
    }
    if (p.trendingScore6h == null && old.trendingScore6h != null) {
      p.trendingScore6h = old.trendingScore6h;
    }
    if (p.analyticsUpdatedAt == null && old.analyticsUpdatedAt != null) {
      p.analyticsUpdatedAt = old.analyticsUpdatedAt;
    }
    for (const [field, timestamp] of [
      ['volume24hUsd', 'volumeUpdatedAt'],
      ['marketCap', 'marketCapUpdatedAt'],
      ['fdv', 'fdvUpdatedAt'],
    ] as const) {
      const previousAt = old[timestamp] ?? old.indexedAt;
      const incomingAt = incoming[timestamp] ?? incoming.indexedAt;
      if (old[field] !== null && (p[field] === null || (previousAt ?? 0) > (incomingAt ?? 0))) {
        p[field] = old[field];
        p[timestamp] = previousAt;
        if (field === 'volume24hUsd' && old.provenance?.volume) p.provenance.volume = old.provenance.volume;
        if (field === 'marketCap' && old.provenance?.marketCap) p.provenance.marketCap = old.provenance.marketCap;
      } else p[timestamp] = p[field] === null ? null : incomingAt;
    }
    // Retain timeframe metrics if incoming is missing them
    if (p.volumeTimeframes == null && old.volumeTimeframes != null) {
      p.volumeTimeframes = old.volumeTimeframes;
      p.volume5mUsd = old.volume5mUsd;
      p.volume1hUsd = old.volume1hUsd;
      p.volume6hUsd = old.volume6hUsd;
    } else if (p.volumeTimeframes != null) {
      p.volume5mUsd = p.volumeTimeframes.m5 ?? null;
      p.volume1hUsd = p.volumeTimeframes.h1 ?? null;
      p.volume6hUsd = p.volumeTimeframes.h6 ?? null;
    }
    if (p.priceChange == null && old.priceChange != null) {
      p.priceChange = old.priceChange;
      p.priceChange5m = old.priceChange5m;
      p.priceChange1h = old.priceChange1h;
      p.priceChange6h = old.priceChange6h;
      p.priceChange24h = old.priceChange24h;
    } else if (p.priceChange != null) {
      p.priceChange5m = p.priceChange.m5 ?? null;
      p.priceChange1h = p.priceChange.h1 ?? null;
      p.priceChange6h = p.priceChange.h6 ?? null;
      p.priceChange24h = p.priceChange.h24 ?? null;
    }
    if (p.tvlChange == null && old.tvlChange != null) {
      p.tvlChange = old.tvlChange;
      p.tvlChange5m = old.tvlChange5m;
      p.tvlChange1h = old.tvlChange1h;
      p.tvlChange6h = old.tvlChange6h;
      p.tvlChange24h = old.tvlChange24h;
    } else if (p.tvlChange != null) {
      p.tvlChange5m = p.tvlChange.m5 ?? null;
      p.tvlChange1h = p.tvlChange.h1 ?? null;
      p.tvlChange6h = p.tvlChange.h6 ?? null;
      p.tvlChange24h = p.tvlChange.h24 ?? null;
    }
    if (p.txns == null && old.txns != null) {
      p.txns = old.txns;
    }
    if (p.txns24h == null && old.txns24h != null) {
      p.txns24h = old.txns24h;
    }
    p.lastSwapDirection ??= old.lastSwapDirection;
    p.lastSwapAt ??= old.lastSwapAt;
    p.createdAt ??= old.createdAt;
    p.poolCreatedAt ??= old.poolCreatedAt ?? old.createdAt;
    p.tokenCreatedAt ??= old.tokenCreatedAt;
    p.tokenOrigin ??= old.tokenOrigin;
    p.launchpad ??= old.launchpad;
    p.externalLiquiditySource ??= old.externalLiquiditySource;
    p.totalSupply ??= old.totalSupply;
    p.reserves ??= old.reserves;
    p.updatedAt = Math.max(old.updatedAt, incoming.updatedAt);
  }
  const times = [p.volumeUpdatedAt, p.marketCapUpdatedAt, p.fdvUpdatedAt].filter(
    (v): v is number => v !== null,
  );
  p.indexedAt = times.length ? Math.min(...times) : null;
  return derivePoolMetrics(p);
};

const metric = (value: number): number | null => (Number.isFinite(value) && value >= 0 ? value : null);

/** Current-fee estimate only: variable hooks and dynamic fees have no reliable daily estimate. */
export const estimatedPoolFees = (
  volume: number | null,
  fee: number,
  tvl: number | null,
  variable: boolean,
) => {
  const fees24hUsd =
    variable || volume === null || fee > 1_000_000 ? null : metric((volume * fee) / 1_000_000);
  const feeAprPct =
    fees24hUsd !== null && tvl !== null && tvl > 0 ? metric(((fees24hUsd * 365) / tvl) * 100) : null;
  return {
    fees24hUsd,
    feeAprPct,
    grossFees24hUsd: fees24hUsd,
    grossFeeAprPct: feeAprPct,
    lpNetFees24hUsd: null,
    lpNetFeeAprPct: null,
  };
};

export interface EffectiveFeeResolution {
  effectiveFee: number;
  feePct: number;
  isDynamic: boolean;
  hasHook: boolean;
  isUnresolvableVariable: boolean;
}

export const resolveEffectiveFee = (p: {
  fee?: number;
  effectiveFee?: number;
  hooks?: string;
  launchpad?: string | null;
  warnings?: string[];
  labels?: string[];
}): EffectiveFeeResolution => {
  const hasHook = Boolean(p.hooks && !/^0x0{40}$/i.test(p.hooks));
  const isDynamic =
    p.fee === 0x800000 ||
    p.effectiveFee === 0x800000 ||
    Boolean(p.warnings?.includes('DYNAMIC_FEE')) ||
    Boolean(p.labels?.includes('DYNAMIC_FEE')) ||
    (hasHook && (p.effectiveFee === 0 || p.fee === 0 || p.fee === 0x800000));

  let effectiveFee: number;
  let isUnresolvableVariable = false;

  if (p.effectiveFee !== undefined && p.effectiveFee > 0 && p.effectiveFee <= 1_000_000 && p.effectiveFee !== 0x800000) {
    effectiveFee = p.effectiveFee;
    if (hasHook || isDynamic) isUnresolvableVariable = true;
  } else if (p.launchpad === 'Pons' || p.hooks?.toLowerCase() === '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044') {
    effectiveFee = 10000;
  } else if (p.launchpad) {
    effectiveFee = (p.launchpad === 'RWA' || p.launchpad === 'PAIR RWA') ? 2500 : 10000;
  } else if (p.fee !== undefined && p.fee > 0 && p.fee <= 1_000_000 && p.fee !== 0x800000) {
    effectiveFee = p.fee;
    if (hasHook || isDynamic) isUnresolvableVariable = true;
  } else if (isDynamic || hasHook) {
    effectiveFee = 10000;
    isUnresolvableVariable = true;
  } else {
    effectiveFee = 0;
  }

  return {
    effectiveFee,
    feePct: effectiveFee / 10_000,
    isDynamic,
    hasHook,
    isUnresolvableVariable,
  };
};

export const derivePoolMetrics = (p: CanonicalPool): CanonicalPool => {
  const effectiveLiq = p.discoverLiquidityUsd ?? p.externalLiquidityUsd ?? p.tvlUsd;
  let source = p.liquiditySource;
  if (!source || source === 'unavailable') {
    if (p.externalLiquiditySource) {
      source = p.externalLiquiditySource;
    } else if (p.externalLiquidityUsd != null) {
      source = 'dexscreener';
    } else if (p.tvlUsd != null || p.onchainTvlUsd != null) {
      source = 'onchain';
    } else {
      source = 'unavailable';
    }
  }
  const feeRes = resolveEffectiveFee(p);
  const derivedFdv =
    p.totalSupply && p.totalSupply > 0 && p.priceUsd && p.priceUsd > 0
      ? metric(p.totalSupply * p.priceUsd)
      : null;
  const marketCap = p.marketCap ?? null;
  const fdv = derivedFdv ?? p.fdv ?? null;
  return {
    ...p,
    marketCap,
    fdv,
    effectiveFee: feeRes.effectiveFee,
    feePct: feeRes.feePct,
    poolCreatedAt: p.poolCreatedAt ?? p.createdAt,
    discoverLiquidityUsd: effectiveLiq,
    liquiditySource: source,
    ...estimatedPoolFees(
      p.volume24hUsd,
      feeRes.effectiveFee,
      effectiveLiq,
      feeRes.isUnresolvableVariable,
    ),
    volToTvlRatio:
      effectiveLiq !== null && effectiveLiq > 0 && p.volume24hUsd !== null ? metric(p.volume24hUsd / effectiveLiq) : null,
  };
};

export const poolObservationStale = (p: CanonicalPool, now = Date.now()): boolean =>
  now - p.stateUpdatedAt > 30_000 ||
  (p.tvlUpdatedAt !== null && now - p.tvlUpdatedAt > 120_000) ||
  (p.indexedAt !== null && now - p.indexedAt > 120_000);

/** Compact Discover wire DTO (Section 62). Omits scheduler state, debugging trees, and unused internals. */
export interface DiscoverPoolRowDTO {
  id: string;
  canonicalId: string;
  chainId: number;
  protocol: string;
  version: 'v3' | 'v4';
  dexId: string;
  token: DirectoryToken;
  quote: DirectoryToken;
  fee: number;
  effectiveFee: number;
  feePct: number;
  tickSpacing: number;
  binStepPct: number;
  hooks: string;
  labels: string[];
  warnings: string[];
  poolCreatedAt: number | null;
  tokenCreatedAt: number | null;
  launchpad?: string | null;
  tokenOrigin?: string | null;
  priceNow: number | null;
  priceUsd: number | null;
  discoverLiquidityUsd: number | null;
  externalLiquidityUsd?: number | null;
  liquiditySource?: 'coingecko' | 'dexscreener' | 'onchain' | 'unavailable';
  topScore?: number | null;
  trendingScore5m?: number | null;
  trendingScore1h?: number | null;
  trendingScore6h?: number | null;
  volume24hUsd: number | null;
  volume6hUsd?: number | null;
  volume1hUsd?: number | null;
  volume5mUsd?: number | null;
  priceChange5m?: number | null;
  priceChange1h?: number | null;
  priceChange6h?: number | null;
  priceChange24h?: number | null;
  tvlChange5m?: number | null;
  tvlChange1h?: number | null;
  tvlChange6h?: number | null;
  tvlChange24h?: number | null;
  tvlChange?: CanonicalPool['tvlChange'];
  marketCap: number | null;
  fdv: number | null;
  fees24hUsd: number | null;
  feeAprPct: number | null;
  txns?: CanonicalPool['txns'];
  token0?: string | null;
  token1?: string | null;
  quoteIsToken0?: boolean;
  quoteIsNative?: boolean;
  totalSupply?: number | null;
  reserves?: CanonicalPool['reserves'];
  volumeTimeframes?: CanonicalPool['volumeTimeframes'];
  updatedAt: number;
  stateUpdatedAt: number;
  blockNumber: string | null;
  indexedAt: number | null;
}

export const toDiscoverPoolRowDTO = (p: CanonicalPool): DiscoverPoolRowDTO => ({
  id: p.id,
  canonicalId: p.canonicalId,
  chainId: p.chainId,
  protocol: p.protocol,
  version: p.version,
  dexId: p.dexId,
  token: p.token,
  quote: p.quote,
  token0: p.token0,
  token1: p.token1,
  quoteIsToken0: p.quoteIsToken0,
  quoteIsNative: p.quoteIsNative,
  fee: p.fee,
  effectiveFee: p.effectiveFee,
  feePct: p.feePct,
  tickSpacing: p.tickSpacing,
  binStepPct: p.binStepPct,
  hooks: p.hooks,
  labels: p.labels,
  warnings: p.warnings,
  poolCreatedAt: p.poolCreatedAt ?? p.createdAt,
  tokenCreatedAt: p.tokenCreatedAt,
  launchpad: p.launchpad,
  tokenOrigin: p.tokenOrigin,
  priceNow: p.priceNow,
  priceUsd: p.priceUsd,
  discoverLiquidityUsd: p.discoverLiquidityUsd ?? p.externalLiquidityUsd ?? p.tvlUsd,
  externalLiquidityUsd: p.externalLiquidityUsd,
  liquiditySource: p.liquiditySource,
  topScore: p.topScore,
  trendingScore5m: p.trendingScore5m,
  trendingScore1h: p.trendingScore1h,
  trendingScore6h: p.trendingScore6h,
  volume24hUsd: p.volume24hUsd,
  volume6hUsd: p.volume6hUsd,
  volume1hUsd: p.volume1hUsd,
  volume5mUsd: p.volume5mUsd,
  volumeTimeframes: p.volumeTimeframes,
  priceChange5m: p.priceChange5m,
  priceChange1h: p.priceChange1h,
  priceChange6h: p.priceChange6h,
  priceChange24h: p.priceChange24h,
  tvlChange5m: p.tvlChange5m,
  tvlChange1h: p.tvlChange1h,
  tvlChange6h: p.tvlChange6h,
  tvlChange24h: p.tvlChange24h,
  tvlChange: p.tvlChange,
  marketCap: p.marketCap,
  fdv: p.fdv,
  totalSupply: p.totalSupply,
  reserves: p.reserves,
  fees24hUsd: p.fees24hUsd,
  feeAprPct: p.feeAprPct,
  txns: p.txns,
  updatedAt: p.updatedAt,
  stateUpdatedAt: p.stateUpdatedAt,
  blockNumber: p.blockNumber,
  indexedAt: p.indexedAt,
});

