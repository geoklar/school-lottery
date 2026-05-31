import postgres from "postgres";

type SqlClient = ReturnType<typeof postgres>;

const SETTINGS_ID = "default";

const globalForPostgres = globalThis as typeof globalThis & {
  lotterySql?: SqlClient;
};

function getDatabaseUrl() {
  return process.env.DATABASE_URL;
}

export function hasDatabaseUrl() {
  return Boolean(getDatabaseUrl());
}

export function getSql() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!globalForPostgres.lotterySql) {
    const shouldUseSsl =
      !databaseUrl.includes("localhost") &&
      !databaseUrl.includes("127.0.0.1") &&
      !databaseUrl.includes("sslmode=disable");

    globalForPostgres.lotterySql = postgres(databaseUrl, {
      connect_timeout: 10,
      idle_timeout: 20,
      max: 3,
      ssl: shouldUseSsl ? "require" : false,
    });
  }

  return globalForPostgres.lotterySql;
}

export async function ensureLotterySchema() {
  const sql = getSql();

  await sql`
    create table if not exists lottery_settings (
      id text primary key default 'default',
      school_name text not null default '19ο Δημοτικό Σχολείο Θεσσαλονίκης',
      event_title text not null default 'Σχολική γιορτή λήξης σχολικού έτους',
      booklet_input text not null default '',
      ticket_input text not null default '',
      prize_input text not null default '',
      batch_size integer not null default 10 check (batch_size between 1 and 50),
      interval_seconds integer not null default 5 check (interval_seconds between 1 and 30),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists lottery_results (
      id text primary key,
      order_number integer not null,
      batch integer not null,
      prize text not null,
      ticket text not null,
      drawn_at timestamptz not null,
      image_url text,
      visual_key text,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create index if not exists lottery_results_order_number_idx
    on lottery_results (order_number)
  `;

  await sql`
    insert into lottery_settings (id)
    values (${SETTINGS_ID})
    on conflict (id) do nothing
  `;
}

export { SETTINGS_ID };
