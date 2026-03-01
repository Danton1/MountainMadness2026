import type { DbEvent, BillCategory, RecurrenceFreq } from "@/lib/types";

export const BILL_EMOJI: Record<BillCategory, string> = {
  House: "🏠",
  Entertainment: "🎮",
  Food: "🍔",
  Education: "📚",
  Utilities: "💡",
  Transportation: "🚗",
  Shopping: "🛍️",
  Others: "🧾",
};

function toDateOnlyUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addMonthsUTC(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getUTCDate();

  d.setUTCMonth(d.getUTCMonth() + months);

  // handle month shorter than original day
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

function addYearsUTC(date: Date, years: number) {
  const d = new Date(date);
  const m = d.getUTCMonth();
  const day = d.getUTCDate();

  d.setUTCFullYear(d.getUTCFullYear() + years);

  // handle Feb 29 etc
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), m + 1, 0)).getUTCDate();
  d.setUTCMonth(m);
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export type BillOccurrence = {
  id: string;              // original event id
  title: string;
  date: string;            // YYYY-MM-DD
  amount_cents: number;
  category: BillCategory;
  start_at: string;
};

export function expandBillOccurrences(events: DbEvent[], rangeStartISO: string, rangeEndISO: string): BillOccurrence[] {
  const start = toDateOnlyUTC(new Date(rangeStartISO));
  const end = toDateOnlyUTC(new Date(rangeEndISO));

  const out: BillOccurrence[] = [];

  for (const e of events) {
    if (e.type !== "bill") continue;

    const category = (e.bill_category ?? "Others") as BillCategory;
    const amount = e.amount_cents ?? 0;

    const base = toDateOnlyUTC(new Date(e.start_at));
    const freq = (e.recur_freq ?? "none") as RecurrenceFreq;
    const interval = Math.max(1, e.recur_interval ?? 1);
    const until = e.recur_until ? toDateOnlyUTC(new Date(e.recur_until + "T00:00:00Z")) : null;

    const pushIfInRange = (d: Date) => {
      if (d < start || d > end) return;
      out.push({
        id: e.id,
        title: e.title,
        date: d.toISOString().slice(0, 10),
        start_at: d.toISOString(), // Include start_at here
        amount_cents: amount,
        category,
      });
    };

    if (freq === "none") {
      pushIfInRange(base);
      continue;
    }

    // find first occurrence >= start by stepping forward
    let cur = new Date(base);
    while (cur < start) {
      if (freq === "weekly") cur = new Date(cur.getTime() + 7 * interval * 24 * 3600 * 1000);
      else if (freq === "monthly") cur = addMonthsUTC(cur, interval);
      else if (freq === "yearly") cur = addYearsUTC(cur, interval);
      else break;
    }

    // emit occurrences until end (or until)
    while (cur <= end) {
      if (until && cur > until) break;
      pushIfInRange(cur);

      if (freq === "weekly") cur = new Date(cur.getTime() + 7 * interval * 24 * 3600 * 1000);
      else if (freq === "monthly") cur = addMonthsUTC(cur, interval);
      else if (freq === "yearly") cur = addYearsUTC(cur, interval);
      else break;
    }
  }

  // stable sort by date then title
  out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return out;
}