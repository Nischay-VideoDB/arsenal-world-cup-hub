import goalsManifest from "../data/goals_index.json" with { type: "json" };
import { gunnersSnapshot, type Gunner } from "./gunners.ts";

type GoalsManifestVideo = {
  videoId: string;
  title: string;
  player?: string;
};

const manifest = goalsManifest as {
  collectionId: string;
  videos: GoalsManifestVideo[];
};

const SAKA_SOURCE_URL = "https://www.youtube.com/watch?v=CjXnBXQWNb0";
const SAKA_EMBED_URL = "https://www.youtube-nocookie.com/embed/CjXnBXQWNb0";

const preparedSakaVideo = manifest.videos.find((video) =>
  video.title.toLowerCase().includes("bukayo saka"),
);

if (!preparedSakaVideo) {
  throw new Error("Prepared Goals fallback requires the tracked Bukayo Saka ingestion record.");
}

const preparedSakaVideoRecord = preparedSakaVideo;

export type PreparedDeskReply = {
  text: string;
  trace: {
    prepared: true;
    label: string;
    input: Record<string, string>;
    results: string;
  };
};

function playerLine(player: Gunner): string {
  return `${player.name} - ${player.nation}, ${player.position}, #${player.number}; ${player.badge} ${player.opponent}${player.stat ? ` (${player.stat})` : ""}.`;
}

function preparedReply(text: string, results: string, input: Record<string, string>): PreparedDeskReply {
  return {
    text,
    trace: {
      prepared: true,
      label: "Prepared squad snapshot",
      input,
      results,
    },
  };
}

export function preparedDeskReply(question: string): PreparedDeskReply {
  const normalized = question.toLowerCase();
  const timeSensitive = /(latest|news|today|current|how did|score|fixture|result)/.test(normalized);

  if (timeSensitive) {
    return preparedReply(
      "This public showcase does not query live web news or scores. The prepared roster snapshot is dated 13 JUN 2026, so I cannot verify a fresh result or fixture.",
      "PREPARED - time-sensitive web lookup unavailable; no live result was invented.",
      { source: "gunnersSnapshot", mode: "prepared-time-sensitive-refusal" },
    );
  }

  if (normalized.includes("spain")) {
    const players = gunnersSnapshot.filter((player) => player.nation === "Spain");
    return preparedReply(
      `Spain's prepared Arsenal contingent is ${players.map((player) => player.name).join(", ")}. ${players.map(playerLine).join(" ")}`,
      `PREPARED - ${players.map((player) => `${player.name} (#${player.number}, ${player.position})`).join("; ")}`,
      { source: "gunnersSnapshot", nation: "Spain" },
    );
  }

  if (normalized.includes("live")) {
    const players = gunnersSnapshot.filter((player) => player.status === "LIVE");
    return preparedReply(
      `The prepared snapshot marks ${players.length} Gunners as LIVE: ${players.map((player) => player.name).join(", ")}. This is recorded showcase data, not a live match feed.`,
      `PREPARED - recorded LIVE state: ${players.map((player) => player.name).join(", ")}`,
      { source: "gunnersSnapshot", status: "LIVE" },
    );
  }

  if (/(goalkeeper|defender)/.test(normalized)) {
    const players = gunnersSnapshot.filter(
      (player) => player.position === "GOALKEEPER" || player.position === "DEFENDER",
    );
    return preparedReply(
      `The prepared roster lists ${players.map((player) => player.name).join(", ")} across goalkeeping and defence. ${players.map(playerLine).join(" ")}`,
      `PREPARED - ${players.map((player) => `${player.name}: ${player.position}`).join("; ")}`,
      { source: "gunnersSnapshot", positions: "GOALKEEPER,DEFENDER" },
    );
  }

  return preparedReply(
    `This prepared roster contains ${gunnersSnapshot.length} Arsenal players across ${new Set(gunnersSnapshot.map((player) => player.nation)).size} nations. It can answer roster, nation, position, and recorded-status questions; live web and model chat are unavailable until an operator configures those integrations.`,
    `PREPARED - ${gunnersSnapshot.length} roster entries from gunnersSnapshot.`,
    { source: "gunnersSnapshot", mode: "prepared-roster-overview" },
  );
}

export function isSafePreparedSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "www.youtube.com" &&
      url.pathname === "/watch" &&
      url.searchParams.get("v") === "CjXnBXQWNb0"
    );
  } catch {
    return false;
  }
}

export function isSafePreparedEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "www.youtube-nocookie.com" &&
      url.pathname === "/embed/CjXnBXQWNb0" &&
      !url.search
    );
  } catch {
    return false;
  }
}

export type PreparedGoalsResult = {
  query: string;
  playerUrl: null;
  shots: [];
  count: 0;
  error: string | null;
  mode: "prepared-source-corpus";
  available: boolean;
  sourceUrl: string | null;
  sourceEmbedUrl: string | null;
  title: string | null;
  collectionId: string;
  videoId: string | null;
  provenance: string;
};

export function preparedGoalsResult(query: string): PreparedGoalsResult {
  const normalized = query.toLowerCase();
  const supportsSaka = /(saka|bukayo)/.test(normalized);

  if (supportsSaka) {
    return {
      query,
      playerUrl: null,
      shots: [],
      count: 0,
      error: null,
      mode: "prepared-source-corpus",
      available: true,
      sourceUrl: SAKA_SOURCE_URL,
      sourceEmbedUrl: SAKA_EMBED_URL,
      title: preparedSakaVideoRecord.title,
      collectionId: manifest.collectionId,
      videoId: preparedSakaVideoRecord.videoId,
      provenance:
        "Prepared source-corpus fallback; not a fresh VideoDB search or compiled reel.",
    };
  }

  return {
    query,
    playerUrl: null,
    shots: [],
    count: 0,
    error:
      "Fresh VideoDB semantic search is unavailable in this prepared public showcase. Try the Saka source compilation.",
    mode: "prepared-source-corpus",
    available: false,
    sourceUrl: null,
    sourceEmbedUrl: null,
    title: null,
    collectionId: manifest.collectionId,
    videoId: null,
    provenance:
      "Prepared source-corpus fallback; not a fresh VideoDB search or compiled reel.",
  };
}

export function preparedOracleProjection(player: Gunner) {
  const expectedGoals = player.position === "FORWARD" ? 0.61 : player.position === "MIDFIELDER" ? 0.32 : 0.1;
  const win = player.nation === "Spain" || player.nation === "Brazil" || player.nation === "France" ? 55.4 : 49.2;
  const draw = 24.7;
  return {
    win,
    draw,
    loss: Number((100 - win - draw).toFixed(1)),
    expGoals: expectedGoals,
    expAssists: Number((expectedGoals * 0.6).toFixed(2)),
  };
}
