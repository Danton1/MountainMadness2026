"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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

function weekStartUTCDateString(d = new Date()) {
  // Monday start, UTC
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0 Sun ... 6 Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function logSupabaseError(label: string, err: any) {
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

export default function QuestsPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [userId, setUserId] = useState<string | null>(null);

  const [quests, setQuests] = useState<Quest[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [busyQuestId, setBusyQuestId] = useState<string | null>(null);

  const today = useMemo(() => todayUTCDateString(), []);
  const weekStart = useMemo(() => weekStartUTCDateString(), []);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadUser = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) logSupabaseError("auth.getUser failed", error);
    setUserId(data.user?.id ?? null);
  };

  const loadQuests = async () => {
    const { data, error } = await supabase
      .from("quests")
      .select("id,kind,title,reward_points,est_saved_cents")
      .order("kind", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      logSupabaseError("quests select failed", error);
      return;
    }
    setQuests((data ?? []) as Quest[]);
  };

  /**
   * We keep your existing schema: quest_completions has completed_day + unique(user_id, quest_id, completed_day)
   *
   * ✅ Daily quests are bucketed on: completed_day = today
   * ✅ Weekly quests are bucketed on: completed_day = weekStart (Monday)
   *
   * This gives us "once per week" behavior WITHOUT schema migrations.
   */
  const loadBucketedCompletions = async (uid: string) => {
    const { data, error } = await supabase
      .from("quest_completions")
      .select("id,quest_id,completed_day")
      .eq("user_id", uid)
      .in("completed_day", [today, weekStart]);

    if (error) {
      logSupabaseError("quest_completions select failed", error);
      return;
    }
    setCompletions((data ?? []) as CompletionRow[]);
  };

  const teardownRealtime = () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };

  const setupRealtime = (uid: string) => {
    teardownRealtime();

    const ch = supabase.channel(`rt:quests:${uid}`);
    channelRef.current = ch;

    // Filter to only this user's completion rows
    ch.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "quest_completions",
        filter: `user_id=eq.${uid}`,
      },
      async () => {
        await loadBucketedCompletions(uid);
      }
    );

    ch.subscribe();
  };

  useEffect(() => {
    (async () => {
      await loadUser();
      await loadQuests();
    })();

    return () => teardownRealtime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadBucketedCompletions(userId);
    setupRealtime(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ---- Completion maps: daily vs weekly bucket ----
  const completionForDaily = useMemo(() => {
    const map = new Map<string, CompletionRow>(); // quest_id -> row
    for (const c of completions) {
      if (c.completed_day === today) map.set(c.quest_id, c);
    }
    return map;
  }, [completions, today]);

  const completionForWeekly = useMemo(() => {
    const map = new Map<string, CompletionRow>(); // quest_id -> row
    for (const c of completions) {
      if (c.completed_day === weekStart) map.set(c.quest_id, c);
    }
    return map;
  }, [completions, weekStart]);

  const daily = useMemo(() => quests.filter((q) => q.kind === "daily"), [quests]);
  const weekly = useMemo(() => quests.filter((q) => q.kind === "weekly"), [quests]);

  const isChecked = (q: Quest) => {
    return q.kind === "daily" ? completionForDaily.has(q.id) : completionForWeekly.has(q.id);
  };

  const stats = useMemo(() => {
    const total = quests.length;
    const done = quests.filter((q) => isChecked(q)).length;

    const pointsEarned = quests.reduce((sum, q) => sum + (isChecked(q) ? q.reward_points : 0), 0);
    const savedCents = quests.reduce((sum, q) => sum + (isChecked(q) ? q.est_saved_cents : 0), 0);

    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct, pointsEarned, savedCents };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quests, completionForDaily, completionForWeekly]);

  const toggleQuest = async (quest: Quest) => {
    if (!userId) return;
    setBusyQuestId(quest.id);

    try {
      const done = isChecked(quest);

      // bucket day depends on kind
      const bucketDay = quest.kind === "daily" ? today : weekStart;

      if (!done) {
        const { error } = await supabase.from("quest_completions").insert({
          user_id: userId,
          quest_id: quest.id,
          completed_day: bucketDay, // explicit bucket for daily/week
        });

        // Unique violation -> ignore (someone double-clicked)
        if (error && error.code !== "23505") {
          logSupabaseError("insert completion failed", error);
        }
      } else {
        // Delete the correct bucket row (daily or weekly)
        const row =
          quest.kind === "daily" ? completionForDaily.get(quest.id) : completionForWeekly.get(quest.id);

        if (row) {
          const { error } = await supabase.from("quest_completions").delete().eq("id", row.id);
          if (error) logSupabaseError("delete completion failed", error);
        }
      }

      // No manual refresh needed; realtime will handle it.
      // But keep a fallback refresh in case realtime isn't enabled.
      await loadBucketedCompletions(userId);
    } finally {
      setBusyQuestId(null);
    }
  };

  if (!userId) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-white px-6 py-16">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg border border-emerald-100 p-8">
          <h1 className="text-2xl font-bold text-emerald-700 mb-2">Quests</h1>
          <p className="text-gray-600 mb-6">You’re not logged in.</p>
          <Link
            href="/login"
            className="inline-block bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-6 py-3 rounded-xl shadow-md"
          >
            Go to Login →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-white px-4 sm:px-6 py-8 sm:py-10">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-3xl font-bold text-emerald-700">🎯 Financial Quests</h1>
          <p className="text-gray-600">
            Daily bucket: <span className="font-mono">{today}</span> • Weekly bucket (Mon):{" "}
            <span className="font-mono">{weekStart}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Link
            href="/dashboard"
            className="bg-white hover:bg-emerald-50 transition text-emerald-700 font-semibold px-4 sm:px-5 py-3 rounded-xl shadow-md border border-emerald-200"
          >
            ← Dashboard
          </Link>
          <Link
            href="/party"
            className="bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-4 sm:px-5 py-3 rounded-xl shadow-md"
          >
            👥 Party
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
          <div className="text-sm text-gray-600 mt-1">Saved to Supabase in real time.</div>
        </Card>

        <Card>
          <CardTitle>💰 Estimated Saved</CardTitle>
          <div className="text-4xl font-bold text-emerald-700">{formatMoneyCents(stats.savedCents)}</div>
          <div className="text-sm text-gray-600 mt-1">Used for party progress + leaderboard.</div>
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
                checked={isChecked(q)}
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
                checked={isChecked(q)}
                busy={busyQuestId === q.id}
                onToggle={() => toggleQuest(q)}
              />
            ))}
          </div>

          <div className="mt-6 text-xs text-gray-500">
            Weekly quests are “once per week” by storing completions on Monday’s date (week bucket).
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
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`mt-0.5 h-5 w-5 rounded border flex items-center justify-center ${
            checked ? "bg-emerald-600 border-emerald-600" : "bg-white border-gray-300"
          }`}
          aria-hidden="true"
        >
          {checked ? <span className="text-white text-xs font-bold">✓</span> : null}
        </div>

        <div className="min-w-0">
          <div className={`font-medium truncate ${checked ? "text-emerald-900" : "text-gray-800"}`}>
            {quest.title}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Reward: <span className="font-semibold">{quest.reward_points} pts</span>
            {quest.est_saved_cents > 0 ? (
              <>
                {" "}
                • Est. saved: <span className="font-semibold">{formatMoneyCents(quest.est_saved_cents)}</span>
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