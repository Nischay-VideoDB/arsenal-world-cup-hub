function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

/** Extract only usable chart PNG payloads from an optional Daytona artifact envelope. */
export function chartPngs(artifacts: unknown): string[] {
  const artifactRecord = asRecord(artifacts);
  const charts = Array.isArray(artifactRecord.charts) ? artifactRecord.charts : [];
  return charts
    .map(asRecord)
    .map((chart) => chart.png)
    .filter((png): png is string => typeof png === "string");
}
