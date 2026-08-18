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
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    )
  `;
  return sql;
}

export function requestIdentity(headers: Headers) {
  const source = (headers.get("x-forwarded-for") ?? "anonymous").split(",")[0].trim();
  const salt = process.env.ARSENAL_REQUEST_SALT ?? "arsenal-public-v1";
  return crypto.createHash("sha256").update(`${salt}:${source}`).digest("hex");
}

export async function beginRun(feature: string, identity: string, input: unknown, limitPerHour = 20) {
  const sql = await ensureSchema();
  const id = crypto.randomUUID();
  if (!sql) return id;
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM arsenal_demo_runs
    WHERE requester_hash=${identity} AND created_at > now() - interval '1 hour'
  `;
  if (count >= limitPerHour) throw new Error("PUBLIC_RATE_LIMIT");
  await sql`INSERT INTO arsenal_demo_runs
    (id, feature, requester_hash, input, provider, status)
    VALUES (${id}, ${feature}, ${identity}, ${sql.json(input as never)}, 'pending', 'running')`;
  return id;
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
