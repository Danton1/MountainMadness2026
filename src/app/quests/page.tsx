"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type EventType = "work" | "social" | "deadline" | "bill";

type CalendarEvent = {
  title: string;
  start: string;
  end: string;
  type: EventType;
};

type Bill = {
  name: string;
  amount: number;
  due: string;
};

type DemoPayload = {
  user: { name: string; weeklyIncome: number };
  bills: Bill[];
  events: CalendarEvent[];
  party: {
    name: string;
    joinCode: string;
    weeklyGoal: number;
    members: { name: string; points: number }[];
  };
};

type RiskLabel = "Green" | "Yellow" | "Red";

type Quest = {
  id: string;
  title: string;
  reward: number; // points
  kind: "daily" | "weekly";
  // Optional "savings estimate" to make it feel finance-y
  estSaved?: number; // dollars
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "CAD" });
}

function computeWeekRiskLabel(events: CalendarEvent[], bills: Bill[]): RiskLabel {
  const counts = { work: 0, social: 0, deadline: 0, bill: bills.length };
  for (const e of events) counts[e.type]++;

  const score =
    counts.work * 5 +
    counts.deadline * 12 +
    counts.social * 10 +
    bills.reduce((sum, b) => sum + Math.min(20, b.amount / 25), 0);

  if (score >= 60) return "Red";
  if (score >= 35) return "Yellow";
  return "Green";
}

function generateQuests(label: RiskLabel): { daily: Quest[]; weekly: Quest[] } {
  // Base quests that always make sense
  const baseDaily: Quest[] = [
    { id: "track3", title: "Track 3 purchases today", reward: 10, kind: "daily", estSaved: 0 },
    { id: "coffee", title: "Make coffee at home", reward: 6, kind: "daily", estSaved: 4 },
    { id: "move5", title: "Move $5 into savings (micro-transfer)", reward: 15, kind: "daily", estSaved: 5 },
  ];

  const greenAdd: Quest[] = [
    { id: "plan1", title: "Plan tomorrow’s spending (2 minutes)", reward: 8, kind: "daily", estSaved: 0 },
  ];

  const yellowAdd: Quest[] = [
    { id: "lunch", title: "No-spend lunch (bring / eat in)", reward: 12, kind: "daily", estSaved: 10 },
    { id: "cap", title: "Set a daily discretionary cap (pick a number)", reward: 10, kind: "daily", estSaved: 0 },
  ];

  const redAdd: Quest[] = [
    { id: "nodelivery", title: "No delivery today (cook/eat in)", reward: 20, kind: "daily", estSaved: 20 },
    { id: "24h", title: "Use the 24-hour rule on non-essentials", reward: 15, kind: "daily", estSaved: 0 },
    { id: "cash", title: "Cash-only discretionary spending today", reward: 18, kind: "daily", estSaved: 0 },
  ];

  const daily =
    label === "Red"
      ? [...baseDaily, ...redAdd]
      : label === "Yellow"
        ? [...baseDaily, ...yellowAdd]
        : [...baseDaily, ...greenAdd];

  // Weekly quests: one personal + one party-style
  const weekly: Quest[] = [
    label === "Red"
      ? { id: "wk_buffer", title: "Build a $80 chaos buffer this week", reward: 50, kind: "weekly", estSaved: 80 }
      : label === "Yellow"
        ? { id: "wk_buffer", title: "Build a $40 chaos buffer this week", reward: 35, kind: "weekly", estSaved: 40 }
        : { id: "wk_buffer", title: "Build a $20 chaos buffer this week", reward: 20, kind: "weekly", estSaved: 20 },

    label === "Red"
      ? { id: "wk_party", title: "Lab Group Challenge: Save $60 total by Sunday", reward: 60, kind: "weekly", estSaved: 60 }
      : label === "Yellow"
        ? { id: "wk_party", title: "Lab Group Challenge: Save $30 total by Sunday", reward: 40, kind: "weekly", estSaved: 30 }
        : { id: "wk_party", title: "Lab Group Challenge: Save $20 total by Sunday", reward: 25, kind: "weekly", estSaved: 20 },
  ];

  return { daily, weekly };
}

function storageKeyForCompletions() {
  // One key for now — later you can scope this by week/user
  return "calendarquest_completions_v1";
}

function partyStorageKey() {
    return "calendarquest_party_v1";
  }
  
  // Map quest IDs to points and optional $ saved (points already in Quest.reward)
  function getCompletedQuestPoints(completed: Record<string, boolean>, allQuests: Quest[]) {
    return allQuests.reduce((sum, q) => sum + (completed[q.id] ? q.reward : 0), 0);
  }
  
  function ensurePartyExistsFromDemo(data: DemoPayload) {
    const key = partyStorageKey();
    if (localStorage.getItem(key)) return;
  
    localStorage.setItem(key, JSON.stringify(data.party));
  }

  function syncPartyPoints(
    youName: string,
    completed: Record<string, boolean>,
    allQuests: Quest[]
  ) {
    const raw = localStorage.getItem(partyStorageKey());
    if (!raw) return; // no party created/joined yet
  
    try {
      const party = JSON.parse(raw) as {
        name: string;
        joinCode: string;
        weeklyGoal: number;
        members: { name: string; points: number }[];
      };
  
      const points = getCompletedQuestPoints(completed, allQuests);
  
      const next = {
        ...party,
        members: party.members.map((m) =>
          m.name === youName ? { ...m, points } : m
        ),
      };
  
      localStorage.setItem(partyStorageKey(), JSON.stringify(next));
    } catch (e) {
      console.error("Failed syncing party points:", e);
    }
  }

export default function QuestsPage() {
  const [data, setData] = useState<DemoPayload | null>(null);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("calendarquest_demo");
    if (raw) {
      try {
        setData(JSON.parse(raw));
      } catch (e) {
        console.error("Failed to parse demo payload:", e);
      }
    }
  
    const cRaw = localStorage.getItem(storageKeyForCompletions());
    if (cRaw) {
      try {
        setCompleted(JSON.parse(cRaw));
      } catch {
        // ignore
      }
    }
  
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(storageKeyForCompletions(), JSON.stringify(completed));
  }, [completed, hydrated]);

  const label: RiskLabel | null = useMemo(() => {
    if (!data) return null;
    return computeWeekRiskLabel(data.events, data.bills);
  }, [data]);

  const quests = useMemo(() => {
    if (!label) return null;
    return generateQuests(label);
  }, [label]);

  const youName = useMemo(() => data?.user.name ?? "You", [data]);

  const stats = useMemo(() => {
    if (!quests) return null;

    const all = [...quests.daily, ...quests.weekly];
    const total = all.length;

    const done = all.filter((q) => completed[q.id]).length;
    const pointsEarned = all.reduce((sum, q) => sum + (completed[q.id] ? q.reward : 0), 0);
    const estSaved = all.reduce((sum, q) => sum + (completed[q.id] ? (q.estSaved ?? 0) : 0), 0);

    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct, pointsEarned, estSaved };
  }, [quests, completed]);

  const toggleQuest = (id: string) => {
    setCompleted((prev) => {
      const next = { ...prev, [id]: !prev[id] };
        
      if (quests && data) {
        ensurePartyExistsFromDemo(data);
        const all = [...quests.daily, ...quests.weekly];
        syncPartyPoints(youName, next, all);
      }
  
      return next;
    });
  };

  if (!data || !label || !quests || !stats) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-white px-6 py-16">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg border border-emerald-100 p-8">
          <h1 className="text-2xl font-bold text-emerald-700 mb-2">
            Quests
          </h1>
          <p className="text-gray-600 mb-6">
            No demo data found. Go back and enter Demo Mode first.
          </p>
          <Link
            href="/"
            className="inline-block bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-6 py-3 rounded-xl shadow-md"
          >
            ← Back to Home
          </Link>
        </div>
      </main>
    );
  }

  const badge =
    label === "Red" ? "High Chaos Week" : label === "Yellow" ? "Medium Chaos Week" : "Stable Week";

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-white px-6 py-10">
      <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-emerald-700">🎯 Financial Quests</h1>
          <p className="text-gray-600">
            Your week is classified as{" "}
            <span className="font-semibold text-gray-800">{badge}</span>. Complete quests to build
            real saving habits.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/dashboard"
            className="bg-white hover:bg-emerald-50 transition text-emerald-700 font-semibold px-5 py-3 rounded-xl shadow-md border border-emerald-200"
          >
            ← Dashboard
          </Link>
          <Link
            href="/party"
            className="bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-5 py-3 rounded-xl shadow-md"
          >
            👥 Lab Group
          </Link>
        </div>
      </div>

      {/* Progress summary */}
      <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardTitle>✅ Progress</CardTitle>
          <div className="text-4xl font-bold text-emerald-700">
            {stats.pct}%
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {stats.done} / {stats.total} quests completed
          </div>
          <div className="h-2 rounded-full bg-emerald-100 overflow-hidden mt-4">
            <div className="h-2 bg-emerald-600" style={{ width: `${clamp(stats.pct, 0, 100)}%` }} />
          </div>
        </Card>

        <Card>
          <CardTitle>⭐ Jekyll Points</CardTitle>
          <div className="text-4xl font-bold text-emerald-700">
            {stats.pointsEarned}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Earn points by completing habits (use later for rewards / streaks).
          </div>
          <div className="mt-4 text-xs text-gray-500">
            Hackathon note: points are a lightweight proxy for behavior change.
          </div>
        </Card>

        <Card>
          <CardTitle>💰 Estimated Saved</CardTitle>
          <div className="text-4xl font-bold text-emerald-700">
            {formatMoney(stats.estSaved)}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            We estimate savings based on quest impact (demo-friendly).
          </div>
          <div className="mt-4 text-xs text-gray-500">
            Later: replace with real transaction import or bank integration.
          </div>
        </Card>
      </div>

      {/* Daily quests */}
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
        <Card>
          <CardTitle>🗓 Daily Experiments</CardTitle>
          <div className="space-y-3">
            {quests.daily.map((q) => (
              <QuestRow
                key={q.id}
                quest={q}
                checked={!!completed[q.id]}
                onToggle={() => toggleQuest(q.id)}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>🏁 Weekly Trials</CardTitle>
          <div className="space-y-3">
            {quests.weekly.map((q) => (
              <QuestRow
                key={q.id}
                quest={q}
                checked={!!completed[q.id]}
                onToggle={() => toggleQuest(q.id)}
              />
            ))}
          </div>

          <div className="mt-6 text-sm text-gray-600">
            <span className="font-semibold">Tip:</span> For the RBC pitch, emphasize that these quests
            are generated from calendar chaos — not generic “budget tips.”
          </div>
        </Card>
      </div>
    </main>
  );
}

/* UI */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-emerald-100 p-6">
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-emerald-700 mb-4">{children}</h2>
  );
}

function QuestRow({
  quest,
  checked,
  onToggle,
}: {
  quest: Quest;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full text-left flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition ${
        checked
          ? "bg-emerald-50 border-emerald-200"
          : "bg-white hover:bg-emerald-50 border-emerald-100"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 h-5 w-5 rounded border flex items-center justify-center ${
            checked ? "bg-emerald-600 border-emerald-600" : "bg-white border-gray-300"
          }`}
          aria-hidden="true"
        >
          {checked ? (
            <span className="text-white text-xs font-bold">✓</span>
          ) : null}
        </div>

        <div>
          <div className={`font-medium ${checked ? "text-emerald-900" : "text-gray-800"}`}>
            {quest.title}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Reward: <span className="font-semibold">{quest.reward} pts</span>
            {typeof quest.estSaved === "number" && quest.estSaved > 0 ? (
              <>
                {" "}
                • Est. saved: <span className="font-semibold">{formatMoney(quest.estSaved)}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <span
        className={`text-xs font-semibold px-3 py-1 rounded-full ${
          quest.kind === "weekly"
            ? "bg-emerald-100 text-emerald-800"
            : "bg-gray-100 text-gray-700"
        }`}
      >
        {quest.kind === "weekly" ? "Weekly" : "Daily"}
      </span>
    </button>
  );
}