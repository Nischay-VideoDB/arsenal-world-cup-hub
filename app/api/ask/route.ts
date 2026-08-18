import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  tool,
  stepCountIs,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { tokenrouter, MODELS, liveModelConfigured } from "@/lib/ai";
import { serpSearch } from "@/lib/brightdata";
import { gunnersSnapshot } from "@/lib/gunners";
import { preparedDeskReply } from "@/lib/prepared-public";
import { beginRun, failRun, finishRun, requestIdentity } from "@/lib/live-store";
import { headers } from "next/headers";

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

  if (!liveModelConfigured) {
    const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
    const question =
      latestUserMessage?.parts.find((part) => part.type === "text")?.text ??
      "Show the prepared Arsenal roster.";
    const prepared = preparedDeskReply(question);
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({
          type: "tool-input-available",
          toolCallId: "prepared-squad-snapshot",
          toolName: "squadInfo",
          input: prepared.trace.input,
        });
        writer.write({
          type: "tool-output-available",
          toolCallId: "prepared-squad-snapshot",
          output: prepared.trace,
        });
        writer.write({ type: "text-start", id: "prepared-answer" });
        writer.write({ type: "text-delta", id: "prepared-answer", delta: prepared.text });
        writer.write({ type: "text-end", id: "prepared-answer" });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  let runId: string;
  try {
    const start = await beginRun(
      "ask", requestIdentity(await headers()), { messageCount: messages.length }, 20,
      req.headers.get("idempotency-key"),
    );
    if (start.replayed) {
      const prior = start.output as { text?: string } | null;
      if (start.status !== "done" || !prior?.text) {
        return new Response(`The prior request is ${start.status}; use a new key to start another run.`, { status: 409 });
      }
      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({ type: "text-start", id: "replayed-answer" });
          writer.write({ type: "text-delta", id: "replayed-answer", delta: prior.text! });
          writer.write({ type: "text-end", id: "replayed-answer" });
        },
      });
      return createUIMessageStreamResponse({ stream });
    }
    runId = start.id;
  } catch {
    return new Response("Public demo rate limit reached. Try again later.", { status: 429 });
  }

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
    onFinish: async ({ usage, text }) => {
      await finishRun(runId, "openrouter-live", { usage, text });
    },
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      void failRun(runId, error);
      return "The live model is unavailable right now - try again.";
    },
  });
}
