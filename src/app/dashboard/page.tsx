"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type EventType = "work" | "social" | "deadline" | "bill";

type CalendarEvent = {
  title: string;
  start: string; // ISO
  end: string; // ISO
  type: EventType;
};

type Bill = {
  name: string;
  amount: number;
  due: string; // YYYY-MM-DD
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "CAD" });
}

function computeWeekRisk(events: CalendarEvent[], bills: Bill[]) {
  const counts = { work: 0, social: 0, deadline: 0, bill: bills.length };

  for (const e of events) counts[e.type]++;

  // Tunable scoring model — keep simple for hackathon
  const score =
    counts.work * 5 +
    counts.deadline * 12 +
    counts.social * 10 +
    bills.reduce((sum, b) => sum + Math.min(20, b.amount / 25), 0);

  let label: "Green" | "Yellow" | "Red" = "Green";
  if (score >= 60) label = "Red";
  else if (score >= 35) label = "Yellow";

  // Identify top risk days (Fri/Sat bias + social events)
  const dayRisk = new Map<string, number>(); // "Mon", "Tue" etc
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (const e of events) {
    const d = new Date(e.start);
    const day = dayNames[d.getDay()];
    const base =
      e.type === "social" ? 8 : e.type === "deadline" ? 6 : e.type === "work" ? 2 : 1;
    // Weekend multiplier
    const weekendBoost = d.getDay() === 5 || d.getDay() === 6 ? 1.4 : 1.0;
    const add = base * weekendBoost;

    dayRisk.set(day, (dayRisk.get(day) ?? 0) + add);
  }

  // Sort days by risk score
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

export default function DashboardPage() {
  const [data, setData] = useState<DemoPayload | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("calendarquest_demo");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as DemoPayload;
      setData(parsed);
    } catch (e) {
      console.error("Failed to parse demo payload:", e);
    }
  }, []);

  const risk = useMemo(() => {
    if (!data) return null;
    return computeWeekRisk(data.events, data.bills);
  }, [data]);

  const financials = useMemo(() => {
    if (!data || !risk) return null;

    const totalBills = data.bills.reduce((sum, b) => sum + b.amount, 0);

    // Simple buffer rule based on chaos label
    const buffer =
      risk.label === "Red" ? 80 : risk.label === "Yellow" ? 40 : 20;

    const recommendedBuffer = buffer;
    const safeToSpend = Math.max(0, data.user.weeklyIncome - totalBills - recommendedBuffer);

    return { totalBills, recommendedBuffer, safeToSpend };
  }, [data, risk]);

  if (!data || !risk || !financials) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-white px-6 py-16">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg border border-emerald-100 p-8">
          <h1 className="text-2xl font-bold text-emerald-700 mb-2">
            Dashboard
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

  const chaosColor =
    risk.label === "Red"
      ? "text-red-600"
      : risk.label === "Yellow"
        ? "text-yellow-600"
        : "text-emerald-700";

  const progressPct = clamp((risk.score / 80) * 100, 0, 100);

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-white px-6 py-10">
      <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-emerald-700">
            🧪 Weekly Lab Report
          </h1>
          <p className="text-gray-600">
            Hello <span className="font-semibold">{data.user.name}</span> — here’s your
            calendar-driven financial forecast.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/quests"
            className="bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-5 py-3 rounded-xl shadow-md"
          >
            🎯 Quests
          </Link>
          <Link
            href="/party"
            className="bg-white hover:bg-emerald-50 transition text-emerald-700 font-semibold px-5 py-3 rounded-xl shadow-md border border-emerald-200"
          >
            👥 Lab Group
          </Link>
        </div>
      </div>

      {/* Top row cards */}
      <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardTitle>📅 Chaos Index</CardTitle>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className={`text-4xl font-bold ${chaosColor}`}>
                {risk.score}
              </div>
              <div className="text-gray-600 text-sm">
                Status: <span className={`font-semibold ${chaosColor}`}>{risk.label}</span>
              </div>
            </div>

            <div className="w-40">
              <div className="h-2 rounded-full bg-emerald-100 overflow-hidden">
                <div
                  className="h-2 bg-emerald-600"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Top risk days: <span className="font-semibold">{risk.topRiskDays.join(", ")}</span>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>💸 Bills Due</CardTitle>
          <ul className="space-y-2">
            {data.bills.map((b) => (
              <li key={b.name} className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium text-gray-800">{b.name}</div>
                  <div className="text-gray-500">Due {b.due}</div>
                </div>
                <div className="font-semibold text-gray-800">
                  {formatMoney(b.amount)}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 text-sm text-gray-600 flex justify-between">
            <span>Total bills</span>
            <span className="font-semibold">{formatMoney(financials.totalBills)}</span>
          </div>
        </Card>

        <Card>
          <CardTitle>🧾 Safe-to-Spend</CardTitle>
          <div className="text-4xl font-bold text-emerald-700">
            {formatMoney(financials.safeToSpend)}
          </div>
          <div className="text-sm text-gray-600 mt-2">
            Weekly income: <span className="font-semibold">{formatMoney(data.user.weeklyIncome)}</span>
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Recommended buffer:{" "}
            <span className="font-semibold">{formatMoney(financials.recommendedBuffer)}</span>
          </div>
          <div className="mt-4 text-xs text-gray-500">
            Buffer increases automatically on high-chaos weeks.
          </div>
        </Card>
      </div>

      {/* Bottom row cards */}
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
        <Card>
          <CardTitle>🧠 Risk Drivers</CardTitle>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <Stat label="Deadlines" value={risk.counts.deadline} />
            <Stat label="Social Events" value={risk.counts.social} />
            <Stat label="Work/School" value={risk.counts.work} />
            <Stat label="Bills" value={risk.counts.bill} />
          </div>

          <div className="mt-6 text-sm text-gray-600">
            <span className="font-semibold">Actionable insight:</span>{" "}
            Your spending risk rises when social events and deadlines stack up —
            especially near weekends. Use Quests to stay consistent.
          </div>
        </Card>

        <Card>
          <CardTitle>👥 Lab Group Snapshot</CardTitle>
          <div className="text-sm text-gray-600">
            Group: <span className="font-semibold text-gray-800">{data.party.name}</span>
          </div>
          <div className="text-sm text-gray-600">
            Join code:{" "}
            <span className="font-mono font-semibold text-emerald-700">{data.party.joinCode}</span>
          </div>

          <div className="mt-4">
            <div className="text-sm text-gray-600 flex justify-between mb-2">
              <span>Weekly goal</span>
              <span className="font-semibold">{formatMoney(data.party.weeklyGoal)}</span>
            </div>
            <div className="h-2 rounded-full bg-emerald-100 overflow-hidden">
              <div
                className="h-2 bg-emerald-600"
                style={{
                  width: `${clamp(
                    (data.party.members.reduce((s, m) => s + m.points, 0) /
                      100) *
                      100,
                    0,
                    100
                  )}%`,
                }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-2">
              (Demo) Group progress uses points for now — we’ll swap to “$ saved”
              once quest completions exist.
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {data.party.members
              .slice()
              .sort((a, b) => b.points - a.points)
              .map((m) => (
                <div
                  key={m.name}
                  className="flex justify-between text-sm bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2"
                >
                  <span className="font-medium text-gray-800">{m.name}</span>
                  <span className="font-semibold text-emerald-700">
                    {m.points} pts
                  </span>
                </div>
              ))}
          </div>

          <div className="mt-5 flex gap-2">
            <Link
              href="/party"
              className="bg-white hover:bg-emerald-50 transition text-emerald-700 font-semibold px-4 py-2 rounded-xl border border-emerald-200"
            >
              Manage Group →
            </Link>
            <Link
              href="/quests"
              className="bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-4 py-2 rounded-xl"
            >
              Start Quests →
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}

/* UI helpers */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-emerald-100 p-6">
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-emerald-700 mb-4">
      {children}
    </h2>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
      <div className="text-2xl font-bold text-emerald-700">{value}</div>
      <div className="text-xs text-gray-600 mt-1">{label}</div>
    </div>
  );
}