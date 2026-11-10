const SEVERITY_ORDER = ['blocking', 'should-fix', 'post-release'];
const SEVERITY_LABEL = {
  blocking: 'Blocking', 'should-fix': 'Should-fix', 'post-release': 'Post-release',
};

/** Renders review.json to review.md -- blocking first, then by user_visible within each
 * bucket, never by file path. */
export function renderReview(review) {
  const findings = review.findings ?? [];
  const lines = ['# Review', ''];
  if (findings.length === 0) {
    lines.push('No findings. Clean.', '');
    return lines.join('\n');
  }
  for (const severity of SEVERITY_ORDER) {
    const bucket = findings
      .filter((f) => f.severity === severity)
      .sort((a, b) => Number(b.user_visible) - Number(a.user_visible)
        || a.id.localeCompare(b.id, undefined, { numeric: true }));
    if (bucket.length === 0) continue;
    lines.push(`## ${SEVERITY_LABEL[severity]}`, '');
    for (const f of bucket) {
      const loc = f.file ? ` (\`${f.file}${f.line != null ? `:${f.line}` : ''}\`)` : '';
      lines.push(`### ${f.id} — ${f.title}${loc}`, '');
      lines.push(`_source: ${f.source}${f.user_visible ? ', user-visible' : ''}_`, '');
      lines.push(f.summary, '');
    }
  }
  return lines.join('\n');
}
