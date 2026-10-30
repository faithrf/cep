import { mulberry32, sampleBeta } from './random.ts';
import { chiSquarePValue } from './special.ts';

export const MIN_EXPOSURES = 100;
export const SRM_P_THRESHOLD = 0.001;
export const WINNER_PROB_BEST = 0.95;
export const DEFAULT_DRAWS = 20000;

export interface VariantCounts {
  key: string;
  exposures: number;
  conversions: number;
}

export interface VariantStats {
  key: string;
  /** null for the control (first variant). */
  probBeatControl: number | null;
  probBest: number;
  /** Relative lift vs control; null for the control. */
  lift: { mean: number; low: number; high: number } | null;
  /** Expected absolute conversion-rate loss if this variant is chosen. */
  expectedLoss: number;
}

/** `variants[0]` is the control (position 0). Deterministic for a given seed. */
export function analyzeBinary(
  variants: VariantCounts[],
  opts: { draws?: number; seed?: number } = {},
): VariantStats[] {
  const n = opts.draws ?? DEFAULT_DRAWS;
  const rng = mulberry32(opts.seed ?? 12345);
  const k = variants.length;
  const samples = variants.map((v) => {
    const a = 1 + v.conversions;
    const b = 1 + Math.max(0, v.exposures - v.conversions);
    const arr = new Float64Array(n);
    for (let i = 0; i < n; i++) arr[i] = sampleBeta(rng, a, b);
    return arr;
  });

  const best = new Array<number>(k).fill(0);
  const loss = new Array<number>(k).fill(0);
  const beat = new Array<number>(k).fill(0);
  const lifts = variants.map((_, j) => (j === 0 ? null : new Float64Array(n)));
  for (let i = 0; i < n; i++) {
    let max = -1, argmax = 0;
    for (let j = 0; j < k; j++) if (samples[j][i] > max) { max = samples[j][i]; argmax = j; }
    best[argmax]++;
    for (let j = 0; j < k; j++) {
      let other = -1;
      for (let m = 0; m < k; m++) if (m !== j && samples[m][i] > other) other = samples[m][i];
      if (other > samples[j][i]) loss[j] += other - samples[j][i];
      if (j > 0) {
        if (samples[j][i] > samples[0][i]) beat[j]++;
        lifts[j]![i] = (samples[j][i] - samples[0][i]) / samples[0][i];
      }
    }
  }
  return variants.map((v, j) => {
    let lift: VariantStats['lift'] = null;
    if (j > 0) {
      const arr = lifts[j]!;
      let sum = 0;
      for (let i = 0; i < n; i++) sum += arr[i];
      const sorted = Float64Array.from(arr).sort();
      lift = { mean: sum / n, low: sorted[Math.floor(0.025 * n)], high: sorted[Math.min(n - 1, Math.floor(0.975 * n))] };
    }
    return {
      key: v.key,
      probBeatControl: j === 0 ? null : beat[j] / n,
      probBest: best[j] / n,
      lift,
      expectedLoss: loss[j] / n,
    };
  });
}

export interface SrmResult {
  chi2: number;
  pValue: number;
  flagged: boolean;
}

/** Chi-square goodness of fit of observed exposures vs expected weights (any positive scale). */
export function srmCheck(exposures: number[], weights: number[]): SrmResult {
  const total = exposures.reduce((a, b) => a + b, 0);
  const wsum = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || exposures.length < 2 || wsum <= 0) return { chi2: 0, pValue: 1, flagged: false };
  let chi2 = 0;
  exposures.forEach((o, i) => {
    const e = (total * weights[i]) / wsum;
    if (e > 0) chi2 += ((o - e) * (o - e)) / e;
  });
  const pValue = chiSquarePValue(chi2, exposures.length - 1);
  return { chi2, pValue, flagged: pValue < SRM_P_THRESHOLD };
}

export type Verdict = 'not_enough_data' | 'srm' | 'winner' | 'running';

export function verdict(variants: VariantCounts[], stats: VariantStats[], srm: SrmResult): Verdict {
  if (variants.length === 0 || variants.some((v) => v.exposures < MIN_EXPOSURES)) return 'not_enough_data';
  if (srm.flagged) return 'srm';
  if (stats.some((s) => s.probBest >= WINNER_PROB_BEST)) return 'winner';
  return 'running';
}
