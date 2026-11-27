import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { aiErrorMessage, isAiUnavailable, linkedAnalysisId, rangeFromAnalysis, scoreTone } from './ai-analysis';

const a = { id: 5, bottomPrice: 0.8, topPrice: 1.3 };

describe('AI analysis apply mapping', () => {
  it('maps the recommendation to custom prices and % from the current spot', () => {
    expect(rangeFromAnalysis(a, 1)).toEqual({ low: 0.8, high: 1.3, lowPct: expect.closeTo(-20, 6), highPct: expect.closeTo(30, 6) });
  });

  it('measures against the spot now, not the spot at analysis time', () => {
    const r = rangeFromAnalysis(a, 1.0);
    const moved = rangeFromAnalysis(a, 0.5);
    expect(moved?.low).toBe(r?.low);
    expect(moved?.lowPct).toBeCloseTo(60, 6);
  });

  it('refuses an unusable range or no spot', () => {
    expect(rangeFromAnalysis({ bottomPrice: 1.3, topPrice: 0.8 }, 1)).toBeNull();
    expect(rangeFromAnalysis(a, 0)).toBeNull();
  });

  it('links the open only while the form holds exactly the applied range', () => {
    expect(linkedAnalysisId({ id: 5, low: 0.8, high: 1.3 }, { mode: 'custom', low: 0.8, high: 1.3 })).toBe(5);
    expect(linkedAnalysisId({ id: 5, low: 0.8, high: 1.3 }, { mode: 'custom', low: 0.81, high: 1.3 })).toBeUndefined();
    expect(linkedAnalysisId({ id: 5, low: 0.8, high: 1.3 }, { mode: 'preset', low: null, high: null })).toBeUndefined();
    expect(linkedAnalysisId(null, { mode: 'custom', low: 0.8, high: 1.3 })).toBeUndefined();
  });

  it('classifies errors', () => {
    expect(isAiUnavailable(new ApiError(503, 'AI analysis is not available'))).toBe(true);
    expect(isAiUnavailable(new ApiError(500, 'x'))).toBe(false);
    expect(aiErrorMessage(new ApiError(429, 'limited'))).toMatch(/limit/i);
    expect(aiErrorMessage(new ApiError(502, 'x'))).toMatch(/usable/);
  });

  it('scores into tones', () => {
    expect(scoreTone(81)).toBe('good');
    expect(scoreTone(55)).toBe('fair');
    expect(scoreTone(12)).toBe('poor');
  });
});

describe('single-sided apply', () => {
  it('down: anchors the top edge to the current spot', () => {
    const r = rangeFromAnalysis({ bottomPrice: 0.7, topPrice: 1, rangeSide: 'down' }, 1.05);
    expect(r?.high).toBe(1.05);
    expect(r?.highPct).toBe(0);
    expect(r?.low).toBe(0.7);
    expect(r?.lowPct).toBeCloseTo((0.7 / 1.05 - 1) * 100, 6);
  });

  it('up: anchors the bottom edge to the current spot', () => {
    const r = rangeFromAnalysis({ bottomPrice: 1, topPrice: 1.4, rangeSide: 'up' }, 0.98);
    expect(r?.low).toBe(0.98);
    expect(r?.lowPct).toBe(0);
    expect(r?.high).toBe(1.4);
  });

  it('refuses when the price has already moved through the range', () => {
    expect(rangeFromAnalysis({ bottomPrice: 0.7, topPrice: 1, rangeSide: 'down' }, 0.6)).toBeNull();
    expect(rangeFromAnalysis({ bottomPrice: 1, topPrice: 1.4, rangeSide: 'up' }, 1.5)).toBeNull();
  });

  it('links the open to the anchored range, not the raw recommendation', () => {
    expect(linkedAnalysisId({ id: 9, low: 0.7, high: 1.05 }, { mode: 'custom', low: 0.7, high: 1.05 })).toBe(9);
  });
});
