import crypto from "node:crypto";
import postgres from "postgres";

let client: ReturnType<typeof postgres> | null = null;

function sqlClient() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) {
    const url = process.env.DATABASE_URL.replace("sslmode=no-verify", "sslmode=require");
    client = postgres(url, { max: 2, idle_timeout: 20, connect_timeout: 10 });
  }
  return client;
}

async function ensureSchema() {
  const sql = sqlClient();
  if (!sql) return null;
  await sql`
    CREATE TABLE IF NOT EXISTS arsenal_demo_runs (
      id UUID PRIMARY KEY,
      feature TEXT NOT NULL,
      requester_hash TEXT NOT NULL,
      input JSONB NOT NULL,
      output JSONB,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      idempotency_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    )
  `;
  await sql`ALTER TABLE arsenal_demo_runs ADD COLUMN IF NOT EXISTS idempotency_key TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS arsenal_demo_runs_idempotency
    ON arsenal_demo_runs (feature, requester_hash, idempotency_key)
    WHERE idempotency_key IS NOT NULL`;
  return sql;
}

export function requestIdentity(headers: Headers) {
  const source = (headers.get("x-forwarded-for") ?? "anonymous").split(",")[0].trim();
  const salt = process.env.ARSENAL_REQUEST_SALT ?? "arsenal-public-v1";
  return crypto.createHash("sha256").update(`${salt}:${source}`).digest("hex");
}

export type LiveRunStart = {
  id: string;
  replayed: boolean;
  status: string;
  output: unknown | null;
};

export async function beginRun(
  feature: string,
  identity: string,
  input: unknown,
  limitPerHour = 20,
  idempotencyKey?: string | null,
): Promise<LiveRunStart> {
  const sql = await ensureSchema();
  const id = crypto.randomUUID();
  if (!sql) return { id, replayed: false, status: "running", output: null };
  const key = idempotencyKey?.trim() || null;
  if (key && key.length > 120) throw new Error("INVALID_IDEMPOTENCY_KEY");
  if (key) {
    const [existing] = await sql<{ id: string; status: string; output: unknown | null }[]>`
      SELECT id, status, output FROM arsenal_demo_runs
      WHERE feature=${feature} AND requester_hash=${identity} AND idempotency_key=${key}
    `;
    if (existing) return { ...existing, replayed: true };
  }
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM arsenal_demo_runs
    WHERE requester_hash=${identity} AND created_at > now() - interval '1 hour'
  `;
  if (count >= limitPerHour) throw new Error("PUBLIC_RATE_LIMIT");
  await sql`INSERT INTO arsenal_demo_runs
    (id, feature, requester_hash, input, provider, status, idempotency_key)
    VALUES (${id}, ${feature}, ${identity}, ${sql.json(input as never)}, 'pending', 'running', ${key})`;
  return { id, replayed: false, status: "running", output: null };
}

export async function finishRun(id: string, provider: string, output: unknown) {
  const sql = sqlClient();
  if (!sql) return;
  await sql`UPDATE arsenal_demo_runs SET provider=${provider}, output=${sql.json(output as never)},
    status='done', completed_at=now() WHERE id=${id}`;
}

export async function failRun(id: string, error: unknown) {
  const sql = sqlClient();
  if (!sql) return;
  const message = error instanceof Error ? error.message.slice(0, 240) : "provider request failed";
  await sql`UPDATE arsenal_demo_runs SET status='failed', error=${message}, completed_at=now() WHERE id=${id}`;
}
