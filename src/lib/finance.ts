type EventType = "work" | "social" | "deadline" | "bill";

export type CalendarEvent = {
  title: string;
  start: string; // ISO
  end: string;   // ISO
  type: EventType;
};

export type Bill = { name: string; amount: number; due: string };

export function computeWeekRisk(events: CalendarEvent[], bills: Bill[]) {
  const counts = { work: 0, social: 0, deadline: 0, bill: bills.length };

  for (const e of events) counts[e.type]++;

  // Very simple, tunable scoring
  const score =
    counts.work * 5 +
    counts.deadline * 12 +
    counts.social * 10 +
    bills.reduce((sum, b) => sum + Math.min(20, b.amount / 25), 0);

  let label: "Green" | "Yellow" | "Red" = "Green";
  if (score >= 60) label = "Red";
  else if (score >= 35) label = "Yellow";

  return { score: Math.round(score), label, counts };
}

export function generateQuests(riskLabel: "Green" | "Yellow" | "Red") {
  const base = [
    { id: "track3", title: "Track 3 purchases today", reward: 10 },
    { id: "save5", title: "Move $5 to savings", reward: 15 },
    { id: "homecoffee", title: "Make coffee at home", reward: 5 },
  ];

  const redAddons = [
    { id: "nodelivery", title: "No delivery today (cook/eat in)", reward: 20 },
    { id: "24h", title: "24-hour rule on non-essentials", reward: 15 },
  ];

  const yellowAddons = [
    { id: "nolunchout", title: "Bring lunch / no lunch spend", reward: 10 },
  ];

  const weekly = riskLabel === "Red"
    ? { id: "weekly_team", title: "Party Challenge: Save $60 total this week", reward: 50 }
    : { id: "weekly_team", title: "Party Challenge: Save $30 total this week", reward: 30 };

  const daily =
    riskLabel === "Red" ? [...base, ...redAddons]
    : riskLabel === "Yellow" ? [...base, ...yellowAddons]
    : base;

  return { daily, weekly };
}