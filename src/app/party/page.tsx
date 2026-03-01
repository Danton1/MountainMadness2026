"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Party = {
  id: string;
  name: string;
  join_code: string;
  weekly_goal_cents: number;
  created_by: string;
};

type MemberRow = {
  user_id: string;
  profiles: {
    display_name: string | null;
  } | null;
};

type QuestCounts = {
  dailyCount: number;
  weeklyCount: number;
};

type Quest = {
  reward_points: number;
  est_saved_cents: number;
};

type CompletionRow = {
  user_id: string;
  completed_day: string;
  quests: Quest | null;
};

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

function formatMoneyCents(cents: number) {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "CAD",
  });
}

function weekStartUTCDateString(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function todayUTCDateString(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function randomJoinCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const INPUT_CLASS =
  "w-full rounded-xl border border-emerald-200 px-4 py-2 text-black placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400";

export default function PartyPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [userId, setUserId] = useState<string | null>(null);

  const [myParties, setMyParties] = useState<Party[]>([]);
  const [activeParty, setActiveParty] = useState<Party | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<
    { user_id: string; name: string; points: number; saved_cents: number }[]
  >([]);

  const [mode, setMode] = useState<"create" | "join">("create");
  const [nameInput, setNameInput] = useState("");
  const [goalInput, setGoalInput] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [busy, setBusy] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const [questCounts, setQuestCounts] = useState<QuestCounts>({ dailyCount: 0, weeklyCount: 0 });
  const [partyCompletionCount, setPartyCompletionCount] = useState(0);

  const [cheeredToday, setCheeredToday] = useState<Set<string>>(new Set());
  const [cheerCountsToday, setCheerCountsToday] = useState<Record<string, number>>({});

  const refreshAll = async () => {
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) logSupabaseError("auth.getUser failed", authErr);

    const uid = auth.user?.id ?? null;
    setUserId(uid);
    if (!uid) return;

    const { data: pm, error: pmErr } = await supabase
      .from("party_members")
      .select("party_id, parties:parties(id,name,join_code,weekly_goal_cents,created_by)")
      .eq("user_id", uid);

    if (pmErr) {
      logSupabaseError("party_members select (my parties) failed", pmErr);
      return;
    }

    const parties = (pm ?? []).map((r: any) => r.parties as Party).filter(Boolean);
    setMyParties(parties);

    if (!activeParty && parties.length > 0) setActiveParty(parties[0]);
    if (activeParty && !parties.some((p) => p.id === activeParty.id)) setActiveParty(parties[0] ?? null);
  };

  const fetchQuestCounts = async () => {
    const { data, error } = await supabase.from("quests").select("kind");
    if (error) {
      logSupabaseError("quests select (counts) failed", error);
      setQuestCounts({ dailyCount: 0, weeklyCount: 0 });
      return;
    }
    const kinds = (data ?? []) as { kind: "daily" | "weekly" }[];
    const dailyCount = kinds.filter((k) => k.kind === "daily").length;
    const weeklyCount = kinds.filter((k) => k.kind === "weekly").length;
    setQuestCounts({ dailyCount, weeklyCount });
  };

  const refreshMembersAndStats = async (party: Party, uid: string | null) => {
    const { data: mem, error: memErr } = await supabase
      .from("party_members")
      .select("user_id, profiles:profiles(display_name)")
      .eq("party_id", party.id);

    if (memErr) {
      logSupabaseError("party_members select (members) failed", memErr);
      return;
    }

    const memberRows = (mem ?? []) as unknown as MemberRow[];
    setMembers(memberRows);

    const ids = memberRows.map((m) => m.user_id);
    if (ids.length === 0) {
      setLeaderboard([]);
      setPartyCompletionCount(0);
      setCheeredToday(new Set());
      setCheerCountsToday({});
      return;
    }

    const weekStart = weekStartUTCDateString();
    const { data: comps, error: compErr } = await supabase
      .from("quest_completions")
      .select("user_id, completed_day, quests:quests(reward_points,est_saved_cents)")
      .in("user_id", ids)
      .gte("completed_day", weekStart);

    if (compErr) {
      logSupabaseError("quest_completions select (party stats) failed", compErr);
      return;
    }

    const rows = (comps ?? []) as unknown as CompletionRow[];
    setPartyCompletionCount(rows.length);

    const agg = new Map<string, { points: number; saved_cents: number }>();
    for (const r of rows) {
      const cur = agg.get(r.user_id) ?? { points: 0, saved_cents: 0 };
      cur.points += r.quests?.reward_points ?? 0;
      cur.saved_cents += r.quests?.est_saved_cents ?? 0;
      agg.set(r.user_id, cur);
    }

    const board = memberRows.map((m) => ({
      user_id: m.user_id,
      name: m.user_id === uid ? "You" : (m.profiles?.display_name ?? m.user_id.slice(0, 8)),
      points: agg.get(m.user_id)?.points ?? 0,
      saved_cents: agg.get(m.user_id)?.saved_cents ?? 0,
    }));

    board.sort((a, b) => b.saved_cents - a.saved_cents || b.points - a.points);
    setLeaderboard(board);

    const today = todayUTCDateString();

    const { data: myCheers, error: myCheersErr } = await supabase
      .from("cheers")
      .select("to_user_id")
      .eq("party_id", party.id)
      .eq("from_user_id", uid ?? "")
      .eq("cheer_day", today);

    if (myCheersErr) {
      logSupabaseError("cheers select (my cheers) failed", myCheersErr);
      setCheeredToday(new Set());
    } else {
      const set = new Set<string>((myCheers ?? []).map((r: any) => r.to_user_id as string));
      setCheeredToday(set);
    }

    const { data: todaysCheers, error: todaysCheersErr } = await supabase
      .from("cheers")
      .select("to_user_id")
      .eq("party_id", party.id)
      .eq("cheer_day", today);

    if (todaysCheersErr) {
      logSupabaseError("cheers select (today counts) failed", todaysCheersErr);
      setCheerCountsToday({});
    } else {
      const counts: Record<string, number> = {};
      for (const r of todaysCheers ?? []) {
        const id = (r as any).to_user_id as string;
        counts[id] = (counts[id] ?? 0) + 1;
      }
      setCheerCountsToday(counts);
    }
  };

  useEffect(() => {
    refreshAll();
    fetchQuestCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeParty) refreshMembersAndStats(activeParty, userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeParty, userId]);

  const createParty = async () => {
    if (!userId) return;
    setBusy(true);

    try {
      const weekly_goal_cents = Math.max(1000, Math.round(((Number(goalInput) || 60) * 100)));
      const partyName = nameInput.trim() || "My Party";

      let party: Party | null = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const join_code = randomJoinCode().toUpperCase();

        const { data, error } = await supabase
          .from("parties")
          .insert({
            name: partyName,
            join_code,
            weekly_goal_cents,
            created_by: userId,
          })
          .select()
          .single();

        if (!error) {
          party = data as Party;
          break;
        }

        if (error.code === "23505") continue;
        throw error;
      }

      if (!party) {
        console.error("Could not generate a unique join code after retries.");
        return;
      }

      const { error: mErr } = await supabase.from("party_members").insert({
        party_id: party.id,
        user_id: userId,
        role: "owner",
      });

      if (mErr) throw mErr;

      await refreshAll();
      setActiveParty(party);

      setNameInput("");
      setGoalInput("");
      setMode("join");
    } catch (e) {
      logSupabaseError("createParty failed", e);
    } finally {
      setBusy(false);
    }
  };

  const joinParty = async () => {
    if (!userId) return;
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) return;

    setBusy(true);
    try {
      const { data: party, error: pErr } = await supabase
        .from("parties")
        .select("*")
        .eq("join_code", code)
        .single();

      if (pErr) throw pErr;

      const { error: mErr } = await supabase.from("party_members").insert({
        party_id: (party as Party).id,
        user_id: userId,
        role: "member",
      });

      if (mErr && mErr.code !== "23505") throw mErr;

      await refreshAll();
      setActiveParty(party as Party);
      setJoinCodeInput("");
    } catch (e) {
      logSupabaseError("joinParty failed", e);
    } finally {
      setBusy(false);
    }
  };

  const leaveParty = async () => {
    if (!userId || !activeParty) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("party_members")
        .delete()
        .eq("party_id", activeParty.id)
        .eq("user_id", userId);

      if (error) throw error;

      setInviteOpen(false);
      setCopied(false);
      setActiveParty(null);
      await refreshAll();
    } catch (e) {
      logSupabaseError("leaveParty failed", e);
    } finally {
      setBusy(false);
    }
  };

  const cheerMember = async (toUserId: string) => {
    if (!userId || !activeParty) return;
    if (toUserId === userId) return;

    const today = todayUTCDateString();
    try {
      const { error } = await supabase.from("cheers").insert({
        party_id: activeParty.id,
        from_user_id: userId,
        to_user_id: toUserId,
        cheer_day: today,
      });

      if (error) {
        if (error.code === "23505") {
          setCheeredToday((prev) => new Set(prev).add(toUserId));
          return;
        }
        throw error;
      }

      setCheeredToday((prev) => new Set(prev).add(toUserId));
      setCheerCountsToday((prev) => ({
        ...prev,
        [toUserId]: (prev[toUserId] ?? 0) + 1,
      }));
    } catch (e) {
      logSupabaseError("cheerMember failed", e);
    }
  };

  const progressMoney = useMemo(() => {
    const goal = activeParty?.weekly_goal_cents ?? 6000;
    const totalSaved = leaderboard.reduce((s, r) => s + r.saved_cents, 0);
    const pct = goal === 0 ? 0 : Math.max(0, Math.min(100, Math.round((totalSaved / goal) * 100)));
    return { goal, totalSaved, pct };
  }, [activeParty, leaderboard]);

  const progressQuests = useMemo(() => {
    const memberCount = members.length;
    const possiblePerMember = questCounts.dailyCount * 7 + questCounts.weeklyCount;
    const totalPossible = memberCount * possiblePerMember;
    const pct =
      totalPossible === 0 ? 0 : Math.max(0, Math.min(100, Math.round((partyCompletionCount / totalPossible) * 100)));
    return { memberCount, possiblePerMember, totalPossible, completed: partyCompletionCount, pct };
  }, [members.length, questCounts.dailyCount, questCounts.weeklyCount, partyCompletionCount]);

  const copyInvite = async () => {
    if (!activeParty) return;
    try {
      await navigator.clipboard.writeText(activeParty.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      console.error("Clipboard copy failed", e);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-white px-4 sm:px-6 py-8 sm:py-10">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-3xl font-bold text-emerald-700">👥 Party</h1>
          <p className="text-gray-600">Real users, real parties, real progress.</p>
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Link
            href="/dashboard"
            className="bg-white hover:bg-emerald-50 transition text-emerald-700 font-semibold px-4 sm:px-5 py-3 rounded-xl shadow-md border border-emerald-200"
          >
            ← Dashboard
          </Link>
          <Link
            href="/quests"
            className="bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-4 sm:px-5 py-3 rounded-xl shadow-md"
          >
            🎯 Quests
          </Link>
          <button
            onClick={() => setInviteOpen(true)}
            disabled={!activeParty}
            className="bg-white hover:bg-emerald-50 transition text-emerald-700 font-semibold px-4 sm:px-5 py-3 rounded-xl shadow-md border border-emerald-200 disabled:opacity-50"
          >
            📩 Invite
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto grid lg:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardTitle>🏁 Weekly Goal</CardTitle>
          <div className="text-4xl font-bold text-emerald-700">{progressMoney.pct}%</div>
          <div className="text-sm text-gray-600 mt-1">
            Saved: <span className="font-semibold">{formatMoneyCents(progressMoney.totalSaved)}</span> /{" "}
            <span className="font-semibold">{formatMoneyCents(progressMoney.goal)}</span>
          </div>
          <div className="h-2 rounded-full bg-emerald-100 overflow-hidden mt-4">
            <div className="h-2 bg-emerald-600" style={{ width: `${progressMoney.pct}%` }} />
          </div>
          <div className="mt-3 text-xs text-gray-500">
            {activeParty ? (
              <>
                Active: <span className="font-semibold">{activeParty.name}</span>
              </>
            ) : (
              "No active party selected."
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>✅ Party Quest Completion</CardTitle>
          <div className="text-4xl font-bold text-emerald-700">{progressQuests.pct}%</div>
          <div className="text-sm text-gray-600 mt-1">
            Completed: <span className="font-semibold">{progressQuests.completed}</span> /{" "}
            <span className="font-semibold">{progressQuests.totalPossible}</span>
          </div>
          <div className="h-2 rounded-full bg-emerald-100 overflow-hidden mt-4">
            <div className="h-2 bg-emerald-600" style={{ width: `${progressQuests.pct}%` }} />
          </div>
          <div className="mt-3 text-xs text-gray-500">
            {progressQuests.memberCount} members • {questCounts.dailyCount} daily • {questCounts.weeklyCount} weekly
          </div>
        </Card>

        <Card>
          <CardTitle>💼 Your Parties</CardTitle>
          {myParties.length === 0 ? (
            <p className="text-sm text-gray-600">You’re not in any parties yet.</p>
          ) : (
            <div className="space-y-2">
              {myParties.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActiveParty(p)}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                    activeParty?.id === p.id
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-white hover:bg-emerald-50 border-emerald-100"
                  }`}
                >
                  <div className="font-semibold text-gray-800">{p.name}</div>
                  <div className="text-xs text-gray-500">
                    Code: <span className="font-mono">{p.join_code}</span> • Goal:{" "}
                    {formatMoneyCents(p.weekly_goal_cents)}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={refreshAll}
              disabled={busy}
              className="bg-white hover:bg-emerald-50 transition text-emerald-700 font-semibold px-4 py-2 rounded-xl border border-emerald-200 disabled:opacity-60"
            >
              Refresh
            </button>
            <button
              onClick={leaveParty}
              disabled={busy || !activeParty}
              className="bg-white hover:bg-emerald-50 transition text-emerald-700 font-semibold px-4 py-2 rounded-xl border border-emerald-200 disabled:opacity-60"
            >
              Leave Active
            </button>
          </div>
        </Card>
      </div>

      <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardTitle>➕ Create / Join</CardTitle>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode("create")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border ${
                mode === "create"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              Create
            </button>
            <button
              onClick={() => setMode("join")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border ${
                mode === "join"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              Join
            </button>
          </div>

          {mode === "create" ? (
            <div className="space-y-3">
              <Field label="Party name">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Burnaby Savers"
                  className={INPUT_CLASS}
                />
              </Field>

              <Field label="Weekly goal (CAD)">
                <input
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  inputMode="numeric"
                  placeholder="60"
                  className={INPUT_CLASS}
                />
              </Field>

              <button
                onClick={createParty}
                disabled={busy}
                className="w-full bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-5 py-3 rounded-xl shadow-md disabled:opacity-60"
              >
                {busy ? "Working..." : "Create Party"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Enter join code">
                <input
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value)}
                  placeholder="JEKYLL"
                  className={INPUT_CLASS}
                />
              </Field>

              <button
                onClick={joinParty}
                disabled={busy || !joinCodeInput.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-5 py-3 rounded-xl shadow-md disabled:opacity-60"
              >
                {busy ? "Working..." : "Join Party"}
              </button>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>👥 Members</CardTitle>
          {activeParty ? (
            <div className="space-y-2">
              {members.map((m) => {
                const name = m.user_id === userId ? "You" : (m.profiles?.display_name ?? m.user_id.slice(0, 8));
                const canCheer = !!userId && m.user_id !== userId && !cheeredToday.has(m.user_id);
                const cheers = cheerCountsToday[m.user_id] ?? 0;

                return (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between gap-3 bg-white border border-emerald-100 rounded-xl px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-gray-800 truncate">{name}</div>
                      <div className="text-xs text-gray-500">
                        Cheers today: <span className="font-semibold">{cheers}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => cheerMember(m.user_id)}
                        disabled={!canCheer}
                        className="bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-3 py-2 rounded-xl shadow-md disabled:opacity-50"
                        title={m.user_id === userId ? "You can’t cheer yourself" : canCheer ? "Cheer once per day" : "Already cheered today"}
                      >
                        👏 Cheer
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-600">Select a party to see members.</p>
          )}
        </Card>
      </div>

      <div className="max-w-5xl mx-auto">
        <Card>
          <CardTitle>🏅 Leaderboard (This Week)</CardTitle>
          {activeParty ? (
            leaderboard.length ? (
              <div className="space-y-2">
                {leaderboard.map((r) => (
                  <div
                    key={r.user_id}
                    className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800 truncate">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.points} pts</div>
                    </div>
                    <div className="font-semibold text-emerald-700">{formatMoneyCents(r.saved_cents)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600">No completions yet this week. Go do some quests.</p>
            )
          ) : (
            <p className="text-sm text-gray-600">Select a party to view leaderboard.</p>
          )}
        </Card>
      </div>

      {inviteOpen && activeParty ? (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 z-50"
          onClick={() => {
            setInviteOpen(false);
            setCopied(false);
          }}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-emerald-100 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-emerald-700">📩 Invite to {activeParty.name}</h3>
                <p className="text-sm text-gray-600 mt-1">Share this join code:</p>
              </div>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => {
                  setInviteOpen(false);
                  setCopied(false);
                }}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="font-mono text-xl font-bold text-emerald-800 tracking-widest">
                {activeParty.join_code}
              </div>
              <button
                onClick={copyInvite}
                className="bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-4 py-2 rounded-xl shadow-md"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl shadow-lg border border-emerald-100 p-6">{children}</div>;
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-emerald-700 mb-4">{children}</h2>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-semibold text-gray-700 mb-1">{label}</div>
      {children}
    </div>
  );
}