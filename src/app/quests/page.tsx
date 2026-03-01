"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Quest = {
  id: string;
  kind: "daily" | "weekly";
  title: string;
  reward_points: number;
  est_saved_cents: number;
};

type CompletionRow = {
  id: string;
  quest_id: string;
  completed_day: string; // YYYY-MM-DD
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatMoneyCents(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "CAD" });
}

function todayUTCDateString(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

export default function QuestsPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [userId, setUserId] = useState<string | null>(null);

  const [quests, setQuests] = useState<Quest[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [busyQuestId, setBusyQuestId] = useState<string | null>(null);

  const today = useMemo(() => todayUTCDateString(), []);

  const loadUser = async () => {
    const { data } = await supabase.auth.getUser();
    setUserId(data.user?.id ?? null);
  };

  const loadQuests = async () => {
    const { data, error } = await supabase
      .from("quests")
      .select("id,kind,title,reward_points,est_saved_cents")
      .order("kind", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }
    setQuests((data ?? []) as Quest[]);
  };

  const loadTodaysCompletions = async (uid: string) => {
    const { data, error } = await supabase
      .from("quest_completions")
      .select("id,quest_id,completed_day")
      .eq("user_id", uid)
      .eq("completed_day", today);

    if (error) {
      console.error(error);
      return;
    }
    setCompletions((data ?? []) as CompletionRow[]);
  };

  useEffect(() => {
    (async () => {
      await loadUser();
      await loadQuests();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadTodaysCompletions(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const completedMap = useMemo(() => {
    const s = new Set(completions.map((c) => c.quest_id));
    return s;
  }, [completions]);

  const daily = useMemo(() => quests.filter((q) => q.kind === "daily"), [quests]);
  const weekly = useMemo(() => quests.filter((q) => q.kind === "weekly"), [quests]);

  const stats = useMemo(() => {
    const all = quests;
    const total = all.length;
    const done = all.filter((q) => completedMap.has(q.id)).length;

    const pointsEarned = all.reduce(
      (sum, q) => sum + (completedMap.has(q.id) ? q.reward_points : 0),
      0
    );

    const savedCents = all.reduce(
      (sum, q) => sum + (completedMap.has(q.id) ? q.est_saved_cents : 0),
      0
    );

    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct, pointsEarned, savedCents };
  }, [quests, completedMap]);

  const toggleQuest = async (quest: Quest) => {
    if (!userId) return;
    setBusyQuestId(quest.id);

    try {
      const isDone = completedMap.has(quest.id);

      if (!isDone) {
        // Insert completion (trigger sets completed_day)
        const { error } = await supabase.from("quest_completions").insert({
          user_id: userId,
          quest_id: quest.id,
        });

        if (error) {
          // If unique violation (already completed today), ignore and refresh
          console.error(error);
        }
      } else {
        // Find today's completion row for this quest and delete it
        const row = completions.find((c) => c.quest_id === quest.id);
        if (row) {
          const { error } = await supabase
            .from("quest_completions")
            .delete()
            .eq("id", row.id);

          if (error) console.error(error);
        }
      }

      // Refresh completions after mutation
      await loadTodaysCompletions(userId);
    } finally {
      setBusyQuestId(null);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-white px-6 py-10">
      <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-emerald-700">🎯 Financial Quests</h1>
          <p className="text-gray-600">
            Today (UTC): <span className="font-mono">{today}</span> — complete quests to earn points and build savings habits.
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

      {/* Summary */}
      <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardTitle>✅ Progress</CardTitle>
          <div className="text-4xl font-bold text-emerald-700">{stats.pct}%</div>
          <div className="text-sm text-gray-600 mt-1">
            {stats.done} / {stats.total} quests completed
          </div>
          <div className="h-2 rounded-full bg-emerald-100 overflow-hidden mt-4">
            <div className="h-2 bg-emerald-600" style={{ width: `${clamp(stats.pct, 0, 100)}%` }} />
          </div>
        </Card>

        <Card>
          <CardTitle>⭐ Points Earned</CardTitle>
          <div className="text-4xl font-bold text-emerald-700">{stats.pointsEarned}</div>
          <div className="text-sm text-gray-600 mt-1">Live from Supabase completions.</div>
        </Card>

        <Card>
          <CardTitle>💰 Estimated Saved</CardTitle>
          <div className="text-4xl font-bold text-emerald-700">{formatMoneyCents(stats.savedCents)}</div>
          <div className="text-sm text-gray-600 mt-1">Used for party leaderboard & weekly goal.</div>
        </Card>
      </div>

      {/* Quests */}
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
        <Card>
          <CardTitle>🗓 Daily</CardTitle>
          <div className="space-y-3">
            {daily.map((q) => (
              <QuestRow
                key={q.id}
                quest={q}
                checked={completedMap.has(q.id)}
                busy={busyQuestId === q.id}
                onToggle={() => toggleQuest(q)}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>🏁 Weekly</CardTitle>
          <div className="space-y-3">
            {weekly.map((q) => (
              <QuestRow
                key={q.id}
                quest={q}
                checked={completedMap.has(q.id)}
                busy={busyQuestId === q.id}
                onToggle={() => toggleQuest(q)}
              />
            ))}
          </div>

          <div className="mt-6 text-xs text-gray-500">
            Next step: make weekly quests unique per week (instead of per day) by adding a separate “week_bucket” column.
          </div>
        </Card>
      </div>
    </main>
  );
}

/* UI */
function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl shadow-lg border border-emerald-100 p-6">{children}</div>;
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-emerald-700 mb-4">{children}</h2>;
}

function QuestRow({
  quest,
  checked,
  busy,
  onToggle,
}: {
  quest: Quest;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={busy}
      className={`w-full text-left flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition disabled:opacity-60 ${
        checked ? "bg-emerald-50 border-emerald-200" : "bg-white hover:bg-emerald-50 border-emerald-100"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 h-5 w-5 rounded border flex items-center justify-center ${
            checked ? "bg-emerald-600 border-emerald-600" : "bg-white border-gray-300"
          }`}
          aria-hidden="true"
        >
          {checked ? <span className="text-white text-xs font-bold">✓</span> : null}
        </div>

        <div>
          <div className={`font-medium ${checked ? "text-emerald-900" : "text-gray-800"}`}>
            {quest.title}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Reward: <span className="font-semibold">{quest.reward_points} pts</span>
            {quest.est_saved_cents > 0 ? (
              <>
                {" "}
                • Est. saved:{" "}
                <span className="font-semibold">{formatMoneyCents(quest.est_saved_cents)}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <span
        className={`text-xs font-semibold px-3 py-1 rounded-full ${
          quest.kind === "weekly" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"
        }`}
      >
        {quest.kind === "weekly" ? "Weekly" : "Daily"}
      </span>
    </button>
  );
}