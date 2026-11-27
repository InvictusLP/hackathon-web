/**
 * Standard Financial Metric Data Provenance Model.
 * Provides explicit traceability for every financial metric across Discover and Workstation.
 */

export type ProvenanceSource =
  | 'DIRECT_ONCHAIN'
  | 'INTERNAL_ONCHAIN_PROJECTION'
  | 'DEXSCREENER'
  | 'COINGECKO'
  | 'GECKOTERMINAL'
  | 'OTHER_EXTERNAL'
  | 'DERIVED_CALCULATED'
  | 'DERIVED_FROM_DIRECT_ONCHAIN'
  | 'DERIVED_FROM_INTERNAL_ONCHAIN'
  | 'DERIVED_FROM_DEXSCREENER'
  | 'DERIVED_FROM_COINGECKO'
  | 'DERIVED_MIXED'
  | 'STATIC'
  | 'UNKNOWN';

export interface MetricProvenance {
  source: ProvenanceSource;
  upstreamSource?: ProvenanceSource | null;
  /** Timestamp in epoch ms when the upstream authority observed the value. Null if unknown. */
  sourceObservedAt: number | null;
  /** Timestamp in epoch ms when Invictus fetched or calculated the value. */
  sourceFetchedAt: number;
  /** Timestamp in epoch ms of last confirmed successful refresh. */
  lastSuccessfulRefreshAt: number | null;
  /** EVM block number if read directly or projected from chain state. */
  blockNumber: string | null;
  /** 0 = primary source, 1 = secondary fallback, 2 = tertiary fallback */
  fallbackLevel: number;
  /** Whether the value exceeds the staleness threshold for its category. */
  stale: boolean;
}

export interface DetailedFinancialProvenance {
  priceQuote?: MetricProvenance;
  priceUsd?: MetricProvenance;
  tvl?: MetricProvenance;
  liquidityDepthWindow?: MetricProvenance;
  volume24h?: MetricProvenance;
  volume5m?: MetricProvenance;
  volume1h?: MetricProvenance;
  volume6h?: MetricProvenance;
  priceChange24h?: MetricProvenance;
  txns24h?: MetricProvenance;
  marketCap?: MetricProvenance;
  fdv?: MetricProvenance;
  grossFees24h?: MetricProvenance;
  grossFeeApr?: MetricProvenance;
  lpNetFees24h?: MetricProvenance;
  lpNetFeeApr?: MetricProvenance;
  bins?: MetricProvenance;
  candlesMacro?: MetricProvenance;
  candlesSubMinute?: MetricProvenance;
}
