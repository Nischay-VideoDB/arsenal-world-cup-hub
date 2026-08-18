import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_GOALS_VIDEO_IDS,
  GOALS_COLLECTION_ID,
  MIN_GOAL_SEARCH_SCORE,
  filterGoalShots,
  goalsCollectionId,
  scopedVideoIdForQuery,
} from "./goals-corpus.ts";

const [sakaVideoId, odegaardVideoId] = [...ALLOWED_GOALS_VIDEO_IDS];

const goodSakaShot = {
  videoId: sakaVideoId,
  start: 119.48,
  end: 175.37,
  text: "Saka punishes Southampton. Bukayo Saka turns it in from close range and Arsenal have the equalizer.",
  searchScore: 0.61,
};

test("player queries are pinned to the corresponding allowlisted video", () => {
  assert.match(GOALS_COLLECTION_ID, /^c-/);
  assert.equal(scopedVideoIdForQuery("Saka goal"), sakaVideoId);
  assert.equal(scopedVideoIdForQuery("Show Bukayo Saka finishes"), sakaVideoId);
  assert.equal(scopedVideoIdForQuery("Martin Ødegaard goal"), odegaardVideoId);
  assert.equal(scopedVideoIdForQuery("free kick"), null);
});

test("shot filtering rejects shared-library leakage, tiny fragments, and Hindi demo material", () => {
  const filtered = filterGoalShots([
    { ...goodSakaShot, videoId: "m-z-unrelated" },
    { ...goodSakaShot, text: "Sa.", end: 120.2 },
    { ...goodSakaShot, text: "तो बेसिकली demo material with Arsenal goal words and unrelated workflow instructions." },
    { ...goodSakaShot, searchScore: MIN_GOAL_SEARCH_SCORE - 0.01 },
    { ...goodSakaShot, text: "Arsenal have scored a fine goal, but this transcript is about another player entirely." },
    goodSakaShot,
    { ...goodSakaShot, videoId: odegaardVideoId, start: 0, end: 40 },
  ], "Saka goal");

  assert.equal(filtered.length, 1);
  assert.deepEqual(filtered[0].shot, {
    start: 119.48,
    end: 175.37,
    text: goodSakaShot.text,
    videoId: sakaVideoId,
    score: 0.61,
  });
});

test("shot filtering is bounded and deduplicated before compilation", () => {
  const shots = Array.from({ length: 7 }, (_, index) => ({
    ...goodSakaShot,
    start: goodSakaShot.start + index * 60,
    end: goodSakaShot.end + index * 60,
  }));
  const filtered = filterGoalShots([shots[0], shots[0], ...shots.slice(1)], "Saka goal");
  assert.equal(filtered.length, 4);
  assert.equal(new Set(filtered.map(({ shot }) => `${shot.start}:${shot.end}`)).size, 4);
});

test("runtime configuration cannot redirect search to another account collection", () => {
  const previous = process.env.ARSENAL_GOALS_COLLECTION_ID;
  try {
    process.env.ARSENAL_GOALS_COLLECTION_ID = "c-unrelated";
    assert.throws(() => goalsCollectionId(), /audited Gunner collection/);
    process.env.ARSENAL_GOALS_COLLECTION_ID = GOALS_COLLECTION_ID;
    assert.equal(goalsCollectionId(), GOALS_COLLECTION_ID);
  } finally {
    if (previous === undefined) delete process.env.ARSENAL_GOALS_COLLECTION_ID;
    else process.env.ARSENAL_GOALS_COLLECTION_ID = previous;
  }
});
