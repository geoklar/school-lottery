type CountableLotteryState = {
  bookletInput: string;
  ticketInput: string;
  prizeInput: string;
  results: unknown[];
};

function splitTicketTokens(value: string) {
  return value
    .replace(/[;,]+/g, "\n")
    .split(/\n+/)
    .flatMap((line) => line.trim().split(/\s+/))
    .map((token) => token.trim())
    .filter(Boolean);
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

  for (const token of splitTicketTokens(value)) {
    const rangeMatch = token.match(/^(\d+)\s*[-–]\s*(\d+)$/);

    if (rangeMatch) {
      for (const ticket of expandTicketToken(token)) {
        if (!seen.has(ticket)) {
          seen.add(ticket);
          tickets.push(ticket);
        }
      }

      continue;
    }

    if (/^\d+$/.test(token) && !seen.has(token)) {
      seen.add(token);
      tickets.push(token);
    }
  }

  return tickets;
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

export function countPrizes(value: string) {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

export function getLotteryCounts(state: CountableLotteryState) {
  const tickets = mergeTickets(parseBooklets(state.bookletInput), parseTickets(state.ticketInput));
  const prizeCount = countPrizes(state.prizeInput);
  const ticketCount = tickets.length;
  const drawTotal = Math.min(ticketCount, prizeCount);

  return {
    drawTotal,
    prizeCount,
    resultCount: state.results.length,
    ticketCount,
  };
}

export function isLotteryComplete(state: CountableLotteryState) {
  const counts = getLotteryCounts(state);

  return counts.drawTotal > 0 && counts.resultCount >= counts.drawTotal;
}
