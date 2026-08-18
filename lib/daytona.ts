// Compatibility boundary retained for upstream callers. Public production uses
// the bounded TypeScript Monte Carlo runner because DAYTONA_API_KEY is absent.

export interface PyRun {
  stdout: string;
  charts: string[]; // base64 PNGs
  error?: string;
}

export async function runPython(code: string): Promise<PyRun> {
  void code;
  return { stdout: "", charts: [], error: "Daytona is not configured; use the verified built-in runner." };
}
