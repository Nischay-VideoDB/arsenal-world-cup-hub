import { connect } from "videodb";
import { preparedGoalsResult } from "@/lib/prepared-public";
import { beginRun, failRun, finishRun, requestIdentity } from "@/lib/live-store";
import { headers } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 60;

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() || "goal";
  if (q.length > 160) {
    return Response.json({ query: q.slice(0, 160), playerUrl: null, shots: [], count: 0, error: "Search queries must be 160 characters or fewer." }, { status: 400 });
  }
  if (!process.env.VIDEO_DB_API_KEY) {
    return Response.json(preparedGoalsResult(q));
  }
  let runId: string;
  try {
    const start = await beginRun(
      "goals", requestIdentity(await headers()), { query: q }, 15,
      req.headers.get("idempotency-key"),
    );
    if (start.replayed) {
      if (start.status === "done" && start.output) return Response.json(start.output);
      return Response.json({ error: `The prior request is ${start.status}; use a new key to start another run.` }, { status: 409 });
    }
    runId = start.id;
  }
  catch { return Response.json({ error: "Public demo rate limit reached." }, { status: 429 }); }
  try {
    const conn = connect({ apiKey: process.env.VIDEO_DB_API_KEY });
    const coll = await conn.getCollection("default");
    const res: any = await coll.search(q);

    const shots = (res?.shots ?? []).slice(0, 8).map((s: any) => ({
      start: s.start ?? s.startTime,
      end: s.end ?? s.endTime,
      text: s.text ?? "",
      videoId: s.videoId ?? s.video_id ?? null,
    }));

    let playerUrl: string | null = res?.playerUrl ?? null;
    if (!playerUrl && typeof res?.compile === "function") {
      try {
        playerUrl = await res.compile();
      } catch {
        /* compile unavailable */
      }
    }

    const output = { query: q, playerUrl, shots, count: shots.length, error: null, mode: "videodb-live" };
    await finishRun(runId, "videodb-live", output);
    return Response.json(output);
  } catch (error) {
    console.error("VideoDB goals search failed");
    await failRun(runId, error);
    return Response.json({
      query: q,
      playerUrl: null,
      shots: [],
      count: 0,
      error: "Search is temporarily unavailable. Please try again.",
    });
  }
}
