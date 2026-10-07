/** Shared display policy: native metric scores remain unchanged in storage. */
interface ScoreContext {
  metric?: string | null;
  evaluation_config?: string | null;
}

const EVALUATOR_SCALES: Record<string, number> = {
  eval_1_cv_hico: 1,
  eval_2_nlp_tung: 100,
};
const POINTS_FORMAT = new Intl.NumberFormat('vi-VN', {
  useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function scoreOnHundred(score: number | null | undefined, context?: ScoreContext): number | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  const scale = EVALUATOR_SCALES[context?.evaluation_config?.trim() || '']
    ?? (context?.metric?.toLowerCase().includes('bleu') ? 100 : 1);
  // Metric metadata decides the scale; a low BLEU score must not be multiplied.
  return score * (100 / scale);
}

/** For overall totals/components already converted to points by the API. */
export function formatPoints(points: number | null | undefined): string {
  return points === null || points === undefined || !Number.isFinite(points) ? '—' : POINTS_FORMAT.format(points);
}

export function formatScore(score: number | null | undefined, context?: ScoreContext): string {
  return formatPoints(scoreOnHundred(score, context));
}
