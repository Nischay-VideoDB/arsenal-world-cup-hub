import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isSafePreparedEmbedUrl,
  isSafePreparedSourceUrl,
  preparedDeskReply,
  preparedGoalsResult,
} from "./prepared-public.ts";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Ask prepared answers include a visible squadInfo trace", () => {
  const answer = preparedDeskReply("Which Gunners represent Spain?");

  assert.match(answer.text, /Spain's prepared Arsenal contingent/i);
  assert.equal(answer.trace.prepared, true);
  assert.equal(answer.trace.label, "Prepared squad snapshot");
  assert.equal(answer.trace.input.source, "gunnersSnapshot");
  assert.equal(answer.trace.input.nation, "Spain");
});

test("Ask refuses time-sensitive questions without inventing current information", () => {
  const answer = preparedDeskReply("What is the latest Arsenal World Cup result?");

  assert.match(answer.text, /does not query live web news or scores/i);
  assert.match(answer.trace.results, /time-sensitive web lookup unavailable/i);
  assert.equal(answer.trace.input.mode, "prepared-time-sensitive-refusal");
});

test("Goals maps the tracked Saka ingestion record to an honest prepared source fallback", () => {
  const result = preparedGoalsResult("Show Bukayo Saka goals");

  assert.equal(result.available, true);
  assert.equal(result.mode, "prepared-source-corpus");
  assert.match(result.title ?? "", /Bukayo Saka/i);
  assert.match(result.videoId ?? "", /^m-/);
  assert.match(result.collectionId, /^c-/);
  assert.equal(result.sourceUrl, "https://www.youtube.com/watch?v=CjXnBXQWNb0");
  assert.equal(result.sourceEmbedUrl, "https://www.youtube-nocookie.com/embed/CjXnBXQWNb0");
  assert.equal(
    result.provenance,
    "Prepared source-corpus fallback; not a fresh VideoDB search or compiled reel.",
  );
});

test("Goals rejects unserved semantic searches and allows only the fixed trusted player URLs", () => {
  const unavailable = preparedGoalsResult("find the latest Arsenal goal");

  assert.equal(unavailable.available, false);
  assert.match(unavailable.error ?? "", /Fresh VideoDB semantic search is unavailable/i);
  assert.equal(isSafePreparedSourceUrl("https://www.youtube.com/watch?v=CjXnBXQWNb0"), true);
  assert.equal(isSafePreparedEmbedUrl("https://www.youtube-nocookie.com/embed/CjXnBXQWNb0"), true);
  assert.equal(isSafePreparedSourceUrl("https://example.com/watch?v=CjXnBXQWNb0"), false);
  assert.equal(isSafePreparedEmbedUrl("javascript:alert(1)"), false);
});

test("the five public modules expose prepared public-mode affordances", async () => {
  const expectedMarkers = [
    ["../app/page.tsx", "GUNNERS TODAY"],
    ["../app/ask/page.tsx", "PREPARED SNAPSHOT"],
    ["../app/goals/page.tsx", "PREPARED SOURCE-CORPUS FALLBACK"],
    ["../app/oracle/page.tsx", "PREPARED FALLBACK"],
    ["../app/briefing/page.tsx", "PREPARED FALLBACK"],
  ];

  for (const [path, marker] of expectedMarkers) {
    assert.match(await readSource(path), new RegExp(marker));
  }
});

test("live integrations are public while prepared fallbacks remain additive", async () => {
  const [ask, goals, oracle, briefing] = await Promise.all([
    readSource("../app/api/ask/route.ts"),
    readSource("../app/api/goals/search/route.ts"),
    readSource("../app/api/oracle/route.ts"),
    readSource("../app/api/briefing/route.ts"),
  ]);

  assert.match(ask, /liveModelConfigured/);
  assert.match(goals, /process\.env\.VIDEO_DB_API_KEY/);
  assert.match(oracle, /liveModelConfigured/);
  assert.match(briefing, /liveModelConfigured/);
  assert.match(ask, /streamText\(/);
  assert.doesNotMatch(goals, /getCollection\("default"\)/);
  assert.match(goals, /goalsCollectionId\(\)/);
  assert.match(goals, /scopedVideoIdForQuery\(q\)/);
  assert.match(goals, /filterGoalShots\(/);
  assert.match(goals, /InvalidRequestError/);
  assert.match(goals, /VideodbError/);
  assert.match(goals, /no results found/i);
  assert.match(goals, /preparedGoalsResult\(q\)/);
  assert.match(oracle, /generateText\(/);
  assert.match(oracle, /verifiedSimulation\(/);
  assert.match(briefing, /generateText\(/);
});

test("Goals prefers hls.js before native HLS for reliable Chromium playback", async () => {
  const goalsPage = await readFile(new URL("../app/goals/page.tsx", import.meta.url), "utf8");
  const hlsJsCheck = goalsPage.indexOf("Hls.isSupported()");
  const nativeCheck = goalsPage.indexOf('video.canPlayType("application/vnd.apple.mpegurl")');
  assert.ok(hlsJsCheck >= 0);
  assert.ok(nativeCheck > hlsJsCheck);
});
