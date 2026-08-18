import goalsManifest from "../data/goals_index.json" with { type: "json" };

type ManifestVideo = {
  videoId: string;
  title: string;
  player: string;
  sourceUrl: string;
  sourceVideoId: string;
};

type GoalsManifest = {
  collectionId: string;
  sourceCollectionId: string;
  migrationNote: string;
  videos: ManifestVideo[];
};

type RawShot = {
  start?: unknown;
  startTime?: unknown;
  end?: unknown;
  endTime?: unknown;
  text?: unknown;
  videoId?: unknown;
  video_id?: unknown;
  searchScore?: unknown;
  score?: unknown;
  meta?: Record<string, unknown>;
};

export type PublicGoalShot = {
  start: number;
  end: number;
  text: string;
  videoId: string;
  score: number | null;
};

const manifest = goalsManifest as GoalsManifest;
const allowedVideos = new Map(manifest.videos.map((video) => [video.videoId, video]));
const playerVideos = new Map(
  manifest.videos.map((video) => [normalize(video.player), video.videoId]),
);

const FOOTBALL_CONTEXT = /\b(?:arsenal|goal|score[ds]?|finish|net|penalty|free\s*kick|saka|bukayo|odegaard|gunners?)\b/i;
const DEVANAGARI = /[\u0900-\u097f]/u;
const SAKA_CONTEXT = /\b(?:(?:bukayo|bakayo|bukaya|mikayo)\s+)?saka\b|\bsacker(?:s)?\b/i;
const ODEGAARD_CONTEXT = /\b(?:martin\s+)?(?:odegaard|erdogard|erdogan)\b/i;

export const GOAL_SEARCH_RESULT_THRESHOLD = 8;
export const MIN_GOAL_SEARCH_SCORE = 0.5;

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00f8Ø]/g, "o")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function readNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeShot(raw: RawShot): PublicGoalShot | null {
  const meta = raw.meta ?? {};
  const start = readNumber(raw.start ?? raw.startTime ?? meta.start);
  const end = readNumber(raw.end ?? raw.endTime ?? meta.end);
  const text = readString(raw.text ?? meta.text);
  const videoId = readString(raw.videoId ?? raw.video_id ?? meta.videoId);
  const scoreValue = readNumber(raw.searchScore ?? raw.score ?? meta.searchScore);

  if (!allowedVideos.has(videoId)) return null;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return null;
  if (end - start < 2 || end - start > 90) return null;
  if (text.length < 40 || (text.match(/[A-Za-zÀ-ɏ]+/g)?.length ?? 0) < 8) return null;
  if (DEVANAGARI.test(text) || !FOOTBALL_CONTEXT.test(text)) return null;
  if (!Number.isFinite(scoreValue) || scoreValue < MIN_GOAL_SEARCH_SCORE) return null;

  return {
    start,
    end,
    text,
    videoId,
    score: Number.isFinite(scoreValue) ? scoreValue : null,
  };
}

export const GOALS_COLLECTION_ID = manifest.collectionId;
export const SOURCE_GOALS_COLLECTION_ID = manifest.sourceCollectionId;
export const ALLOWED_GOALS_VIDEO_IDS = new Set(allowedVideos.keys());

export function goalsCollectionId() {
  const configured = process.env.ARSENAL_GOALS_COLLECTION_ID?.trim();
  if (!configured) return GOALS_COLLECTION_ID;
  if (configured !== GOALS_COLLECTION_ID) {
    throw new Error("ARSENAL_GOALS_COLLECTION_ID must match the audited Gunner collection.");
  }
  return configured;
}

export function scopedVideoIdForQuery(query: string) {
  const normalized = normalize(query);
  if (/\b(?:bukayo\s+)?saka\b/.test(normalized)) {
    return playerVideos.get("bukayo saka") ?? null;
  }
  if (/\b(?:martin\s+)?odegaard\b/.test(normalized)) {
    return playerVideos.get("martin odegaard") ?? null;
  }
  return null;
}

export function filterGoalShots(rawShots: RawShot[], query: string, maximum = 4) {
  const scopedVideoId = scopedVideoIdForQuery(query);
  const sakaVideoId = playerVideos.get("bukayo saka");
  const odegaardVideoId = playerVideos.get("martin odegaard");
  const accepted: Array<{ raw: RawShot; shot: PublicGoalShot }> = [];
  const seen = new Set<string>();

  for (const raw of rawShots) {
    const shot = normalizeShot(raw);
    if (!shot || (scopedVideoId && shot.videoId !== scopedVideoId)) continue;
    if (scopedVideoId === sakaVideoId && !SAKA_CONTEXT.test(shot.text)) continue;
    if (scopedVideoId === odegaardVideoId && !ODEGAARD_CONTEXT.test(shot.text)) continue;
    const key = `${shot.videoId}:${shot.start.toFixed(2)}:${shot.end.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    accepted.push({ raw, shot });
    if (accepted.length >= maximum) break;
  }

  return accepted;
}
