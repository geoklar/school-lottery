"use client";

import {
  AlertTriangle,
  Bike,
  BookOpen,
  Database,
  Download,
  FileText,
  Gift,
  Gamepad2,
  Music,
  Palette,
  Pause,
  Play,
  RefreshCcw,
  School,
  Settings,
  Shirt,
  Shuffle,
  Smartphone,
  Ticket,
  Trash2,
  Trophy,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type DrawStatus = "ready" | "running" | "paused" | "done";
type ActiveSection = "draw" | "admin";
type StorageMode = "loading" | "database" | "local" | "error";
type PrizeVisualKey =
  | "bike"
  | "book"
  | "voucher"
  | "toy"
  | "sport"
  | "tech"
  | "food"
  | "art"
  | "clothes"
  | "music"
  | "generic";

type PrizeItem = {
  name: string;
  imageUrl?: string;
  visualKey: PrizeVisualKey;
};

type PrizeResult = {
  id: string;
  order: number;
  batch: number;
  prize: string;
  ticket: string;
  drawnAt: string;
  imageUrl?: string;
  visualKey?: PrizeVisualKey;
};

type DrawPlanItem = Omit<PrizeResult, "id" | "batch" | "drawnAt">;

type SavedState = {
  schoolName: string;
  eventTitle: string;
  bookletInput: string;
  ticketInput: string;
  prizeInput: string;
  batchSize: number;
  intervalSeconds: number;
  results: PrizeResult[];
};

const STORAGE_KEY = "school-lottery-state-v1";
const BOOKLET_SIZE = 50;
const prizeVisuals: Record<
  PrizeVisualKey,
  {
    Icon: LucideIcon;
    label: string;
  }
> = {
  bike: { Icon: Bike, label: "Ποδήλατο" },
  book: { Icon: BookOpen, label: "Βιβλία" },
  voucher: { Icon: Ticket, label: "Δωροεπιταγή" },
  toy: { Icon: Gamepad2, label: "Παιχνίδι" },
  sport: { Icon: Trophy, label: "Άθληση" },
  tech: { Icon: Smartphone, label: "Τεχνολογία" },
  food: { Icon: Utensils, label: "Γεύση" },
  art: { Icon: Palette, label: "Δημιουργικό" },
  clothes: { Icon: Shirt, label: "Ένδυση" },
  music: { Icon: Music, label: "Μουσική" },
  generic: { Icon: Gift, label: "Δώρο" },
};

function splitTicketTokens(value: string) {
  return value
    .replace(/[;,]+/g, "\n")
    .split(/\n+/)
    .flatMap((line) => line.trim().split(/\s+/))
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeSearchText(value: string) {
  return value
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inferPrizeVisualKey(prizeName: string): PrizeVisualKey {
  const value = normalizeSearchText(prizeName);

  if (["ποδηλα", "bike", "bicycle"].some((keyword) => value.includes(keyword))) {
    return "bike";
  }

  if (["βιβλιο", "book", "βιβλιοπωλει"].some((keyword) => value.includes(keyword))) {
    return "book";
  }

  if (
    ["δωροεπιταγ", "επιταγ", "voucher", "κουπον", "gift card"].some((keyword) =>
      value.includes(keyword),
    )
  ) {
    return "voucher";
  }

  if (
    ["παιχνιδ", "επιτραπεζ", "lego", "puzzle", "game"].some((keyword) =>
      value.includes(keyword),
    )
  ) {
    return "toy";
  }

  if (
    ["μπαλ", "αθλητικ", "ποδοσφαιρ", "μπασκετ", "sport", "ρακετ"].some((keyword) =>
      value.includes(keyword),
    )
  ) {
    return "sport";
  }

  if (
    ["tablet", "κινητ", "smartphone", "ακουστικ", "headphone", "usb", "powerbank"].some(
      (keyword) => value.includes(keyword),
    )
  ) {
    return "tech";
  }

  if (
    ["γλυκ", "σοκολα", "φαγη", "καφε", "pizza", "πιτσα", "παγωτ", "εστιατορ"].some(
      (keyword) => value.includes(keyword),
    )
  ) {
    return "food";
  }

  if (
    ["ζωγραφ", "χρωμα", "καμβα", "art", "χειροτεχν", "μαρκαδορ"].some((keyword) =>
      value.includes(keyword),
    )
  ) {
    return "art";
  }

  if (
    ["μπλουζ", "ρουχο", "ενδυ", "παπουτσ", "τσαντ", "shirt", "shoe", "bag"].some((keyword) =>
      value.includes(keyword),
    )
  ) {
    return "clothes";
  }

  if (["μουσικ", "ηχει", "speaker", "music"].some((keyword) => value.includes(keyword))) {
    return "music";
  }

  return "generic";
}

function isLikelyImageUrl(value: string) {
  return /^(https?:\/\/|data:image\/|\/)/i.test(value.trim());
}

function expandTicketToken(token: string) {
  const rangeMatch = token.match(/^(\d+)\s*[-–]\s*(\d+)$/);

  if (!rangeMatch) {
    return [token];
  }

  const start = Number(rangeMatch[1]);
  const end = Number(rangeMatch[2]);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return [token];
  }

  const width =
    rangeMatch[1].startsWith("0") || rangeMatch[2].startsWith("0")
      ? Math.max(rangeMatch[1].length, rangeMatch[2].length)
      : 0;
  const step = start <= end ? 1 : -1;
  const tickets: string[] = [];

  for (let current = start; step > 0 ? current <= end : current >= end; current += step) {
    tickets.push(width > 0 ? String(current).padStart(width, "0") : String(current));
  }

  return tickets;
}

function parseTickets(value: string) {
  const seen = new Set<string>();
  const tickets: string[] = [];

  for (const token of splitTicketTokens(value)) {
    for (const ticket of expandTicketToken(token)) {
      const normalized = ticket.trim();

      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      tickets.push(normalized);
    }
  }

  return tickets;
}

function parseBooklets(value: string) {
  const seen = new Set<string>();
  const tickets: string[] = [];
  let bookletCount = 0;

  const addTicket = (ticket: string) => {
    if (!ticket || seen.has(ticket)) {
      return;
    }

    seen.add(ticket);
    tickets.push(ticket);
  };

  for (const token of splitTicketTokens(value)) {
    const rangeMatch = token.match(/^(\d+)\s*[-–]\s*(\d+)$/);

    if (rangeMatch) {
      const expanded = expandTicketToken(token);
      expanded.forEach(addTicket);
      bookletCount += 1;
      continue;
    }

    if (!/^\d+$/.test(token)) {
      continue;
    }

    addTicket(token);
    bookletCount += 1;
  }

  return { bookletCount, tickets };
}

function mergeTickets(...ticketGroups: string[][]) {
  const seen = new Set<string>();
  const tickets: string[] = [];

  for (const group of ticketGroups) {
    for (const ticket of group) {
      if (seen.has(ticket)) {
        continue;
      }

      seen.add(ticket);
      tickets.push(ticket);
    }
  }

  return tickets;
}

function formatTicketGroupRange(groupTickets: string[]) {
  const firstTicket = groupTickets[0];
  const lastTicket = groupTickets.at(-1);

  if (!firstTicket || !lastTicket) {
    return "-";
  }

  if (firstTicket === lastTicket) {
    return firstTicket;
  }

  return `${firstTicket}-${lastTicket}`;
}

function makeTicketGroups(tickets: string[], groupSize: number) {
  const groups: string[][] = [];

  for (let index = 0; index < tickets.length; index += groupSize) {
    groups.push(tickets.slice(index, index + groupSize));
  }

  return groups.map((groupTickets, index) => ({
    id: `${index}-${groupTickets[0] ?? "empty"}`,
    order: index + 1,
    count: groupTickets.length,
    range: formatTicketGroupRange(groupTickets),
  }));
}

function parsePrizes(value: string) {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map<PrizeItem>((line) => {
      const [rawName, ...rest] = line.split("|");
      const name = rawName.trim();
      const possibleImageUrl = rest.join("|").trim();

      return {
        name,
        imageUrl: isLikelyImageUrl(possibleImageUrl) ? possibleImageUrl : undefined,
        visualKey: inferPrizeVisualKey(name),
      };
    });
}

function randomInt(maxExclusive: number) {
  const randomValues = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
  let value = 0;

  do {
    window.crypto.getRandomValues(randomValues);
    value = randomValues[0];
  } while (value >= limit);

  return value % maxExclusive;
}

function shuffle<T>(items: T[]) {
  const array = [...items];

  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }

  return array;
}

function makeDrawPlan(tickets: string[], prizes: PrizeItem[]) {
  const shuffledTickets = shuffle(tickets);
  const total = Math.min(shuffledTickets.length, prizes.length);

  return prizes.slice(0, total).map<DrawPlanItem>((prize, index) => {
    const ticket = shuffledTickets[index];

    return {
      order: index + 1,
      prize: prize.name,
      ticket,
      imageUrl: prize.imageUrl,
      visualKey: prize.visualKey,
    };
  });
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat("el-GR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function PrizeVisual({
  imageUrl,
  prizeName,
  size = "regular",
  visualKey,
}: {
  imageUrl?: string;
  prizeName: string;
  size?: "regular" | "small";
  visualKey?: PrizeVisualKey;
}) {
  if (imageUrl) {
    return (
      <div
        aria-label={prizeName}
        className={`prize-visual ${size} image`}
        role="img"
        style={{ backgroundImage: `url("${imageUrl}")` }}
      />
    );
  }

  const key = visualKey ?? inferPrizeVisualKey(prizeName);
  const { Icon, label } = prizeVisuals[key];

  return (
    <div className={`prize-visual ${size} theme-${key}`} title={label}>
      <Icon size={size === "small" ? 18 : 34} />
    </div>
  );
}

export default function Home() {
  const [schoolName, setSchoolName] = useState("19ο Δημοτικό Σχολείο Θεσσαλονίκης");
  const [eventTitle, setEventTitle] = useState("Σχολική γιορτή λήξης σχολικού έτους");
  const [bookletInput, setBookletInput] = useState("");
  const [ticketInput, setTicketInput] = useState("");
  const [prizeInput, setPrizeInput] = useState("");
  const [batchSize, setBatchSize] = useState(10);
  const [intervalSeconds, setIntervalSeconds] = useState(5);
  const [results, setResults] = useState<PrizeResult[]>([]);
  const [drawPlan, setDrawPlan] = useState<DrawPlanItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [drawStatus, setDrawStatus] = useState<DrawStatus>("ready");
  const [countdown, setCountdown] = useState(5);
  const [toast, setToast] = useState("");
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [hasLoadedSavedState, setHasLoadedSavedState] = useState(false);
  const [activeSection, setActiveSection] = useState<ActiveSection>("draw");
  const [storageMode, setStorageMode] = useState<StorageMode>("loading");
  const [isRemoteSaving, setIsRemoteSaving] = useState(false);

  const bookletData = useMemo(() => parseBooklets(bookletInput), [bookletInput]);
  const manualTickets = useMemo(() => parseTickets(ticketInput), [ticketInput]);
  const tickets = useMemo(
    () => mergeTickets(bookletData.tickets, manualTickets),
    [bookletData, manualTickets],
  );
  const ticketGroups = useMemo(() => makeTicketGroups(tickets, BOOKLET_SIZE), [tickets]);
  const prizes = useMemo(() => parsePrizes(prizeInput), [prizeInput]);
  const remaining = Math.max(0, drawPlan.length - cursor);
  const latestBatch = results.at(-1)?.batch ?? 0;
  const canStart =
    tickets.length > 0 &&
    prizes.length > 0 &&
    drawStatus !== "running" &&
    (drawStatus === "paused" || results.length === 0);
  const canDownloadPdf = results.length > 0 && !isPdfLoading;
  const hasShortTicketList = tickets.length > 0 && prizes.length > tickets.length;
  const startButtonLabel =
    drawStatus === "paused" ? "Συνέχεια" : drawStatus === "done" ? "Ολοκληρώθηκε" : "Εκκίνηση";
  const storageLabel =
    storageMode === "database"
      ? isRemoteSaving
        ? "Αποθήκευση..."
        : "Postgres"
      : storageMode === "error"
        ? "Σφάλμα DB"
        : storageMode === "loading"
          ? "Φόρτωση"
          : "Τοπικά";

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
  }, []);

  const revealNextBatch = useCallback(() => {
    const nextItems = drawPlan.slice(cursor, cursor + batchSize);

    if (nextItems.length === 0) {
      setDrawStatus("done");
      return;
    }

    const now = new Date().toISOString();
    const nextCursor = cursor + nextItems.length;

    setResults((currentResults) => {
      const nextBatch = (currentResults.at(-1)?.batch ?? 0) + 1;
      const nextResults = nextItems.map<PrizeResult>((item) => ({
        ...item,
        id: `${item.order}-${item.ticket}-${now}`,
        batch: nextBatch,
        drawnAt: now,
      }));

      return [...currentResults, ...nextResults];
    });
    setCursor(nextCursor);

    if (nextCursor >= drawPlan.length) {
      setDrawStatus("done");
    }
  }, [batchSize, cursor, drawPlan]);

  const startDraw = useCallback(() => {
    if (drawStatus === "paused") {
      setCountdown(intervalSeconds);
      setDrawStatus("running");
      return;
    }

    if (!tickets.length || !prizes.length) {
      showToast("Συμπλήρωσε πρώτα λαχνούς και δώρα.");
      return;
    }

    if (results.length > 0) {
      const confirmed = window.confirm("Να ξεκινήσει νέα κλήρωση και να αντικατασταθούν τα αποτελέσματα;");

      if (!confirmed) {
        return;
      }
    }

    const nextPlan = makeDrawPlan(tickets, prizes);

    if (!nextPlan.length) {
      showToast("Δεν υπάρχουν αρκετά στοιχεία για κλήρωση.");
      return;
    }

    setDrawPlan(nextPlan);
    setResults([]);
    setCursor(0);
    setCountdown(intervalSeconds);
    setDrawStatus("running");

    const now = new Date().toISOString();
    const firstItems = nextPlan.slice(0, batchSize);
    setResults(
      firstItems.map<PrizeResult>((item) => ({
        ...item,
        id: `${item.order}-${item.ticket}-${now}`,
        batch: 1,
        drawnAt: now,
      })),
    );
    setCursor(firstItems.length);

    if (firstItems.length >= nextPlan.length) {
      setDrawStatus("done");
    }
  }, [batchSize, drawStatus, intervalSeconds, prizes, results.length, showToast, tickets]);

  const pauseDraw = useCallback(() => {
    setDrawStatus("paused");
  }, []);

  const resetDraw = useCallback(() => {
    const confirmed =
      results.length === 0 ||
      window.confirm("Να καθαριστούν τα τρέχοντα αποτελέσματα της κλήρωσης;");

    if (!confirmed) {
      return;
    }

    setResults([]);
    setDrawPlan([]);
    setCursor(0);
    setCountdown(intervalSeconds);
    setDrawStatus("ready");
  }, [intervalSeconds, results.length]);

  const loadDemo = useCallback(() => {
    setBookletInput(
      Array.from(
        { length: 10 },
        (_, index) => `${index * BOOKLET_SIZE + 1}-${(index + 1) * BOOKLET_SIZE}`,
      ).join("\n"),
    );
    setTicketInput("");
    setPrizeInput(
      [
        "Ποδήλατο",
        "Δωροεπιταγή βιβλιοπωλείου",
        "Επιτραπέζιο παιχνίδι",
        "Μπάλα ποδοσφαίρου",
        "Tablet",
        "Σετ ζωγραφικής",
        "Παιδικά βιβλία",
        "Ακουστικά",
        "Δωροεπιταγή καφέ",
        "Σχολική τσάντα",
        "Ηχείο bluetooth",
        "Lego παιχνίδι",
        "Ρακέτες παραλίας",
        "Κουτί σοκολατάκια",
        "Μπλούζα",
        "Powerbank",
        "Παγωτό οικογενειακό",
        "Παζλ",
        "Μουσικό παιχνίδι",
        "Δώρο έκπληξη",
      ].join("\n"),
    );
    setResults([]);
    setDrawPlan([]);
    setCursor(0);
    setDrawStatus("ready");
    showToast("Προστέθηκαν δοκιμαστικοί λαχνοί και δώρα.");
  }, [showToast]);

  const clearInputs = useCallback(() => {
    const confirmed =
      !bookletInput && !ticketInput && !prizeInput
        ? true
        : window.confirm("Να καθαριστούν οι λαχνοί, τα δώρα και τα αποτελέσματα;");

    if (!confirmed) {
      return;
    }

    setBookletInput("");
    setTicketInput("");
    setPrizeInput("");
    setResults([]);
    setDrawPlan([]);
    setCursor(0);
    setDrawStatus("ready");
  }, [bookletInput, prizeInput, ticketInput]);

  const downloadPdf = useCallback(async () => {
    if (!results.length) {
      showToast("Δεν υπάρχουν ακόμα αποτελέσματα για PDF.");
      return;
    }

    setIsPdfLoading(true);

    try {
      const response = await fetch("/api/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schoolName,
          eventTitle,
          results,
          generatedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error("PDF request failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "apotelesmata-klirosis-19o-dimotiko.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("Το PDF δημιουργήθηκε.");
    } catch {
      showToast("Δεν ολοκληρώθηκε η δημιουργία PDF.");
    } finally {
      setIsPdfLoading(false);
    }
  }, [eventTitle, results, schoolName, showToast]);

  const applySavedState = useCallback((parsed: Partial<SavedState>) => {
    setSchoolName(parsed.schoolName || "19ο Δημοτικό Σχολείο Θεσσαλονίκης");
    setEventTitle(parsed.eventTitle || "Σχολική γιορτή λήξης σχολικού έτους");
    setBookletInput(parsed.bookletInput || "");
    setTicketInput(parsed.ticketInput || "");
    setPrizeInput(parsed.prizeInput || "");
    setBatchSize(clampNumber(Number(parsed.batchSize || 10), 1, 50));
    setIntervalSeconds(clampNumber(Number(parsed.intervalSeconds || 5), 1, 30));
    setCountdown(clampNumber(Number(parsed.intervalSeconds || 5), 1, 30));
    setResults(Array.isArray(parsed.results) ? parsed.results : []);
  }, []);

  const loadLocalState = useCallback(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      setStorageMode("local");
      return;
    }

    try {
      const parsed = JSON.parse(saved) as Partial<SavedState>;
      applySavedState(parsed);
      setStorageMode("local");
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      setStorageMode("local");
    }
  }, [applySavedState]);

  useEffect(() => {
    let isMounted = true;

    async function loadState() {
      try {
        const response = await fetch("/api/state", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("State request failed");
        }

        const payload = (await response.json()) as {
          databaseAvailable?: boolean;
          state?: Partial<SavedState>;
        };

        if (!isMounted) {
          return;
        }

        if (payload.databaseAvailable && payload.state) {
          applySavedState(payload.state);
          setStorageMode("database");
        } else {
          loadLocalState();
        }
      } catch {
        if (isMounted) {
          loadLocalState();
        }
      } finally {
        if (isMounted) {
          setHasLoadedSavedState(true);
        }
      }
    }

    loadState();

    return () => {
      isMounted = false;
    };
  }, [applySavedState, loadLocalState]);

  useEffect(() => {
    if (!hasLoadedSavedState) {
      return;
    }

    const state: SavedState = {
      schoolName,
      eventTitle,
      bookletInput,
      ticketInput,
      prizeInput,
      batchSize,
      intervalSeconds,
      results,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    if (storageMode !== "database" && storageMode !== "error") {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsRemoteSaving(true);

      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ state }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("State save failed");
        }

        setStorageMode("database");
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(error);
          setStorageMode("error");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsRemoteSaving(false);
        }
      }
    }, 700);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    batchSize,
    bookletInput,
    eventTitle,
    hasLoadedSavedState,
    intervalSeconds,
    prizeInput,
    results,
    schoolName,
    storageMode,
    ticketInput,
  ]);

  useEffect(() => {
    if (drawStatus !== "running" || cursor >= drawPlan.length) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCountdown((current) => {
        if (current <= 1) {
          revealNextBatch();
          return intervalSeconds;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown, cursor, drawPlan.length, drawStatus, intervalSeconds, revealNextBatch]);

  useEffect(() => {
    if (drawStatus === "done" && results.length > 0) {
      setCountdown(intervalSeconds);
    }
  }, [drawStatus, intervalSeconds, results.length]);

  return (
    <main className="shell">
      <div className="app-frame">
        <header className="topbar">
          <div className="topbar-brand">
            <div className="school-mark" aria-hidden="true">
              <School size={23} />
            </div>
            <div>
              <h1 className="panel-title">Κλήρωση δώρων</h1>
              <p className="panel-subtitle">{schoolName}</p>
            </div>
          </div>

          <div className="topbar-actions">
            <span className={`storage-pill ${storageMode}`}>
              <Database size={16} />
              {storageLabel}
            </span>

            <div className="section-tabs" aria-label="Ενότητες εφαρμογής">
              <button
                className={`tab-button ${activeSection === "draw" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveSection("draw")}
              >
                <Gift size={17} />
                Κλήρωση
              </button>
              <button
                className={`tab-button ${activeSection === "admin" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveSection("admin")}
              >
                <Settings size={17} />
                Admin
              </button>
            </div>
          </div>
        </header>

        {activeSection === "admin" ? (
        <section className="setup-panel admin-panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Admin</h2>
              <p className="panel-subtitle">Ρυθμίσεις σχολείου, λαχνών και δώρων</p>
            </div>
            <Settings size={24} aria-hidden="true" />
          </div>

          <div className="setup-body">
            <div className="admin-grid">
              <div className="admin-column">
                <label className="field">
                  <span className="label-line">Σχολείο</span>
                  <input
                    className="input"
                    value={schoolName}
                    onChange={(event) => setSchoolName(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span className="label-line">Τίτλος</span>
                  <input
                    className="input"
                    value={eventTitle}
                    onChange={(event) => setEventTitle(event.target.value)}
                  />
                </label>

                <div className="field-row">
                  <label className="field">
                    <span className="label-line">Ανά παρτίδα</span>
                    <input
                      className="input"
                      min={1}
                      max={50}
                      type="number"
                      value={batchSize}
                      onChange={(event) =>
                        setBatchSize(clampNumber(Number(event.target.value), 1, 50))
                      }
                    />
                  </label>

                  <label className="field">
                    <span className="label-line">Δευτερόλεπτα</span>
                    <select
                      className="select"
                      value={intervalSeconds}
                      onChange={(event) => {
                        const nextValue = clampNumber(Number(event.target.value), 1, 30);
                        setIntervalSeconds(nextValue);
                        setCountdown(nextValue);
                      }}
                    >
                      <option value={3}>3</option>
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                    </select>
                  </label>
                </div>

                <div className="toolbar">
                  <button className="button ghost" type="button" onClick={loadDemo}>
                    <Shuffle size={17} />
                    Δοκιμή
                  </button>
                  <button className="button ghost" type="button" onClick={clearInputs}>
                    <Trash2 size={17} />
                    Καθαρισμός
                  </button>
                </div>
              </div>

              <div className="admin-column">
                <label className="field">
                  <span className="label-line">
                    Μπλοκάκια / εύρη λαχνών
                    <span className="count-chip">{bookletData.bookletCount} εύρη</span>
                  </span>
                  <textarea
                    className="textarea"
                    value={bookletInput}
                    placeholder={"1-50\n52-60\n101-150"}
                    onChange={(event) => setBookletInput(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span className="label-line">
                    Μεμονωμένοι λαχνοί
                    <span className="count-chip">{tickets.length} συνολικά</span>
                  </span>
                  <textarea
                    className="textarea compact"
                    value={ticketInput}
                    placeholder={"702\n703\nA12"}
                    onChange={(event) => setTicketInput(event.target.value)}
                  />
                </label>

                <section className="ticket-groups" aria-live="polite">
                  <div className="ticket-groups-head">
                    <span>Ομάδες λαχνών</span>
                    <span className="count-chip">{ticketGroups.length} ομάδες</span>
                  </div>

                  {ticketGroups.length === 0 ? (
                    <div className="ticket-groups-empty">Δεν έχουν δηλωθεί λαχνοί.</div>
                  ) : (
                    <div className="ticket-group-list">
                      {ticketGroups.map((group) => (
                        <div className="ticket-group" key={group.id}>
                          <span className="ticket-group-title">Ομάδα {group.order}</span>
                          <span className="ticket-group-range">{group.range}</span>
                          <span className="ticket-group-count">{group.count} λαχνοί</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div className="admin-column">
                <label className="field">
                  <span className="label-line">
                    Δώρα
                    <span className="count-chip">{prizes.length} στη λίστα</span>
                  </span>
                  <textarea
                    className="textarea tall"
                    value={prizeInput}
                    placeholder={
                      "Ποδήλατο\nΔωροεπιταγή βιβλιοπωλείου\nΕπιτραπέζιο παιχνίδι | https://example.com/image.jpg"
                    }
                    onChange={(event) => setPrizeInput(event.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>
        </section>
        ) : (

        <section className="main-stack">
          <section className="draw-panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">{eventTitle}</h2>
                <p className="panel-subtitle">{schoolName}</p>
              </div>
              <div className="toolbar">
                {drawStatus === "running" ? (
                  <button className="button" type="button" onClick={pauseDraw}>
                    <Pause size={17} />
                    Παύση
                  </button>
                ) : (
                  <button
                    className="button primary"
                    type="button"
                    disabled={!canStart}
                    onClick={startDraw}
                  >
                    <Play size={17} />
                    {startButtonLabel}
                  </button>
                )}

                <button className="button ghost icon-only" type="button" onClick={resetDraw} title="Νέα κλήρωση">
                  <RefreshCcw size={18} />
                </button>
              </div>
            </div>

            <div className="draw-stage">
              <div className="live-area">
                <div className="status-strip">
                  <span className="status-pill">
                    <span className={`status-dot ${drawStatus}`} />
                    {drawStatus === "running"
                      ? "Σε εξέλιξη"
                      : drawStatus === "paused"
                        ? "Σε παύση"
                        : drawStatus === "done"
                          ? "Ολοκληρώθηκε"
                          : "Έτοιμη"}
                  </span>
                  <span className="status-pill">
                    <Gift size={16} />
                    {results.length} κληρώθηκαν
                  </span>
                  <span className="status-pill">
                    <Ticket size={16} />
                    {remaining} απομένουν
                  </span>
                </div>

                {results.length === 0 ? (
                  <div className="empty-stage">
                    <div>
                      <Gift size={38} />
                      <strong>Καμία κλήρωση ακόμα</strong>
                    </div>
                  </div>
                ) : (
                  <div className="live-grid">
                    {results.slice(-Math.max(batchSize, 10)).map((result) => (
                      <article
                        className={`winner-card ${result.batch === latestBatch ? "latest" : ""}`}
                        key={result.id}
                      >
                        <PrizeVisual
                          imageUrl={result.imageUrl}
                          prizeName={result.prize}
                          visualKey={result.visualKey}
                        />
                        <div className="winner-content">
                          <div className="winner-topline">
                            <span className="winner-index">#{result.order}</span>
                            <span className="winner-ticket">
                              <Ticket size={16} />
                              {result.ticket}
                            </span>
                          </div>
                          <p className="winner-prize">{result.prize}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <aside className="control-panel">
                <div className="metrics">
                  <div className="metric">
                    <span className="metric-value">{tickets.length}</span>
                    <span className="metric-label">Λαχνοί</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value">{prizes.length}</span>
                    <span className="metric-label">Δώρα</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value">{batchSize}</span>
                    <span className="metric-label">Ανά γύρο</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value">{intervalSeconds}s</span>
                    <span className="metric-label">Ρυθμός</span>
                  </div>
                </div>

                <div className="timer">
                  <div>
                    <strong>{drawStatus === "done" ? 0 : drawStatus === "running" ? countdown : intervalSeconds}</strong>
                    <span>{drawStatus === "done" ? "Ολοκληρώθηκε" : "Επόμενη παρτίδα"}</span>
                  </div>
                  <Shuffle size={28} />
                </div>

                {hasShortTicketList ? (
                  <div className="warning">
                    <AlertTriangle size={18} />
                    <span>Τα δώρα είναι περισσότερα από τους μοναδικούς λαχνούς.</span>
                  </div>
                ) : null}

                <button
                  className="button primary"
                  type="button"
                  disabled={!canDownloadPdf}
                  onClick={downloadPdf}
                >
                  <Download size={17} />
                  {isPdfLoading ? "Δημιουργία..." : "PDF αποτελεσμάτων"}
                </button>
              </aside>
            </div>
          </section>

          <section className="results-panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">Τελική λίστα</h2>
                <p className="panel-subtitle">{results.length} εγγραφές</p>
              </div>
              <FileText size={24} aria-hidden="true" />
            </div>

            <div className="table-wrap">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Α/Α</th>
                    <th>Εικόνα</th>
                    <th>Λαχνός</th>
                    <th>Δώρο</th>
                    <th>Παρτίδα</th>
                    <th>Ώρα</th>
                  </tr>
                </thead>
                <tbody>
                  {results.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Δεν υπάρχουν αποτελέσματα.</td>
                    </tr>
                  ) : (
                    results.map((result) => (
                      <tr key={result.id}>
                        <td>{result.order}</td>
                        <td>
                          <PrizeVisual
                            imageUrl={result.imageUrl}
                            prizeName={result.prize}
                            size="small"
                            visualKey={result.visualKey}
                          />
                        </td>
                        <td className="ticket-cell">{result.ticket}</td>
                        <td>{result.prize}</td>
                        <td>{result.batch}</td>
                        <td>{formatTime(result.drawnAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>
        )}
      </div>

      {toast ? (
        <div className="toast" role="status">
          <AlertTriangle size={18} />
          <span>{toast}</span>
        </div>
      ) : null}
    </main>
  );
}
