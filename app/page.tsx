"use client";

import {
  AlertTriangle,
  Bike,
  BookOpen,
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
  ShieldCheck,
  Shirt,
  Shuffle,
  Smartphone,
  Ticket,
  Trash2,
  Trophy,
  Utensils,
  LogIn,
  LogOut,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getProviders, signIn, signOut, SessionProvider, useSession } from "next-auth/react";
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
type PublicStats = {
  drawTotal: number;
  prizeCount: number;
  resultCount: number;
  ticketCount: number;
};
type SessionUserWithRole = {
  email?: string | null;
  image?: string | null;
  isAdmin?: boolean;
  name?: string | null;
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

const ticketCollator = new Intl.Collator("el-GR", {
  numeric: true,
  sensitivity: "base",
});

function compareResultsByTicket(left: PrizeResult, right: PrizeResult) {
  return ticketCollator.compare(left.ticket, right.ticket) || left.order - right.order;
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
  return (
    <SessionProvider>
      <LotteryApp />
    </SessionProvider>
  );
}

function LotteryApp() {
  const { data: session, status: sessionStatus } = useSession();
  const sessionUser = session?.user as SessionUserWithRole | undefined;
  const isAuthenticated = sessionStatus === "authenticated";
  const isAdmin = Boolean(sessionUser?.isAdmin);
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
  const [publicStats, setPublicStats] = useState<PublicStats | null>(null);
  const [hasGoogleProvider, setHasGoogleProvider] = useState<boolean | null>(null);

  const bookletData = useMemo(() => parseBooklets(bookletInput), [bookletInput]);
  const manualTickets = useMemo(() => parseTickets(ticketInput), [ticketInput]);
  const tickets = useMemo(
    () => mergeTickets(bookletData.tickets, manualTickets),
    [bookletData, manualTickets],
  );
  const ticketGroups = useMemo(() => makeTicketGroups(tickets, BOOKLET_SIZE), [tickets]);
  const prizes = useMemo(() => parsePrizes(prizeInput), [prizeInput]);
  const latestBatch = results.at(-1)?.batch ?? 0;
  const latestBatchResults = useMemo(
    () => (latestBatch > 0 ? results.filter((result) => result.batch === latestBatch) : []),
    [latestBatch, results],
  );
  const sortedResultsByTicket = useMemo(
    () => [...results].sort(compareResultsByTicket),
    [results],
  );
  const displayTicketCount = isAdmin ? tickets.length : (publicStats?.ticketCount ?? tickets.length);
  const displayPrizeCount = isAdmin ? prizes.length : (publicStats?.prizeCount ?? prizes.length);
  const savedDrawTotal = isAdmin
    ? Math.min(tickets.length, prizes.length)
    : (publicStats?.drawTotal ?? Math.min(tickets.length, prizes.length));
  const drawTotal = drawPlan.length > 0 ? drawPlan.length : savedDrawTotal;
  const totalBatches = drawTotal > 0 ? Math.ceil(drawTotal / batchSize) : 0;
  const drawProgress = drawTotal > 0 ? Math.round((results.length / drawTotal) * 100) : 0;
  const displayedRemaining = Math.max(0, drawTotal - results.length);
  const isDrawComplete = drawTotal > 0 && results.length >= drawTotal;
  const effectiveDrawStatus = isDrawComplete ? "done" : drawStatus;
  const timerProgress =
    effectiveDrawStatus === "done"
      ? 100
      : drawStatus === "running"
        ? Math.min(100, Math.max(0, ((intervalSeconds - countdown) / intervalSeconds) * 100))
        : 0;
  const canStart = isAdmin && tickets.length > 0 && prizes.length > 0 && drawStatus !== "running";
  const canDownloadPdf = isDrawComplete && !isPdfLoading && !isRemoteSaving;
  const hasShortTicketList = displayTicketCount > 0 && displayPrizeCount > displayTicketCount;
  const startButtonLabel =
    drawStatus === "paused" ? "Συνέχεια" : results.length > 0 ? "Νέα κλήρωση" : "Εκκίνηση";

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
  }, []);

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      return;
    }

    let isMounted = true;

    getProviders()
      .then((providers) => {
        if (isMounted) {
          setHasGoogleProvider(Boolean(providers?.google));
        }
      })
      .catch(() => {
        if (isMounted) {
          setHasGoogleProvider(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [sessionStatus]);

  useEffect(() => {
    if (!isAdmin && activeSection === "admin") {
      setActiveSection("draw");
    }
  }, [activeSection, isAdmin]);

  const revealNextBatch = useCallback(() => {
    const nextItems = drawPlan.slice(cursor, cursor + batchSize);

    if (nextItems.length === 0) {
      setDrawStatus("done");
      return;
    }

    const now = new Date().toISOString();
    const nextCursor = cursor + nextItems.length;

    setResults((currentResults) => {
      const drawnOrders = new Set(currentResults.map((result) => result.order));
      const uniqueNextItems = nextItems.filter((item) => !drawnOrders.has(item.order));

      if (uniqueNextItems.length === 0) {
        return currentResults;
      }

      const nextBatch = (currentResults.at(-1)?.batch ?? 0) + 1;
      const nextResults = uniqueNextItems.map<PrizeResult>((item) => ({
        ...item,
        id: `${item.order}-${item.ticket}-${nextBatch}-${now}`,
        batch: nextBatch,
        drawnAt: now,
      }));

      return [...currentResults, ...nextResults];
    });
    setCursor((currentCursor) => Math.max(currentCursor, nextCursor));

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
        id: `${item.order}-${item.ticket}-1-${now}`,
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
    if (!isDrawComplete) {
      showToast("Το PDF θα είναι διαθέσιμο μετά την ολοκλήρωση της κλήρωσης.");
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
          expectedTotal: drawTotal,
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
  }, [drawTotal, eventTitle, isDrawComplete, results, schoolName, showToast]);

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
    if (sessionStatus === "loading") {
      return;
    }

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
          permissions?: {
            isAdmin?: boolean;
            isAuthenticated?: boolean;
          };
          publicStats?: PublicStats;
          state?: Partial<SavedState>;
        };

        if (!isMounted) {
          return;
        }

        if (payload.databaseAvailable && payload.state) {
          applySavedState(payload.state);
          setPublicStats(payload.publicStats ?? null);
          setStorageMode("database");
        } else {
          setPublicStats(payload.publicStats ?? null);

          if (isAdmin) {
            loadLocalState();
          } else {
            setStorageMode("local");
          }
        }
      } catch {
        if (isMounted) {
          if (isAdmin) {
            loadLocalState();
          } else {
            setStorageMode("error");
          }
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
  }, [applySavedState, isAdmin, loadLocalState, sessionStatus]);

  useEffect(() => {
    if (!hasLoadedSavedState || !isAdmin || sessionStatus !== "authenticated") {
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
    isAdmin,
    prizeInput,
    results,
    schoolName,
    sessionStatus,
    storageMode,
    ticketInput,
  ]);

  useEffect(() => {
    if (drawStatus !== "running" || cursor >= drawPlan.length) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (countdown <= 1) {
        revealNextBatch();
        setCountdown(intervalSeconds);
        return;
      }

      setCountdown(countdown - 1);
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
            {isAuthenticated ? (
              <>
                <span className={`user-pill ${isAdmin ? "admin" : "viewer"}`}>
                  {isAdmin ? <ShieldCheck size={16} /> : <User size={16} />}
                  {sessionUser?.email}
                </span>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => signOut()}
                  title="Αποσύνδεση"
                >
                  <LogOut size={18} />
                  Αποσύνδεση
                </button>
              </>
            ) : (
              <button
                className="button ghost"
                disabled={sessionStatus === "loading" || hasGoogleProvider === false}
                type="button"
                onClick={() => signIn("google")}
                title={hasGoogleProvider === false ? "Δεν έχει ρυθμιστεί Google SSO" : "Σύνδεση"}
              >
                <LogIn size={17} />
                {sessionStatus === "loading"
                  ? "Έλεγχος..."
                  : hasGoogleProvider === false
                    ? "SSO μη διαθέσιμο"
                    : "Σύνδεση"}
              </button>
            )}

            <div className="section-tabs" aria-label="Ενότητες εφαρμογής">
              <button
                className={`tab-button ${activeSection === "draw" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveSection("draw")}
              >
                <Gift size={17} />
                Κλήρωση
              </button>
              {isAdmin ? (
                <button
                  className={`tab-button ${activeSection === "admin" ? "active" : ""}`}
                  type="button"
                  onClick={() => setActiveSection("admin")}
                >
                  <Settings size={17} />
                  Admin
                </button>
              ) : null}
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

                <section className="prize-numbering" aria-live="polite">
                  <div className="ticket-groups-head">
                    <span>Αρίθμηση δώρων</span>
                    <span className="count-chip">{prizes.length} δώρα</span>
                  </div>

                  {prizes.length === 0 ? (
                    <div className="ticket-groups-empty">Δεν έχουν δηλωθεί δώρα.</div>
                  ) : (
                    <ol className="prize-number-list">
                      {prizes.map((prize, index) => (
                        <li key={`${prize.name}-${index}`}>
                          <span className="prize-number">Δώρο #{index + 1}</span>
                          <span>{prize.name}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
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
                {isAdmin ? (
                  <>
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

                    <button
                      className="button ghost icon-only"
                      type="button"
                      onClick={resetDraw}
                      title="Καθαρισμός αποτελεσμάτων"
                    >
                      <RefreshCcw size={18} />
                    </button>
                  </>
                ) : (
                  <span className="viewer-badge">
                    <ShieldCheck size={17} />
                    Προβολή αποτελεσμάτων
                  </span>
                )}
              </div>
            </div>

            <div className="draw-stage">
              <div className="live-area">
                <div className="status-strip">
                  <span className="status-pill">
                    <span className={`status-dot ${effectiveDrawStatus}`} />
                    {drawStatus === "running"
                      ? "Σε εξέλιξη"
                      : drawStatus === "paused"
                        ? "Σε παύση"
                        : effectiveDrawStatus === "done"
                          ? "Ολοκληρώθηκε"
                          : "Έτοιμη"}
                  </span>
                  <span className="status-pill">
                    <Gift size={16} />
                    {results.length} κληρώθηκαν
                  </span>
                  <span className="status-pill">
                    <Ticket size={16} />
                    {displayedRemaining} απομένουν
                  </span>
                  <span className="status-pill">
                    <Shuffle size={16} />
                    Παρτίδα {latestBatch} / {totalBatches}
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
                  <div className="live-results">
                    <div className="live-summary">
                      <div>
                        <span className="summary-label">Τελευταία παρτίδα</span>
                        <strong>
                          Παρτίδα {latestBatch} από {totalBatches}
                        </strong>
                        <span className="summary-detail">
                          {latestBatchResults.length} νέα αποτελέσματα στην οθόνη
                        </span>
                      </div>
                      <div
                        className="summary-count"
                        aria-label={`${results.length} από ${drawTotal} δώρα κληρώθηκαν`}
                      >
                        <strong>
                          {results.length}/{drawTotal}
                        </strong>
                        <span>Δώρα</span>
                      </div>
                    </div>

                    <div className="overall-progress" aria-label="Συνολική πρόοδος κλήρωσης">
                      <span style={{ width: `${drawProgress}%` }} />
                    </div>

                    <div className="live-grid">
                      {latestBatchResults.map((result) => (
                        <article className="winner-card latest" key={result.id}>
                          <PrizeVisual
                            imageUrl={result.imageUrl}
                            prizeName={result.prize}
                            visualKey={result.visualKey}
                          />
                          <div className="winner-content">
                            <div className="winner-topline">
                              <span className="winner-index">Δώρο #{result.order}</span>
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
                  </div>
                )}
              </div>

              <aside className="control-panel">
                <div className="metrics">
                  <div className="metric">
                    <span className="metric-value">{displayTicketCount}</span>
                    <span className="metric-label">Λαχνοί</span>
                  </div>
                  <div className="metric">
                    <span className="metric-value">{displayPrizeCount}</span>
                    <span className="metric-label">Δώρα</span>
                  </div>
                </div>

                <div className="timer">
                  <div>
                    <strong>{effectiveDrawStatus === "done" ? 0 : drawStatus === "running" ? countdown : intervalSeconds}</strong>
                    <span>{effectiveDrawStatus === "done" ? "Ολοκληρώθηκε" : "Επόμενη παρτίδα"}</span>
                  </div>
                  <Shuffle size={28} />
                  <div className="timer-progress" aria-hidden="true">
                    <span style={{ width: `${timerProgress}%` }} />
                  </div>
                </div>

                <div className="progress-card">
                  <div className="progress-card-head">
                    <span>Πρόοδος κλήρωσης</span>
                  </div>
                  <div className="progress-hero">
                    <strong>
                      {results.length} / {drawTotal}
                    </strong>
                    <span>
                      {drawProgress}% ολοκληρώθηκε
                    </span>
                  </div>
                  <div className="progress-bar">
                    <span style={{ width: `${drawProgress}%` }} />
                  </div>
                  <div className="progress-meta">
                    <span>{displayedRemaining} απομένουν</span>
                    <span>
                      Παρτίδα {latestBatch} / {totalBatches}
                    </span>
                  </div>
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
                  {isPdfLoading
                    ? "Δημιουργία..."
                    : isDrawComplete && isRemoteSaving
                      ? "Αποθήκευση..."
                      : isDrawComplete
                      ? "PDF αποτελεσμάτων"
                      : "PDF μετά την ολοκλήρωση"}
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
                    <th>Δώρο #</th>
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
                    sortedResultsByTicket.map((result) => (
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
