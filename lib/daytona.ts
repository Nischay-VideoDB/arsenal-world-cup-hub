// Daytona — run Python in an ephemeral sandbox, capture stdout + matplotlib chart PNGs.
import { Daytona } from "@daytona/sdk";

export interface PyRun {
  stdout: string;
  charts: string[]; // base64 PNGs
  error?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function runPython(code: string): Promise<PyRun> {
  const key = process.env.DAYTONA_API_KEY;
  if (!key) return { stdout: "", charts: [], error: "Daytona not configured" };

  const daytona = new Daytona({ apiKey: key });
  let sandbox;
  try {
    sandbox = await daytona.create({ language: "python", ephemeral: true, autoStopInterval: 5 });
    const res = await sandbox.process.codeRun(code);
    const result = asRecord(res);
    const artifacts = asRecord(result.artifacts);
    const stdout = String(artifacts.stdout ?? result.result ?? "");
    const charts = Array.isArray(artifacts.charts)
      .map(asRecord)
      .map((chart) => chart.png)
      .filter((png): png is string => typeof png === "string");
    return { stdout, charts };
  } catch (e) {
    return { stdout: "", charts: [], error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (sandbox) {
      try {
        await sandbox.delete();
      } catch {
        /* meter best-effort */
      }
    }
  }
}
