import { getServerSession } from "next-auth";

import { authOptions, type AppSession, isAdminSession } from "../../../lib/auth";
import { ensureLotterySchema, getSql, hasDatabaseUrl, SETTINGS_ID } from "../../../lib/lottery-db";
import { getLotteryCounts } from "../../../lib/lottery-counts";

export const runtime = "nodejs";

type PrizeResult = {
  id: string;
  order: number;
  batch: number;
  prize: string;
  ticket: string;
  drawnAt: string;
  imageUrl?: string;
  visualKey?: string;
};

type LotteryState = {
  schoolName: string;
  eventTitle: string;
  bookletInput: string;
  ticketInput: string;
  prizeInput: string;
  batchSize: number;
  intervalSeconds: number;
  results: PrizeResult[];
};

type PersistedResultRow = {
  id: string;
  order_number: number;
  batch: number;
  prize: string;
  ticket: string;
  drawn_at: Date | string;
  image_url: string | null;
  visual_key: string | null;
};

const defaultState: LotteryState = {
  schoolName: "19ο Δημοτικό Σχολείο Θεσσαλονίκης",
  eventTitle: "Σχολική γιορτή λήξης σχολικού έτους",
  bookletInput: "",
  ticketInput: "",
  prizeInput: "",
  batchSize: 10,
  intervalSeconds: 5,
  results: [],
};

function cleanString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return new Date().toISOString();
  }

  return new Date(value).toISOString();
}

function normalizeResult(result: unknown, index: number): PrizeResult {
  const item = result && typeof result === "object" ? (result as Partial<PrizeResult>) : {};
  const order = clampNumber(item.order, index + 1, 1, 10000);
  const batch = clampNumber(item.batch, 1, 1, 10000);
  const prize = cleanString(item.prize, "-").trim() || "-";
  const ticket = cleanString(item.ticket, "-").trim() || "-";
  const drawnAt = normalizeDate(item.drawnAt);
  const id = cleanString(item.id, `${order}-${ticket}-${drawnAt}`);
  const imageUrl = cleanString(item.imageUrl, "").trim();
  const visualKey = cleanString(item.visualKey, "").trim();

  return {
    id,
    order,
    batch,
    prize,
    ticket,
    drawnAt,
    imageUrl: imageUrl || undefined,
    visualKey: visualKey || undefined,
  };
}

function normalizeState(value: unknown): LotteryState {
  const raw = value && typeof value === "object" ? (value as Partial<LotteryState>) : {};
  const results = Array.isArray(raw.results)
    ? raw.results.map(normalizeResult).slice(0, 1000)
    : [];

  return {
    schoolName: cleanString(raw.schoolName, defaultState.schoolName),
    eventTitle: cleanString(raw.eventTitle, defaultState.eventTitle),
    bookletInput: cleanString(raw.bookletInput, ""),
    ticketInput: cleanString(raw.ticketInput, ""),
    prizeInput: cleanString(raw.prizeInput, ""),
    batchSize: clampNumber(raw.batchSize, defaultState.batchSize, 1, 50),
    intervalSeconds: clampNumber(raw.intervalSeconds, defaultState.intervalSeconds, 1, 30),
    results,
  };
}

function toIsoDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function sanitizeViewerState(state: LotteryState): LotteryState {
  return {
    ...state,
    bookletInput: "",
    ticketInput: "",
    prizeInput: "",
  };
}

export async function GET() {
  const session = (await getServerSession(authOptions)) as AppSession | null;
  const isAuthenticated = Boolean(session);
  const isAdmin = isAdminSession(session);

  if (!hasDatabaseUrl()) {
    return Response.json({
      databaseAvailable: false,
      permissions: { isAdmin, isAuthenticated },
      publicStats: getLotteryCounts(defaultState),
      state: isAdmin ? defaultState : sanitizeViewerState(defaultState),
    });
  }

  try {
    await ensureLotterySchema();
    const sql = getSql();
    const [settings] = await sql`
      select school_name, event_title, booklet_input, ticket_input, prize_input,
        batch_size, interval_seconds
      from lottery_settings
      where id = ${SETTINGS_ID}
      limit 1
    `;
    const results = await sql<PersistedResultRow[]>`
      select id, order_number, batch, prize, ticket, drawn_at, image_url, visual_key
      from lottery_results
      order by order_number asc
    `;

    const state: LotteryState = {
      schoolName: settings?.school_name ?? defaultState.schoolName,
      eventTitle: settings?.event_title ?? defaultState.eventTitle,
      bookletInput: settings?.booklet_input ?? "",
      ticketInput: settings?.ticket_input ?? "",
      prizeInput: settings?.prize_input ?? "",
      batchSize: settings?.batch_size ?? defaultState.batchSize,
      intervalSeconds: settings?.interval_seconds ?? defaultState.intervalSeconds,
      results: results.map((result) => ({
        id: result.id,
        order: result.order_number,
        batch: result.batch,
        prize: result.prize,
        ticket: result.ticket,
        drawnAt: toIsoDate(result.drawn_at),
        imageUrl: result.image_url ?? undefined,
        visualKey: result.visual_key ?? undefined,
      })),
    };

    return Response.json({
      databaseAvailable: true,
      permissions: { isAdmin, isAuthenticated },
      publicStats: getLotteryCounts(state),
      state: isAdmin ? state : sanitizeViewerState(state),
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        databaseAvailable: false,
        error: "Database read failed",
        permissions: { isAdmin, isAuthenticated },
        publicStats: getLotteryCounts(defaultState),
        state: isAdmin ? defaultState : sanitizeViewerState(defaultState),
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const session = (await getServerSession(authOptions)) as AppSession | null;

  if (!session) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!isAdminSession(session)) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  if (!hasDatabaseUrl()) {
    return Response.json(
      { databaseAvailable: false, error: "DATABASE_URL is not configured" },
      { status: 503 },
    );
  }

  try {
    const payload = await request.json();
    const state = normalizeState((payload as { state?: unknown }).state ?? payload);

    await ensureLotterySchema();
    const sql = getSql();

    await sql.begin(async (transaction) => {
      await transaction`
        insert into lottery_settings (
          id, school_name, event_title, booklet_input, ticket_input,
          prize_input, batch_size, interval_seconds, updated_at
        )
        values (
          ${SETTINGS_ID}, ${state.schoolName}, ${state.eventTitle}, ${state.bookletInput},
          ${state.ticketInput}, ${state.prizeInput}, ${state.batchSize},
          ${state.intervalSeconds}, now()
        )
        on conflict (id) do update set
          school_name = excluded.school_name,
          event_title = excluded.event_title,
          booklet_input = excluded.booklet_input,
          ticket_input = excluded.ticket_input,
          prize_input = excluded.prize_input,
          batch_size = excluded.batch_size,
          interval_seconds = excluded.interval_seconds,
          updated_at = now()
      `;

      await transaction`delete from lottery_results`;

      if (state.results.length > 0) {
        const resultRows = state.results.map((result) => ({
          id: result.id,
          order_number: result.order,
          batch: result.batch,
          prize: result.prize,
          ticket: result.ticket,
          drawn_at: result.drawnAt,
          image_url: result.imageUrl ?? null,
          visual_key: result.visualKey ?? null,
        }));

        await transaction`
          insert into lottery_results ${transaction(
            resultRows,
            "id",
            "order_number",
            "batch",
            "prize",
            "ticket",
            "drawn_at",
            "image_url",
            "visual_key",
          )}
        `;
      }
    });

    return Response.json({ databaseAvailable: true, ok: true });
  } catch (error) {
    console.error(error);
    return Response.json(
      { databaseAvailable: true, error: "Database write failed" },
      { status: 500 },
    );
  }
}
