import { ApiError, get, post } from './api';
import type { AiAnalysis, AiRangeSide } from './types';

/**
 * AI LP analysis: fetch the latest, run a new one, and turn a recommendation
 * into the custom range the entry form uses. Applying only fills the form; the
 * user still previews the plan and confirms the open.
 */

export interface PoolRefBody {
  token?: string;
  poolId: string;
  version: 'v3' | 'v4';
  chainId?: number;
}

export const fetchLatestAnalysis = async (ref: PoolRefBody, signal?: AbortSignal): Promise<AiAnalysis | null> => {
  const q = new URLSearchParams({ poolId: ref.poolId, version: ref.version });
  if (ref.token) q.set('token', ref.token);
  if (ref.chainId) q.set('chainId', String(ref.chainId));
  return (await get<{ analysis: AiAnalysis | null }>(`/api/pools/analysis?${q}`, signal)).analysis;
};

export const runAnalysis = async (
  ref: PoolRefBody,
  opts: { force?: boolean; rangeSide?: AiRangeSide } = {},
  signal?: AbortSignal,
): Promise<AiAnalysis> =>
  (
    await post<{ analysis: AiAnalysis }>(
      '/api/pools/analyze',
      { ...ref, ...(opts.force ? { force: true } : {}), params: { rangeSide: opts.rangeSide ?? 'both' } },
      undefined,
      signal,
    )
  ).analysis;

export const SIDE_LABEL: Record<AiRangeSide, string> = { both: 'Both sides', down: 'Below spot', up: 'Above spot' };

/** 503: the backend has no AI key. The feature hides itself rather than showing an error. */
export const isAiUnavailable = (err: unknown): boolean => err instanceof ApiError && err.status === 503;

/** A message a person can act on, for the errors the endpoint is known to return. */
export const aiErrorMessage = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Hourly AI analysis limit reached. Try again later.';
    if (err.status === 502) return 'The AI could not produce a usable answer. Try again.';
    if (err.status === 404) return 'This pool could not be found.';
    return err.message;
  }
  return err instanceof Error ? err.message : 'AI analysis failed';
};

export interface AppliedRange {
  low: number;
  high: number;
  /** Signed % from the current spot, clamped the way the range picker clamps. */
  lowPct: number;
  highPct: number;
}

const clampPct = (p: number): number => Math.min(900, Math.max(-95, p));

/**
 * The form range for a recommendation, measured against the spot price now
 * (not at analysis time). A single-sided range keeps its spot-side edge on the
 * current spot, so a price move since the analysis cannot turn it two-sided.
 */
export const rangeFromAnalysis = (
  a: Pick<AiAnalysis, 'bottomPrice' | 'topPrice'> & { rangeSide?: AiRangeSide },
  spot: number,
): AppliedRange | null => {
  if (!(a.bottomPrice > 0) || !(a.topPrice > a.bottomPrice) || !(spot > 0)) return null;
  const side = a.rangeSide ?? 'both';
  if (side === 'down') {
    if (!(a.bottomPrice < spot)) return null;
    return { low: a.bottomPrice, high: spot, lowPct: clampPct((a.bottomPrice / spot - 1) * 100), highPct: 0 };
  }
  if (side === 'up') {
    if (!(a.topPrice > spot)) return null;
    return { low: spot, high: a.topPrice, lowPct: 0, highPct: clampPct((a.topPrice / spot - 1) * 100) };
  }
  const lowPct = clampPct((a.bottomPrice / spot - 1) * 100);
  const highPct = clampPct((a.topPrice / spot - 1) * 100);
  return { low: a.bottomPrice, high: a.topPrice, lowPct: Math.min(lowPct, highPct - 0.1), highPct: Math.max(highPct, lowPct + 0.1) };
};

/**
 * The analysis an open should be linked to: only while the form still holds
 * exactly the applied range. Editing either edge afterwards makes it the
 * user's own range, and the link is dropped.
 */
export const linkedAnalysisId = (
  applied: { id: number; low: number; high: number } | null,
  form: { mode: 'preset' | 'custom'; low: number | null; high: number | null },
): number | undefined =>
  applied && form.mode === 'custom' && form.low === applied.low && form.high === applied.high ? applied.id : undefined;

export const scoreTone = (score: number): 'good' | 'fair' | 'poor' => (score >= 70 ? 'good' : score >= 40 ? 'fair' : 'poor');
