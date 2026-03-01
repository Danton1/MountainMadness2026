"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabase/browser";

type EventType = "work" | "social" | "deadline" | "bill";

type DbEvent = {
  id: string;
  user_id: string;
  title: string;
  type: EventType;
  start_at: string; // timestamptz
  end_at: string; // timestamptz
};

type Party = {
  id: string;
  name: string;
  join_code: string;
  weekly_goal_cents: number;
  created_by: string;
};

type PartyMember = {
  user_id: string;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
};

type Quest = {
  reward_points: number;
  est_saved_cents: number;
};

type CompletionRow = {
  user_id: string;
  completed_day: string; // YYYY-MM-DD
  quests: Quest | null;
};

type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  country: string;
};

type QuestCounts = { dailyCount: number; weeklyCount: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatMoneyCents(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "CAD" });
}

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "CAD" });
}

function weekStartUTCDateString(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0 Sun ... 6 Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
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

function computeWeekRisk(events: DbEvent[]) {
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

function next7DaysISO() {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return { start: now.toISOString(), end: end.toISOString() };
}

export default function DashboardPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const weekStart = useMemo(() => weekStartUTCDateString(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [myParties, setMyParties] = useState<Party[]>([]);
  const [activeParty, setActiveParty] = useState<Party | null>(null);

  const [members, setMembers] = useState<PartyMember[]>([]);
  const memberIdsRef = useRef<string[]>([]);
  const activePartyIdRef = useRef<string | null>(null);

  const [partyAgg, setPartyAgg] = useState<{ points: number; saved_cents: number; completionCount: number }>({
    points: 0,
    saved_cents: 0,
    completionCount: 0,
  });

  const [questCounts, setQuestCounts] = useState<QuestCounts>({ dailyCount: 0, weeklyCount: 0 });
  const [events, setEvents] = useState<DbEvent[]>([]);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // -------------------- Loads --------------------
  const loadAuthAndProfile = async () => {
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) logSupabaseError("auth.getUser failed", authErr);

    const uid = auth.user?.id ?? null;
    setUserId(uid);
    if (!uid) return;

    const { data: p, error: pErr } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, country")
      .eq("id", uid)
      .single();

    if (pErr) {
      logSupabaseError("profiles select failed", pErr);
      setProfile(null);
    } else {
      setProfile(p as Profile);
    }
  };

  const loadMyParties = async (uid: string) => {
    const { data: pm, error: pmErr } = await supabase
      .from("party_members")
      .select("party_id, parties:parties(id,name,join_code,weekly_goal_cents,created_by)")
      .eq("user_id", uid);

    if (pmErr) {
      logSupabaseError("party_members select (my parties) failed", pmErr);
      setMyParties([]);
      return;
    }

    const parties = (pm ?? []).map((r: any) => r.parties as Party).filter(Boolean);
    setMyParties(parties);

    // Keep current active if still present; otherwise choose first
    setActiveParty((prev) => {
      if (prev && parties.some((p) => p.id === prev.id)) return prev;
      return parties[0] ?? null;
    });
  };

  const loadMembers = async (partyId: string) => {
    const { data: mem, error: memErr } = await supabase
      .from("party_members")
      .select("user_id, profiles:profiles(display_name, avatar_url)")
      .eq("party_id", partyId);

    if (memErr) {
      logSupabaseError("party_members select (members) failed", memErr);
      setMembers([]);
      memberIdsRef.current = [];
      return;
    }

    const rows = (mem ?? []) as unknown as PartyMember[];
    setMembers(rows);
    memberIdsRef.current = rows.map((m) => m.user_id);
  };

  const loadQuestCounts = async () => {
    const { data, error } = await supabase.from("quests").select("kind");
    if (error) {
      logSupabaseError("quests select (counts) failed", error);
      setQuestCounts({ dailyCount: 0, weeklyCount: 0 });
      return;
    }
    const kinds = (data ?? []) as { kind: "daily" | "weekly" }[];
    setQuestCounts({
      dailyCount: kinds.filter((k) => k.kind === "daily").length,
      weeklyCount: kinds.filter((k) => k.kind === "weekly").length,
    });
  };

  const loadPartyAggregate = async (memberIds: string[]) => {
    if (memberIds.length === 0) {
      setPartyAgg({ points: 0, saved_cents: 0, completionCount: 0 });
      return;
    }

    const { data, error } = await supabase
      .from("quest_completions")
      .select("user_id, completed_day, quests:quests(reward_points,est_saved_cents)")
      .in("user_id", memberIds)
      .gte("completed_day", weekStart);

    if (error) {
      logSupabaseError("quest_completions select (party agg) failed", error);
      setPartyAgg({ points: 0, saved_cents: 0, completionCount: 0 });
      return;
    }

    let points = 0;
    let saved_cents = 0;
    const rows = (data ?? []) as unknown as CompletionRow[];
    for (const r of rows) {
      points += r.quests?.reward_points ?? 0;
      saved_cents += r.quests?.est_saved_cents ?? 0;
    }

    setPartyAgg({ points, saved_cents, completionCount: rows.length });
  };

  const loadEventsNext7Days = async (uid: string) => {
    const { start, end } = next7DaysISO();

    const { data, error } = await supabase
      .from("events")
      .select("id, user_id, title, type, start_at, end_at")
      .eq("user_id", uid)
      .gte("start_at", start)
      .lte("start_at", end)
      .order("start_at", { ascending: true });

    if (error) {
      logSupabaseError("events select failed", error);
      setEvents([]);
      return;
    }
    setEvents((data ?? []) as DbEvent[]);
  };

  // -------------------- Realtime --------------------
  const teardownRealtime = () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };

  const setupRealtime = (partyId: string) => {
    teardownRealtime();

    const ch = supabase.channel(`rt:party:${partyId}`);
    channelRef.current = ch;

    // When completions change, refresh aggregate using latest member IDs (ref)
    ch.on("postgres_changes", { event: "*", schema: "public", table: "quest_completions" }, async () => {
      const ids = memberIdsRef.current;
      await loadPartyAggregate(ids);
    });

    // When membership changes, reload members then aggregate
    ch.on("postgres_changes", { event: "*", schema: "public", table: "party_members" }, async () => {
      const pid = activePartyIdRef.current;
      if (!pid) return;
      await loadMembers(pid);
      await loadPartyAggregate(memberIdsRef.current);
    });

    ch.subscribe();
  };

  // -------------------- Effects --------------------
  useEffect(() => {
    loadAuthAndProfile();
    loadQuestCounts();
    return () => teardownRealtime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadMyParties(userId);
    loadEventsNext7Days(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    const pid = activeParty?.id ?? null;
    activePartyIdRef.current = pid;

    if (!pid) {
      teardownRealtime();
      setMembers([]);
      memberIdsRef.current = [];
      setPartyAgg({ points: 0, saved_cents: 0, completionCount: 0 });
      return;
    }

    (async () => {
      await loadMembers(pid);
      await loadPartyAggregate(memberIdsRef.current);
      setupRealtime(pid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeParty?.id]);

  // -------------------- Derived --------------------
  const risk = useMemo(() => computeWeekRisk(events), [events]);

  const bills = useMemo(() => {
    return events
      .filter((e) => e.type === "bill")
      .map((e) => ({
        name: e.title,
        due: new Date(e.start_at).toISOString().slice(0, 10),
      }));
  }, [events]);

  const financials = useMemo(() => {
    // Still demo-ish until user_settings has income + bill amounts
    const weeklyIncome = 800;
    const totalBills = 0;
    const buffer = risk.label === "Red" ? 80 : risk.label === "Yellow" ? 40 : 20;
    const safeToSpend = Math.max(0, weeklyIncome - totalBills - buffer);
    return { weeklyIncome, totalBills, recommendedBuffer: buffer, safeToSpend };
  }, [risk.label]);

  const chaosColor =
    risk.label === "Red" ? "text-red-600" : risk.label === "Yellow" ? "text-yellow-600" : "text-emerald-700";

  const chaosProgressPct = clamp((risk.score / 80) * 100, 0, 100);

  const partyMoneyPct = useMemo(() => {
    const goal = activeParty?.weekly_goal_cents ?? 0;
    if (!goal) return 0;
    return clamp(Math.round((partyAgg.saved_cents / goal) * 100), 0, 100);
  }, [activeParty?.weekly_goal_cents, partyAgg.saved_cents]);

  const partyQuestPct = useMemo(() => {
    const memberCount = members.length;
    const possiblePerMember = questCounts.dailyCount * 7 + questCounts.weeklyCount;
    const totalPossible = memberCount * possiblePerMember;
    if (!totalPossible) return 0;
    return clamp(Math.round((partyAgg.completionCount / totalPossible) * 100), 0, 100);
  }, [members.length, questCounts.dailyCount, questCounts.weeklyCount, partyAgg.completionCount]);

  const memberSnapshot = useMemo(() => {
    return members
      .map((m) => ({
        user_id: m.user_id,
        name: m.user_id === userId ? "You" : m.profiles?.display_name ?? m.user_id.slice(0, 8),
        avatar_url: m.profiles?.avatar_url ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, userId]);

  if (!userId) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-white px-6 py-16">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg border border-emerald-100 p-8">
          <h1 className="text-2xl font-bold text-emerald-700 mb-2">Dashboard</h1>
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
        <div className="flex items-center gap-4">
          <Avatar name={profile?.display_name ?? "You"} avatarUrl={profile?.avatar_url ?? null} />
          <div>
            <h1 className="text-3xl font-bold text-emerald-700">🧪 Weekly Report</h1>
            <p className="text-gray-600">
              Hello <span className="font-semibold">{profile?.display_name ?? "You"}</span> — here’s your
              calendar-driven financial forecast.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Link
            href="/quests"
            className="bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-4 sm:px-5 py-3 rounded-xl shadow-md"
          >
            🎯 Quests
          </Link>
          <Link
            href="/party"
            className="bg-white hover:bg-emerald-50 transition text-emerald-700 font-semibold px-4 sm:px-5 py-3 rounded-xl shadow-md border border-emerald-200"
          >
            👥 Party
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardTitle>📅 Chaos Index</CardTitle>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className={`text-4xl font-bold ${chaosColor}`}>{risk.score}</div>
              <div className="text-gray-600 text-sm">
                Status: <span className={`font-semibold ${chaosColor}`}>{risk.label}</span>
              </div>
            </div>

            <div className="w-40">
              <div className="h-2 rounded-full bg-emerald-100 overflow-hidden">
                <div className="h-2 bg-emerald-600" style={{ width: `${chaosProgressPct}%` }} />
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Top risk days: <span className="font-semibold">{risk.topRiskDays.join(", ")}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 text-xs text-gray-500">
            Powered by your <span className="font-semibold">events</span> table (work/social/deadlines/bills).
          </div>
        </Card>

        <Card>
          <CardTitle>💸 Bills Due</CardTitle>
          {bills.length === 0 ? (
            <div className="text-sm text-gray-600">
              No bill events found. Add events with type <span className="font-mono">bill</span>.
            </div>
          ) : (
            <ul className="space-y-2">
              {bills.map((b) => (
                <li key={`${b.name}-${b.due}`} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium text-gray-800">{b.name}</div>
                    <div className="text-gray-500">Due {b.due}</div>
                  </div>
                  <div className="font-semibold text-gray-800">—</div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 text-xs text-gray-500">
            Next: store bill amounts in <span className="font-mono">events.meta</span> or create a{" "}
            <span className="font-mono">bills</span> table.
          </div>
        </Card>

        <Card>
          <CardTitle>🧾 Safe-to-Spend</CardTitle>
          <div className="text-4xl font-bold text-emerald-700">{formatMoney(financials.safeToSpend)}</div>
          <div className="text-sm text-gray-600 mt-2">
            Weekly income: <span className="font-semibold">{formatMoney(financials.weeklyIncome)}</span>{" "}
            <span className="text-xs text-gray-500">(temporary)</span>
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Recommended buffer: <span className="font-semibold">{formatMoney(financials.recommendedBuffer)}</span>
          </div>
          <div className="mt-4 text-xs text-gray-500">Buffer increases automatically on high-chaos weeks.</div>
        </Card>
      </div>

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
            Your spending risk rises when social events and deadlines stack up — especially near weekends.
          </div>
        </Card>

        <Card>
          <CardTitle>👥 Party Snapshot</CardTitle>
          {activeParty ? (
            <>
              <div className="text-sm text-gray-600">
                Party: <span className="font-semibold text-gray-800">{activeParty.name}</span>
              </div>
              <div className="text-sm text-gray-600">
                Join code:{" "}
                <span className="font-mono font-semibold text-emerald-700">{activeParty.join_code}</span>
                <span className="text-xs text-gray-500 ml-2">(realtime)</span>
              </div>

              <div className="mt-4">
                <div className="text-sm text-gray-600 flex justify-between mb-2">
                  <span>Weekly goal</span>
                  <span className="font-semibold">{formatMoneyCents(activeParty.weekly_goal_cents)}</span>
                </div>
                <div className="h-2 rounded-full bg-emerald-100 overflow-hidden">
                  <div className="h-2 bg-emerald-600" style={{ width: `${partyMoneyPct}%` }} />
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Based on <span className="font-semibold">est. saved</span> from quest completions.
                </div>
              </div>

              <div className="mt-4">
                <div className="text-sm text-gray-600 flex justify-between mb-2">
                  <span>Party quest completion</span>
                  <span className="font-semibold">{partyQuestPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-emerald-100 overflow-hidden">
                  <div className="h-2 bg-emerald-600" style={{ width: `${partyQuestPct}%` }} />
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Completed <span className="font-semibold">{partyAgg.completionCount}</span> quests this week.
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {memberSnapshot.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between text-sm bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MiniAvatar name={m.name} avatarUrl={m.avatar_url} />
                      <span className="font-medium text-gray-800 truncate">{m.name}</span>
                    </div>
                    <span className="text-xs text-gray-500 font-mono">{m.user_id.slice(0, 8)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex gap-2">
                <Link
                  href="/party"
                  className="bg-white hover:bg-emerald-50 transition text-emerald-700 font-semibold px-4 py-2 rounded-xl border border-emerald-200"
                >
                  Manage Party →
                </Link>
                <Link
                  href="/quests"
                  className="bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-4 py-2 rounded-xl"
                >
                  Start Quests →
                </Link>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-600">
              You’re not in a party yet. Go to <Link className="underline text-emerald-700" href="/party">Party</Link>{" "}
              to create or join.
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

/* UI helpers */
function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl shadow-lg border border-emerald-100 p-6">{children}</div>;
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-emerald-700 mb-4">{children}</h2>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
      <div className="text-2xl font-bold text-emerald-700">{value}</div>
      <div className="text-xs text-gray-600 mt-1">{label}</div>
    </div>
  );
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={56}
        height={56}
        className="h-14 w-14 rounded-2xl object-cover border border-emerald-100 shadow-sm"
      />
    );
  }
  const initial = (name?.[0] ?? "U").toUpperCase();
  return (
    <div className="h-14 w-14 rounded-2xl bg-emerald-600 text-white font-bold flex items-center justify-center shadow-sm">
      {initial}
    </div>
  );
}

function MiniAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={32}
        height={32}
        className="h-8 w-8 rounded-xl object-cover border border-emerald-100"
      />
    );
  }
  const initial = (name?.[0] ?? "U").toUpperCase();
  return (
    <div className="h-8 w-8 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
      {initial}
    </div>
  );
}