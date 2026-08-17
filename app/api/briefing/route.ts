import { generateText } from "ai";
import { tokenrouter, MODELS } from "@/lib/ai";
import { gunnersSnapshot, deriveHeroStats } from "@/lib/gunners";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const stats = deriveHeroStats(gunnersSnapshot);
  const fmt = (s: string) =>
    gunnersSnapshot
      .filter((g) => g.status === s)
      .map((g) => `${g.name} (${g.nation}, ${g.position}) ${g.opponent}${g.stat ? ` — ${g.stat}` : ""}`)
      .join("; ");

  const data = `Date: 13 June 2026 (World Cup 2026 group stage).
Arsenal has ${stats.players} players across ${stats.nations} nations. ${stats.liveNow} live now, ${stats.goals} goals so far today.
LIVE NOW: ${fmt("LIVE")}.
FINISHED TODAY: ${fmt("FT")}.
COMING UP: ${fmt("KO")}.`;

  const prompt = `You are the Arsenal Gunners Desk editor. Using ONLY the data below, write today's "Daily Gunners Briefing" for Arsenal fans tracking their players at the FIFA World Cup 2026.

${data}

Format (plain text, no markdown fences):
- First line: a punchy ALL-CAPS headline (max 8 words).
- Then 3 short labelled sections separated by blank lines, each starting with the label in caps followed by a colon: "LIVE NOW:", "TODAY'S RESULTS:", "COMING UP:".
- Mention specific players and their contributions. Confident, knowledgeable Arsenal voice. Keep the whole thing under ~180 words.`;

  // Deterministic on-brand fallback so the briefing is never blank.
  const deterministic = `THE GUNNERS ARE OUT IN FORCE\n\nLIVE NOW: ${fmt("LIVE")}.\n\nTODAY'S RESULTS: ${fmt("FT")}.\n\nCOMING UP: ${fmt("KO")}.`;

  if (process.env.OPERATOR_LIVE_MODE !== "enabled" || !process.env.TOKENROUTER_API_KEY) {
    return Response.json({ text: deterministic, generatedAt: "13 JUN 2026", stats, prepared: true });
  }

  let text = "";
  try {
    // Claude-fast via TokenRouter: quick, non-reasoning — fits the function budget and demos
    // TokenRouter's per-task routing (Kimi powers the agent + Oracle codegen; this is the snappy recap).
    const res = await generateText({ model: tokenrouter(MODELS.fallback), prompt, maxOutputTokens: 1200 });
    text = res.text.trim();
  } catch (e) {
    console.error("briefing generation failed:", e);
  }
  if (!text) text = deterministic;

  return Response.json({ text, generatedAt: "13 JUN 2026", stats, prepared: false });
}
