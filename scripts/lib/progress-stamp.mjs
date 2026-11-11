export function computeSpentHours(state, { now = new Date(), sha } = {}) {
  const startedAt = state.brief?.started_at;
  if (!startedAt) {
    return { spent_hours: state.budget?.spent_hours ?? 0, last_commit: state.budget?.last_commit ?? null };
  }
  // Two decimals: this is elapsed wall-clock time since the brief, shown to a person, and
  // 1.1295291666666667 hours claims a precision nobody measured.
  const spent_hours = Math.round(((now.getTime() - Date.parse(startedAt)) / 3_600_000) * 100) / 100;
  return { spent_hours, last_commit: { at: now.toISOString(), sha } };
}
