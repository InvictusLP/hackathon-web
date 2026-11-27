export interface WebPosition {
  key: string;
  chainId?: number;
  version: 'v3' | 'v4';
  tokenId: string;
  symbol: string;
  quoteSymbol: string;
  feePct: number;
  tickSpacing?: number;
  poolId: string;
  tokenAddress: string;

  exists: boolean;
  inRange: boolean;
  status: string;
  /** How much of the range has converted into the token, 0 to 1. */
  filled: number;

  price: number;
  priceUsd: number;
  quoteUsd: number;
  priceLower: number;
  priceUpper: number;
  lowerPct: number;
  upperPct: number;
  toEntryPct: number;
  rangePos: number;
  entryPriceQuote?: number;
  initialLowerPct?: number;
  initialUpperPct?: number;
  initialPreset?: string;

  amountToken: number;
  amountQuote: number;
  feesToken: number;
  feesQuote: number;

  valueUsd: number;
  feesUsd: number;
  /** The pool's price is pinned at the tick limit: no liquidity on one side, the token valued at zero. */
  priceBroken: boolean;
  /** Fully diluted market cap at the range edges and now. Null when the supply cannot be read. */
  mcapLower: number | null;
  mcapNow: number | null;
  mcapUpper: number | null;
  feesClaimedUsd: number;
  totalUsd: number;
  depositUsd: number;
  pnlUsd: number;
  pnlPct: number;
  hasBasis: boolean;
  feeApr: number | null;

  ageMs: number;
  links: { chart: string; dexscreener: string; token: string; mint: string | null };
}

export interface Snapshot {
  at: number;
  todayKey?: string;
  tzOffsetMin?: number;
  polledAt: number;
  live: { connected: boolean; eventsPerMin: number };
  wallet: { address: string; eth: number; weth: number; usdg: number; liquidUsd: number } | null;
  wallets?: WalletRow[];
  ethUsd: number;
  /** The user's second currency for the main figures, null for USD only. */
  fx: { code: string; rate: number } | null;
  totals: {
    count: number;
    valueUsd: number;
    feesUsd: number;
    depositUsd: number;
    pnlUsd: number;
    pnlPct: number;
    realizedUsd: number;
    overallPnlUsd: number;
    /** Every fee the wallet's positions earned: closed, claimed, and still owed. */
    feesGeneratedUsd: number;
    noBasis: number;
    netWorthUsd: number;
    todayDeltaUsd: number | null;
    todayDeltaPct: number | null;
  };
  history: { day: string; totalUsd: number }[];
  pnlHistory: { day: string; pnlUsd: number }[];
  positions: WebPosition[];
}

export interface Bin {
  priceLower: number;
  priceUpper: number;
  usd: number;
  amountQuote: number;
  amountToken: number;
  mine: boolean;
}

export interface BinDetail {
  key: string;
  map: {
    state?: 'AVAILABLE' | 'EMPTY_IN_SELECTED_RANGE' | 'UNAVAILABLE' | 'ERROR';
    bins: Bin[];
    spotPrice: number;
    lower: number;
    upper: number;
    totalUsd?: number | null;
    maxUsd?: number | null;
    ticksFound?: number;
    error?: string | null;
  } | null;
  pool: { tvlUsd: number | null; volume24hUsd: number | null; exact: boolean };
}

export interface GasNow {
  /** What a unit of gas is expected to cost now. */
  gwei: number;
  baseGwei: number;
  tipGwei: number;
  maxGwei: number;
  openUsd: number;
  closeUsd: number;
  capUsd: number;
  at: number;
}

export interface WalletAsset {
  symbol: string;
  decimals: number;
  address?: string;
  amount: number;
  usd: number;
}

export interface WalletRow {
  address: string;
  label: string | null;
  imported: boolean;
  isActive: boolean;
  createdAt: number;
  ethBalance?: number;
  /** Open positions held by this wallet; absent on lists returned by writes. */
  openPositions?: number;
}

export interface WalletSummary {
  address: string;
  ethUsd: number;
  wallets: WalletRow[];
  assets: WalletAsset[];
  /** Tokens beyond ETH and the quote assets, worth at least $1. */
  tokens?: { symbol: string; address: string | null; amount: number; usd: number; chainId?: number }[];
  /** Everything in the wallet, tokens included. Null when pricing failed. */
  totalUsd?: number | null;
  /** Each enabled chain's own coins (Robinhood, Arc, BNB Chain). `assets` above is Robinhood's alone. */
  chains?: WalletChain[];
}

export interface WalletChain {
  chainId: number;
  badge: string;
  name: string;
  assets: WalletAsset[];
  totalUsd: number | null;
}

export interface Invite {
  username: string;
  note: string | null;
  invitedBy: number | null;
  createdAt: number;
  usedBy: number | null;
  usedAt: number | null;
}

export interface PoolResult {
  id: string;
  version: 'v3' | 'v4';
  protocol?: string;
  fee: number;
  tickSpacing: number;
  tick?: number | null;
  quote: string;
  quoteAddress?: string;
  quoteIsNative: boolean;
  priceTokenUsd: number;
  priceNow: number;
  tvlUsd: number | null;
  volume24hUsd: number | null;
  volume5mUsd?: number | null;
  volume1hUsd?: number | null;
  volume6hUsd?: number | null;
  priceChange5m?: number | null;
  priceChange1h?: number | null;
  priceChange24h?: number | null;
  volumeTimeframes?: { m5?: number; h1?: number; h6?: number; h24?: number } | null;
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number } | null;
  txns?: {
    m5?: { buys: number; sells: number };
    h1?: { buys: number; sells: number };
    h6?: { buys: number; sells: number };
    h24?: { buys: number; sells: number };
  } | null;
  /** Fully diluted: on-chain total supply at this pool's price. */
  mcapUsd: number | null;
  totalSupply?: number | null;
  feeAprPct?: number | null;
  /** How far one bin reaches, in percent. A range can only move in steps this size. */
  binStepPct: number;
  warnings: string[];
  blocked: boolean;
  createdAt?: number | null;
  poolCreatedAt?: number | null;
  tokenCreatedAt?: number | null;
}

export interface PoolSearch {
  /** True when the answer came from cache while a refresh runs behind it. */
  stale: boolean;
  token: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    createdAt?: number | null;
    tokenCreatedAt?: number | null;
    poolCreatedAt?: number | null;
  } | null;
  /** Lowercase id of the pool the search named, when it was a pool id rather than a token. */
  matchedPoolId?: string | null;
  pools: PoolResult[];
  error?: string | null;
  tokenCreatedAt?: number | null;
  poolCreatedAt?: number | null;
}

export interface RecommendedPoolItem {
  id: string;
  pairAddress: string;
  version: 'v3' | 'v4';
  protocol?: string;
  fee: number;
  feePct: number;
  tickSpacing: number;
  binStepPct: number;
  tick?: number | null;
  marketCap: number;
  createdAt: number | null;
  poolCreatedAt?: number | null;
  tokenCreatedAt?: number | null;
  token: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  };
  quote: {
    address: string;
    symbol: string;
    decimals: number;
  };
  priceNow: number;
  priceUsd: number;
  tvlUsd: number;
  volume24hUsd: number;
  volume5mUsd?: number | null;
  volume1hUsd?: number | null;
  volume6hUsd?: number | null;
  priceChange5m?: number | null;
  priceChange1h?: number | null;
  priceChange24h?: number | null;
  volumeTimeframes?: { m5?: number; h1?: number; h6?: number; h24?: number } | null;
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number } | null;
  feeAprPct: number;
  fees24hUsd: number;
  volToTvlRatio: number;
  dexId: string;
  labels: string[];
}

export interface RecommendedPoolsResponse {
  updatedAt: number;
  pools: RecommendedPoolItem[];
}

export type { CanonicalPool, DirectoryToken, PoolPage, PoolSort } from '../shared/pool-directory';
export type CachedPool = import('../shared/pool-directory').CanonicalPool;

export interface PublicReferral {
  code: string;
  link: string;
  totalReferred: number;
  activeReferred: number;
  rewardsLive: boolean;
  earnedUsd?: number;
  claimableUsd?: number;
  minClaimUsd?: number;
}

export interface SettingMeta {
  label: string;
  kind: 'int' | 'float' | 'bool' | 'string';
  min?: number;
  max?: number;
  hint: string;
  /** Named values for an int; the index is what is stored. */
  options?: string[];
}

/** customUrl is masked by the server and is never sent back as a URL. */
export interface RpcOverview {
  chainId: number;
  name: string;
  badge: string;
  defaultCount: number;
  customUrl: string | null;
}

export interface RpcProbe {
  ok: boolean;
  ms: number;
  error?: string;
}

export interface SettingsPayload {
  values: Record<string, number | boolean | string | null>;
  meta: Record<string, SettingMeta>;
}

export interface UserFeePatch {
  userId: number;
  exempt?: boolean;
  feeUsd?: number | null;
}

export interface AdminStats {
  feesMissed: number;
  feesMissedUsd: number;
  users: number;
  usersWithWallet: number;
  usersWithPosition: number;
  banned: number;
  new24h: number;
  new7d: number;
  active24h: number;
  active7d: number;
  active30d: number;
  positionsOpened: number;
  positionsClosed: number;
  positionsLive: number;
  volumeUsd: number;
  volumeEth: number;
  depositedUsd: number;
  feesUsd: number;
  realizedPnlUsd: number;
  txCount: number;
  referredUsers: number;
}

export interface AdminDay {
  day: string;
  volumeUsd: number;
  volumeEth: number;
  pnlUsd: number;
  opens: number;
  closes: number;
  /** What the platform charged: the open fee. */
  feesUsd: number;
  /** LP fees users' positions earned that day: claims, plus what each close swept. */
  feesGeneratedUsd: number;
  signups: number;
  activeUsers: number;
}

export interface AdminOverview {
  stats: AdminStats;
  daily: AdminDay[];
  tokens: { symbol: string; address: string; positions: number; live: number; depositedUsd: number }[];
}

export interface AdminUser {
  userId: number;
  username: string | null;
  address: string | null;
  status: string;
  isAdmin: boolean;
  feeExempt: boolean;
  createdAt: number;
  lastActionAt: number | null;
  positionsOpened: number;
  positionsLive: number;
  volumeUsd: number;
  volumeEth: number;
  realizedPnlUsd: number;
  feesPaidUsd: number;
  /** LP fees the user's positions earned: closed totals plus claims. Unclaimed fees are live-only. */
  feesGeneratedUsd: number;
  referrals: number;
  /** null = follows the platform price. */
  feeUsdOverride: number | null;
}

export interface AdminEvent {
  id: number;
  userId: number;
  username: string | null;
  kind: string;
  usd: number | null;
  txHash: string | null;
  at: number;
  meta: Record<string, unknown>;
}

export interface JobStep {
  jobId: string;
  kind: string;
  label: string;
  hash?: string;
  done?: boolean;
  error?: string;
  result?: unknown;
}

export interface PendingAction {
  id: string;
  kind: 'open' | 'close' | 'withdraw' | 'export';
  usd: number | null;
  summary: string;
  createdAt: number;
}

export interface TrackedTransaction {
  id: string;
  jobId: string;
  userId?: number;
  kind: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  label: string;
  hash?: string;
  poolId?: string;
  done: boolean;
  error?: string;
  createdAt: number;
  updatedAt?: number;
  steps: JobStep[];
  result?: unknown;
}

/** What every write route answers: it ran, or Telegram has to say yes first. */
export type ActionOutcome =
  | { status: 'running'; jobId: string }
  | { status: 'awaiting_approval'; actionId: string; summary: string };

export interface OpenPlan {
  /** What this account pays to open. 0 when fees are off or the account is exempt. */
  feeUsd: number;
  depositUsd: number;
  depositAsset: string;
  priceNow: number;
  priceLower: number;
  priceUpper: number;
  tickLower: number;
  tickUpper: number;
  gasUsd: number;
  gasOverLimit: boolean;
  approvals: string[];
  simulated: boolean;
  canFund: boolean;
  /** Present when the plan takes both sides: a range straddling spot, or an add. */
  pair?: {
    useQuote: number;
    useToken: number;
    leftQuote: number;
    leftToken: number;
    zap: { side: 'buy' | 'sell'; amountIn: number; expectedOut: number; route: string | null } | null;
  };
}

export interface PeriodStats {
  label: string;
  tradeCloses?: number;
  tradeWins?: number;
  bestTrade?: number | null;
  pnlUsd: number;
  volumeUsd: number;
  opens: number;
  closes: number;
  wins: number;
  best: number;
  worst: number;
  days: { day: string; pnlUsd: number; volumeUsd: number; opens: number; closes: number }[];
}

export interface DayStats {
  day: string;
  volumeUsd: number;
  volumeEth?: number;
  pnlUsd: number;
  netPnlUsd?: number;
  gasUsd?: number;
  feeChargedUsd?: number;
  opens: number;
  closes: number;
  feesPaidUsd: number;
  feesEarnedUsd?: number;
}

export interface ClosedTrade {
  key: string;
  pair: string;
  tokenAddress?: string;
  quoteKey?: string;
  quoteIsNative?: boolean;
  version: string;
  depositUsd: number;
  exitUsd: number;
  feesUsd: number;
  pnlUsd: number;
  pnlPct: number;
  feeChargedUsd?: number;
  gasUsd?: number;
  netPnlUsd?: number;
  netPnlPct?: number;
  heldMs: number;
  closedAt: number;
}

export interface TokenPnl {
  token: string;
  symbol: string;
  positions: number;
  open: number;
  depositedUsd: number;
  realizedUsd: number;
  unrealizedUsd: number;
  feesUsd: number;
  pnlUsd: number;
}

export interface PnlPayload {
  today: PeriodStats;
  week: PeriodStats;
  fortnight?: PeriodStats;
  month: PeriodStats;
  stats: {
    realizedPnlUsd: number;
    grossPnlUsd?: number;
    netPnlUsd?: number;
    gasUsd?: number;
    feeChargedUsd?: number;
    volumeUsd: number;
    positionsOpened: number;
    positionsClosed: number;
  };
  trades: ClosedTrade[];
  tokens: TokenPnl[];
  daily?: DayStats[];
  todayKey?: string;
  tzOffsetMin?: number;
  asOf?: number;
}

export interface CalendarPayload {
  days: DayStats[];
  trades: ClosedTrade[];
  stats: {
    realizedPnlUsd: number;
    grossPnlUsd?: number;
    netPnlUsd?: number;
    gasUsd?: number;
    feeChargedUsd?: number;
    volumeUsd: number;
    positionsOpened: number;
    positionsClosed: number;
  };
  todayKey?: string;
  tzOffsetMin?: number;
  asOf?: number;
}

export type AiRangeSide = 'both' | 'down' | 'up';

/** An AI LP analysis from POST /api/pools/analyze or GET /api/pools/analysis. A suggestion only; it never opens anything. */
export interface AiAnalysis {
  id: number;
  chainId: number;
  poolId: string;
  /** both: straddles spot. down: below spot, quote only. up: above spot, token only. */
  rangeSide: AiRangeSide;
  /** 0-100: how attractive and how safe the pool looks for an LP right now. */
  lpScore: number;
  /** The recommended range, in quote per token: the same unit as the range picker. */
  bottomPrice: number;
  topPrice: number;
  /** The same edges as signed % from the spot price at analysis time. */
  lowerPct: number;
  upperPct: number;
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  risks: string[];
  priceAtAnalysis: number;
  model: string;
  promptVersion: string;
  createdAt: number;
  appliedAt: number | null;
  /** Older than the freshness window, or spot has moved past the threshold since. */
  stale: boolean;
  /** A recent analysis was returned instead of asking the model again. */
  reused: boolean;
}
