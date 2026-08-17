import { generateText } from "ai";
import { tokenrouter, MODELS } from "@/lib/ai";
import { runPython } from "@/lib/daytona";
import { gunnersSnapshot, type Gunner } from "@/lib/gunners";

export const runtime = "nodejs";
export const maxDuration = 300;

const NATION_LAMBDA: Record<string, number> = {
  Spain: 1.9, Brazil: 1.9, France: 1.85, England: 1.8, Germany: 1.7,
  Belgium: 1.6, Norway: 1.5, Sweden: 1.45, Ecuador: 1.2,
};
const POS_SHARE: Record<string, number> = {
  FORWARD: 0.34, MIDFIELDER: 0.18, DEFENDER: 0.06, GOALKEEPER: 0.0,
};

const opponentOf = (g: Gunner) => g.opponent.replace(/^vs\s+/i, "");

function extractCode(s: string): string {
  // Prefer the largest fenced code block if present.
  const fences = [...s.matchAll(/```(?:python)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  let c = fences.length ? fences.sort((a, b) => b.length - a.length)[0] : s;
  // Drop any leading prose before the first real code line.
  const idx = c.search(/^(import |from |#|matplotlib)/m);
  if (idx > 0) c = c.slice(idx);
  return c.trim();
}

function parseResult(stdout: string) {
  const m = stdout.match(/RESULT_JSON:\s*(\{.*\})/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function parseChart(stdout: string): string | null {
  const m = stdout.match(/CHART_B64:([A-Za-z0-9+/=]+)/);
  return m ? m[1] : null;
}

const CHART_CONTRACT = `Do NOT call plt.show(). Instead, save the figure to an in-memory PNG and print it base64-encoded on a single line prefixed with CHART_B64: like this:
import io, base64
buf = io.BytesIO()
plt.savefig(buf, format='png', dpi=120, bbox_inches='tight')
print('CHART_B64:' + base64.b64encode(buf.getvalue()).decode())`;

function fallbackScript(g: Gunner): string {
  const lamFor = NATION_LAMBDA[g.nation] ?? 1.5;
  const lamAgainst = 1.1;
  const share = POS_SHARE[g.position] ?? 0.15;
  const opp = opponentOf(g);
  return `import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np, json, io, base64

rng = np.random.default_rng(7)
N = 20000
gf = rng.poisson(${lamFor}, N)
ga = rng.poisson(${lamAgainst}, N)
win = float((gf > ga).mean() * 100)
draw = float((gf == ga).mean() * 100)
loss = float((gf < ga).mean() * 100)
exp_goals = round(float(gf.mean()) * ${share}, 2)
exp_assists = round(float(gf.mean()) * ${share} * 0.6, 2)

plt.figure(figsize=(6, 4))
plt.bar(['Win', 'Draw', 'Loss'], [win, draw, loss], color=['#E30613', '#9AA3B2', '#10182E'])
plt.title('${g.nation} vs ${opp} — Monte Carlo (N=20,000)')
plt.ylabel('Probability (%)')
for i, v in enumerate([win, draw, loss]):
    plt.text(i, v + 0.6, f'{v:.1f}%', ha='center', fontweight='bold')
plt.ylim(0, max(win, draw, loss) + 8)
plt.tight_layout()

buf = io.BytesIO()
plt.savefig(buf, format='png', dpi=120, bbox_inches='tight')
print('CHART_B64:' + base64.b64encode(buf.getvalue()).decode())
print('RESULT_JSON: ' + json.dumps({'win': round(win,1), 'draw': round(draw,1), 'loss': round(loss,1), 'expGoals': exp_goals, 'expAssists': exp_assists}))
`;
}

export async function POST(req: Request) {
  const { playerKey } = await req.json();
  const g = gunnersSnapshot.find((x) => x.key === playerKey) ?? gunnersSnapshot[0];
  const opp = opponentOf(g);

  const prompt = `Write a COMPLETE, self-contained Python script that runs a Monte Carlo simulation for a FIFA World Cup 2026 match.

Player: ${g.name} (${g.position}, #${g.number}) playing for ${g.nation} against ${opp}.

Requirements (follow EXACTLY):
- Use only numpy, matplotlib, json, io, base64 (all installed). Set matplotlib.use('Agg') BEFORE importing pyplot.
- Simulate N=20000 matches with a Poisson goal model. ${g.nation} is a strong side — use expected goals around ${NATION_LAMBDA[g.nation] ?? 1.5} for them and about 1.1 for ${opp}. Compute P(win), P(draw), P(loss) as percentages.
- Estimate ${g.name}'s expected goals and assists for the match based on his position (${g.position}: forwards score most, defenders least).
- Build ONE matplotlib bar chart of Win/Draw/Loss probabilities, titled "${g.nation} vs ${opp}", with value labels, using Arsenal colors (#E30613 red, #9AA3B2 grey, #10182E navy).
- ${CHART_CONTRACT}
- Then print EXACTLY ONE line: RESULT_JSON: {"win":<num>,"draw":<num>,"loss":<num>,"expGoals":<num>,"expAssists":<num>} with probabilities as percentages rounded to 1 decimal.
- Output ONLY the Python code. No markdown fences, no commentary.`;

  let code = "";
  let modelError: string | undefined;
  try {
    // k2.7-code is a reasoning model — give it headroom so reasoning doesn't crowd out the code.
    const { text } = await generateText({
      model: tokenrouter(MODELS.code),
      prompt,
      maxOutputTokens: 8000,
    });
    code = extractCode(text);
  } catch (e) {
    modelError = e instanceof Error ? e.message : String(e);
  }

  let usedFallback = false;
  let run = code ? await runPython(code) : { stdout: "", charts: [], error: modelError ?? "no code" };
  let chart = parseChart(run.stdout) ?? run.charts[0] ?? null;

  // Demo-safety: if Kimi's code errored or didn't satisfy the contract, run the template.
  if (run.error || !chart || !/RESULT_JSON:/.test(run.stdout)) {
    usedFallback = true;
    code = fallbackScript(g);
    run = await runPython(code);
    chart = parseChart(run.stdout) ?? run.charts[0] ?? null;
  }

  return Response.json({
    player: { name: g.name, nation: g.nation, position: g.position, number: g.number, opponent: opp, key: g.key },
    code,
    chart,
    parsed: parseResult(run.stdout),
    usedFallback,
    error: run.error ? "The simulation runner was unavailable. A verified fallback was used." : null,
  });
}
