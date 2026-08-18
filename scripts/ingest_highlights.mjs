// Ingest Gunner goal-highlight videos into VideoDB (YouTube URL → index spoken words).
// Idempotent: skips videos already present (by title). Writes data/goals_index.json.
// Run: node --env-file=.env.local scripts/ingest_highlights.mjs
import { connect } from "videodb";
import { writeFile } from "node:fs/promises";
import goalsManifest from "../data/goals_index.json" with { type: "json" };

// WC2026 goals are fictional, so these are real Arsenal goal compilations as stand-ins.
// Keep this list aligned with the audited two-video production manifest.
const TARGETS = goalsManifest.videos.map((video) => ({
  ...video,
  url: video.sourceUrl,
}));

const t0 = Date.now();
const el = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;

const conn = connect({ apiKey: process.env.VIDEO_DB_API_KEY });
const collectionId = process.env.ARSENAL_GOALS_COLLECTION_ID?.trim() || goalsManifest.collectionId;
if (!collectionId.startsWith("c-") || collectionId === "default") {
  throw new Error("Set ARSENAL_GOALS_COLLECTION_ID to the dedicated Gunner collection.");
}
const coll = await conn.getCollection(collectionId);
const existing = await coll.getVideos();
const existingNames = new Set(existing.map((v) => v.name ?? ""));
console.log(`[${el()}] collection has ${existing.length} videos`);

const manifest = [];

for (const t of TARGETS) {
  const already = [...existingNames].some((n) => n && t.player.split(" ").pop() && n.toLowerCase().includes(t.player.split(" ").pop().toLowerCase()));
  if (already) {
    console.log(`[${el()}] skip ${t.player} (already ingested)`);
    manifest.push(t);
    continue;
  }
  try {
    console.log(`[${el()}] uploading ${t.player} …`);
    const video = await coll.uploadURL({ url: t.url, name: t.title });
    const id = video.id;
    const title = video.name;
    console.log(`[${el()}] uploaded ${t.player}: ${id} "${(title ?? "").slice(0, 50)}"`);
    await video.indexSpokenWords();
    console.log(`[${el()}] indexed ${t.player}`);
    manifest.push({ ...t, videoId: id, title });
  } catch (e) {
    console.log(`[${el()}] ERROR ${t.player}: ${e.message}`);
  }
}

await writeFile("data/goals_index.json", JSON.stringify({
  collectionId: coll.id,
  sourceCollectionId: goalsManifest.sourceCollectionId,
  migrationNote: goalsManifest.migrationNote,
  videos: manifest,
}, null, 2));
console.log(`[${el()}] DONE — ${manifest.length} videos in collection; manifest → data/goals_index.json`);
