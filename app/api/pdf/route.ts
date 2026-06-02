import { ensureLotterySchema, getSql, hasDatabaseUrl, SETTINGS_ID } from "../../../lib/lottery-db";
import { isLotteryComplete } from "../../../lib/lottery-counts";

export const runtime = "nodejs";

type PrizeResult = {
  order: number;
  batch: number;
  prize: string;
  ticket: string;
  drawnAt: string;
};

type PdfPayload = {
  schoolName?: string;
  eventTitle?: string;
  expectedTotal?: number;
  generatedAt?: string;
  results?: PrizeResult[];
};

type PdfMakeLike = {
  vfs?: Record<string, string>;
  addVirtualFileSystem?: (vfs: Record<string, string>) => void;
  createPdf: (definition: unknown) => {
    getBuffer: (callback: (buffer: Uint8Array) => void) => void;
  };
};

type PdfFontsLike = {
  vfs?: Record<string, string>;
  default?: Record<string, string> | { vfs?: Record<string, string> };
  pdfMake?: {
    vfs?: Record<string, string>;
  };
};

type PersistedResultRow = {
  order_number: number;
  batch: number;
  prize: string;
  ticket: string;
  drawn_at: Date | string;
};

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function hasVfs(value: unknown): value is { vfs: Record<string, string> } {
  return Boolean(value && typeof value === "object" && "vfs" in value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.values(value).every((item) => typeof item === "string");
}

function resolveVfs(pdfFonts: PdfFontsLike) {
  if (pdfFonts.vfs) {
    return pdfFonts.vfs;
  }

  if (hasVfs(pdfFonts.default)) {
    return pdfFonts.default.vfs;
  }

  if (pdfFonts.pdfMake?.vfs) {
    return pdfFonts.pdfMake.vfs;
  }

  if (isStringRecord(pdfFonts.default)) {
    return pdfFonts.default;
  }

  return undefined;
}

function formatGreekDate(value: string) {
  try {
    return new Intl.DateTimeFormat("el-GR", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Europe/Athens",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function normalizeResults(results: unknown) {
  if (!Array.isArray(results)) {
    return [];
  }

  return results
    .map((result, index) => {
      const item = result as Partial<PrizeResult>;

      return {
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1,
        batch: Number.isFinite(Number(item.batch)) ? Number(item.batch) : 1,
        prize: cleanText(item.prize, "-"),
        ticket: cleanText(item.ticket, "-"),
        drawnAt: cleanText(item.drawnAt, new Date().toISOString()),
      };
    })
    .slice(0, 1000);
}

const ticketCollator = new Intl.Collator("el-GR", {
  numeric: true,
  sensitivity: "base",
});

function sortResultsByTicket(results: PrizeResult[]) {
  return [...results].sort(
    (left, right) =>
      ticketCollator.compare(left.ticket, right.ticket) || left.order - right.order,
  );
}

function toIsoDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function resolvePdfPayload(request: Request): Promise<PdfPayload> {
  if (!hasDatabaseUrl()) {
    const payload = (await request.json()) as PdfPayload;
    const expectedTotal = Number(payload.expectedTotal);
    const results = normalizeResults(payload.results);

    if (!Number.isFinite(expectedTotal) || expectedTotal <= 0 || results.length < expectedTotal) {
      throw new Response("Lottery is not complete", { status: 409 });
    }

    return {
      ...payload,
      results,
    };
  }

  await ensureLotterySchema();
  const sql = getSql();
  const [settings] = await sql`
    select school_name, event_title, booklet_input, ticket_input, prize_input
    from lottery_settings
    where id = ${SETTINGS_ID}
    limit 1
  `;
  const results = await sql<PersistedResultRow[]>`
    select order_number, batch, prize, ticket, drawn_at
    from lottery_results
    order by order_number asc
  `;
  const state = {
    bookletInput: settings?.booklet_input ?? "",
    prizeInput: settings?.prize_input ?? "",
    results,
    ticketInput: settings?.ticket_input ?? "",
  };

  if (!isLotteryComplete(state)) {
    throw new Response("Lottery is not complete", {
      status: 409,
    });
  }

  return {
    eventTitle: settings?.event_title,
    generatedAt: new Date().toISOString(),
    results: results.map((result) => ({
      order: result.order_number,
      batch: result.batch,
      prize: result.prize,
      ticket: result.ticket,
      drawnAt: toIsoDate(result.drawn_at),
    })),
    schoolName: settings?.school_name,
  };
}

export async function POST(request: Request) {
  try {
    const payload = await resolvePdfPayload(request);
    const schoolName = cleanText(payload.schoolName, "19ο Δημοτικό Σχολείο Θεσσαλονίκης");
    const eventTitle = cleanText(payload.eventTitle, "Σχολική γιορτή λήξης σχολικού έτους");
    const generatedAt = cleanText(payload.generatedAt, new Date().toISOString());
    const results = normalizeResults(payload.results);

    if (results.length === 0) {
      return Response.json({ error: "No results supplied" }, { status: 400 });
    }

    const sortedResults = sortResultsByTicket(results);

    const [pdfMakeModule, pdfFontsModule] = await Promise.all([
      import("pdfmake/build/pdfmake"),
      import("pdfmake/build/vfs_fonts"),
    ]);
    const pdfMake = ("default" in pdfMakeModule ? pdfMakeModule.default : pdfMakeModule) as PdfMakeLike;
    const pdfFonts = pdfFontsModule as PdfFontsLike;
    const vfs = resolveVfs(pdfFonts);

    if (!vfs) {
      throw new Error("PDF fonts were not loaded");
    }

    if (typeof pdfMake.addVirtualFileSystem === "function") {
      pdfMake.addVirtualFileSystem(vfs);
    } else {
      pdfMake.vfs = vfs;
    }

    const tableBody = [
      [
        { text: "Δώρο #", style: "tableHeader" },
        { text: "Λαχνός", style: "tableHeader" },
        { text: "Δώρο", style: "tableHeader" },
        { text: "Παρτίδα", style: "tableHeader" },
        { text: "Ώρα", style: "tableHeader" },
      ],
      ...sortedResults.map((result) => [
        String(result.order),
        { text: result.ticket, style: "ticket" },
        result.prize,
        String(result.batch),
        formatGreekDate(result.drawnAt),
      ]),
    ];

    const docDefinition = {
      pageSize: "A4",
      pageMargins: [34, 42, 34, 38],
      info: {
        title: `Αποτελέσματα κλήρωσης - ${schoolName}`,
        author: schoolName,
        subject: eventTitle,
      },
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          {
            text: `${currentPage}/${pageCount}`,
            alignment: "right",
            margin: [0, 0, 34, 0],
            color: "#667085",
            fontSize: 8,
          },
        ],
      }),
      content: [
        { text: schoolName, style: "school" },
        { text: eventTitle, style: "title" },
        {
          text: `Τελική λίστα αποτελεσμάτων • ${formatGreekDate(generatedAt)}`,
          style: "meta",
        },
        {
          table: {
            headerRows: 1,
            widths: [32, 68, "*", 50, 96],
            body: tableBody,
          },
          layout: {
            fillColor: (rowIndex: number) => (rowIndex === 0 ? "#0f766e" : null),
            hLineColor: () => "#d0d5dd",
            vLineColor: () => "#d0d5dd",
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 5,
            paddingBottom: () => 5,
          },
        },
      ],
      defaultStyle: {
        font: "Roboto",
        fontSize: 9,
        color: "#17202a",
      },
      styles: {
        school: {
          fontSize: 14,
          bold: true,
          color: "#0f766e",
          margin: [0, 0, 0, 4],
        },
        title: {
          fontSize: 20,
          bold: true,
          margin: [0, 0, 0, 6],
        },
        meta: {
          fontSize: 9,
          color: "#667085",
          margin: [0, 0, 0, 16],
        },
        tableHeader: {
          bold: true,
          color: "#ffffff",
          fontSize: 8,
        },
        ticket: {
          bold: true,
          color: "#9a5b00",
        },
      },
    };

    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      pdfMake.createPdf(docDefinition).getBuffer((buffer: Uint8Array) => {
        resolve(Buffer.from(buffer));
      });
    });

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="apotelesmata-klirosis-19o-dimotiko.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error(error);
    return Response.json({ error: "PDF generation failed" }, { status: 500 });
  }
}
