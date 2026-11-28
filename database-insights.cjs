'use strict';
// Statistics describe a bounded, newest-first subset of stored CLIENT spans.
function aggregateDatabase(rows, threshold = 500) {
  const durations = rows.map(r => r.duration_ms).filter(v => Number.isFinite(v) && v >= 0).sort((a,b) => a-b);
  const percentile = p => {
    if (!durations.length) return null;
    const index = (durations.length - 1) * p, lower = Math.floor(index);
    return durations[lower] + (durations[Math.ceil(index)] - durations[lower]) * (index - lower);
  };
  const errors = rows.filter(r => r.span_error === true).length;
  return { count: rows.length, duration_sample_size: durations.length,
    average_ms: durations.length ? durations.reduce((a,b) => a+b,0)/durations.length : null,
    p50_ms: percentile(.5), p95_ms: percentile(.95), p99_ms: percentile(.99),
    recorded_error_count: errors, recorded_error_rate: rows.length ? errors / rows.length : null,
    unknown_outcome_count: rows.length-errors, slow_count: durations.filter(v => v > threshold).length,
    insufficient_data: durations.length < 100 };
}
module.exports = { aggregateDatabase };
