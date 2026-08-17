import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { tokenrouter, MODELS } from "@/lib/ai";
import { serpSearch } from "@/lib/brightdata";
import { gunnersSnapshot } from "@/lib/gunners";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are the **Arsenal Gunners Desk** — a sharp, knowledgeable assistant for Arsenal fans tracking their players at the FIFA World Cup 2026 (11 Jun – 19 Jul 2026, hosted by USA/Canada/Mexico).

You cover the 15 Arsenal players representing 9 nations. Speak with an informed, confident Arsenal voice — concise, never padded.

Tools:
- squadInfo: the authoritative list of Arsenal's World Cup players (use this for anything about who is at the tournament, their nation/position/number, and their current match status).
- searchWeb: live Google results via Bright Data — use for anything time-sensitive (live scores, today's fixtures, breaking news, latest results) or facts outside the squad list.

Always prefer squadInfo for roster questions. Use searchWeb when the answer needs current/live information. When you use the web, weave the findings in naturally. Keep answers tight and useful.`;

const BodySchema = z.object({ messages: z.array(z.any()).min(1).max(40) });

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return new Response("Invalid request body", { status: 400 });
  }
  const messages = parsed.data.messages as UIMessage[];

  const result = streamText({
    model: tokenrouter(MODELS.agent),
    system: SYSTEM,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      squadInfo: tool({
        description:
          "Get Arsenal's official 15-player World Cup 2026 squad with nation, position, squad number, and current match status. Optionally filter by nation.",
        inputSchema: z.object({
          nation: z.string().optional().describe("Optional nation filter, e.g. 'England'"),
        }),
        execute: async ({ nation }) => {
          const list = nation
            ? gunnersSnapshot.filter((g) => g.nation.toLowerCase() === nation.toLowerCase())
            : gunnersSnapshot;
          return list.map((g) => ({
            name: g.name,
            nation: g.nation,
            position: g.position,
            number: g.number,
            status: g.status,
            match: `${g.badge} ${g.opponent}`,
            contribution: g.stat ?? "—",
          }));
        },
      }),
      searchWeb: tool({
        description:
          "Search the live web (Google via Bright Data) for current information: World Cup scores, fixtures, results, news. Use for anything time-sensitive.",
        inputSchema: z.object({
          query: z.string().describe("The search query"),
        }),
        execute: async ({ query }) => ({ query, results: await serpSearch(query) }),
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    onError: () => "The Gunners Desk is unavailable right now - try again.",
  });
}
