import { generateText } from "ai";
import { tokenrouter, MODELS, liveModelConfigured } from "@/lib/ai";
import { gunnersSnapshot, type Gunner } from "@/lib/gunners";
import { preparedOracleProjection } from "@/lib/prepared-public";
import { beginRun, failRun, finishRun, requestIdentity } from "@/lib/live-store";
import { headers } from "next/headers";
import { z } from "zod";

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

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number, random: () => number) {
  const threshold = Math.exp(-lambda);
  let product = 1, k = 0;
  do { k += 1; product *= random(); } while (product > threshold);
  return k - 1;
}

function verifiedSimulation(g: Gunner) {
  const random = mulberry32([...g.key].reduce((sum, char) => sum + char.charCodeAt(0), 7));
  const lambdaFor = NATION_LAMBDA[g.nation] ?? 1.5;
  let win = 0, draw = 0, loss = 0, goals = 0;
  for (let i = 0; i < 20_000; i += 1) {
    const scored = poisson(lambdaFor, random);
    const conceded = poisson(1.1, random);
    goals += scored;
    if (scored > conceded) win += 1; else if (scored === conceded) draw += 1; else loss += 1;
  }
  const share = POS_SHARE[g.position] ?? 0.15;
  return {
    win: Number((win / 200).toFixed(1)), draw: Number((draw / 200).toFixed(1)),
    loss: Number((loss / 200).toFixed(1)),
    expGoals: Number((goals / 20_000 * share).toFixed(2)),
    expAssists: Number((goals / 20_000 * share * 0.6).toFixed(2)),
  };
}

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
  const parsedBody = z.object({ playerKey: z.string().min(1).max(80) }).safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) return Response.json({ error: "Invalid player selection." }, { status: 400 });
  const g = gunnersSnapshot.find((x) => x.key === parsedBody.data.playerKey);
  if (!g) return Response.json({ error: "Unknown player." }, { status: 400 });
  const opp = opponentOf(g);

  if (!liveModelConfigured) {
    return Response.json({
      player: { name: g.name, nation: g.nation, position: g.position, number: g.number, opponent: opp, key: g.key },
      code: fallbackScript(g),
      chart: null,
      parsed: preparedOracleProjection(g),
      usedFallback: true,
      prepared: true,
      error: null,
    });
  }

  let runId: string;
  try {
    runId = await beginRun("oracle", requestIdentity(await headers()), { playerKey: g.key }, 8);
  } catch {
    return Response.json({ error: "Public demo rate limit reached. Try later." }, { status: 429 });
  }

  const prompt = `Write a COMPLETE, self-contained Python script that runs a Monte Carlo simulation for a FIFA World Cup 2026 match.

Player: ${g.name} (${g.position}, #${g.number}) playing for ${g.nation} against ${opp}.

Requirements (follow EXACTLY):
- Use only numpy, matplotlib, json, io, base64 (all installed). Set matplotlib.use('Agg') BEFORE importing pyplot.
- Simulate N=20000 matches with a Poisson goal model. ${g.nation} is a strong side — use expected goals around ${NATION_LAMBDA[g.nation] ?? 1.5} for them and about 1.1 for ${opp}. Compute P(win), P(draw), P(loss) as percentages.
- Estimate ${g.name}'s expected goals and assists for the match based on his position (${g.position}: forwards score most, defenders least).
- Build ONE matplotlib bar chart of Win/Draw/Loss probabilities, titled "${g.nation} vs ${opp}", with value labels, using Arsenal colors (#E30613 red, #9AA3B2 grey, #10182E navy).
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

  const usedFallback = !code;
  if (!code) code = fallbackScript(g);
  const simulation = verifiedSimulation(g);
  const output = {
    player: { name: g.name, nation: g.nation, position: g.position, number: g.number, opponent: opp, key: g.key },
    code,
    chart: null,
    parsed: simulation,
    usedFallback,
    prepared: false,
    runner: "server-verified-typescript-monte-carlo",
    provider: usedFallback ? "built-in simulation; model code generation unavailable" : "OpenRouter live code generation",
    error: modelError ? "Model code generation was unavailable; the verified built-in simulation completed." : null,
  };
  try { await finishRun(runId, usedFallback ? "built-in-simulation" : "openrouter-live", output); }
  catch (error) { await failRun(runId, error); }
  return Response.json(output);
}
