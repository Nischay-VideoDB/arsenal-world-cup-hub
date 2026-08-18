import { connect, InvalidRequestError, VideodbError } from "videodb";
import { preparedGoalsResult } from "@/lib/prepared-public";
import { beginRun, failRun, finishRun, requestIdentity } from "@/lib/live-store";
import {
  filterGoalShots,
  GOAL_SEARCH_RESULT_THRESHOLD,
  goalsCollectionId,
  MIN_GOAL_SEARCH_SCORE,
  scopedVideoIdForQuery,
} from "@/lib/goals-corpus";
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
    const collectionId = goalsCollectionId();
    const coll = await conn.getCollection(collectionId);
    const scopedVideoId = scopedVideoIdForQuery(q);
    const searchTarget = scopedVideoId ? await coll.getVideo(scopedVideoId) : coll;
    let res: any;
    try {
      res = await searchTarget.search(
        q,
        undefined,
        undefined,
        GOAL_SEARCH_RESULT_THRESHOLD,
        MIN_GOAL_SEARCH_SCORE,
      );
    } catch (error) {
      const providerError = error instanceof InvalidRequestError || error instanceof VideodbError;
      if (!providerError || !/no results found/i.test(error.message)) {
        throw error;
      }
      const output = {
        query: q,
        playerUrl: null,
        shots: [],
        count: 0,
        error: "No relevant indexed Gunner moments matched this search.",
        mode: "videodb-live",
        collectionId,
        scopedVideoId,
      };
      await finishRun(runId, "videodb-live", output);
      return Response.json(output);
    }
    const accepted = filterGoalShots(res?.shots ?? [], q);
    const shots = accepted.map(({ shot }) => shot);

    let playerUrl: string | null = null;
    if (shots.length && typeof res?.compile === "function") {
      try {
        // Compile only the audited subset. Never expose a provider stream that
        // may contain rejected videos or low-quality transcript fragments.
        res.shots = accepted.map(({ raw }) => raw);
        playerUrl = await res.compile();
      } catch {
        /* compile unavailable */
      }
    }

    const output = {
      query: q,
      playerUrl,
      shots,
      count: shots.length,
      error: shots.length ? null : "No relevant indexed Gunner moments matched this search.",
      mode: "videodb-live",
      collectionId,
      scopedVideoId,
    };
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
