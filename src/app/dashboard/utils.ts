
export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function formatMoneyCents(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "CAD" });
}

export function formatMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "CAD" });
}

export function weekStartUTCDateString(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0 Sun ... 6 Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function logSupabaseError(label: string, err: any) {
  if (!err) return;
  console.error(label, {
    message: err.message,
    details: err.details,
    hint: err.hint,
    code: err.code,
    status: err.status,
    raw: err,
  });
}

export function computeWeekRisk(events: DbEvent[]) {
  const counts = { work: 0, social: 0, deadline: 0, bill: 0 };

  for (const e of events) counts[e.type]++;

  const score = counts.work * 5 + counts.deadline * 12 + counts.social * 10 + counts.bill * 8;

  let label: "Green" | "Yellow" | "Red" = "Green";
  if (score >= 60) label = "Red";
  else if (score >= 35) label = "Yellow";

  const dayRisk = new Map<string, number>();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (const e of events) {
    const d = new Date(e.start_at);
    const day = dayNames[d.getDay()];
    const base = e.type === "social" ? 8 : e.type === "deadline" ? 6 : e.type === "work" ? 2 : 4;
    const weekendBoost = d.getDay() === 5 || d.getDay() === 6 ? 1.4 : 1.0;
    dayRisk.set(day, (dayRisk.get(day) ?? 0) + base * weekendBoost);
  }

  const topRiskDays = [...dayRisk.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([day]) => day);

  return {
    score: Math.round(score),
    label,
    counts,
    topRiskDays: topRiskDays.length ? topRiskDays : ["Fri", "Sat"],
  };
}

export function next7DaysISO() {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return { start: now.toISOString(), end: end.toISOString() };
}
