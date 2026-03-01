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

type Party = {
  name: string;
  joinCode: string;
  weeklyGoal: number;
  members: { name: string; points: number }[];
};

type QuestCompletionMap = Record<string, boolean>;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "CAD" });
}

function partyStorageKey() {
  return "calendarquest_party_v1";
}

function completionsStorageKey() {
  return "calendarquest_completions_v1";
}

/**
 * Rough mapping of quest IDs -> estimated dollars saved.
 * (Keeps it demo-friendly and consistent with Quests page.)
 */
const QUEST_EST_SAVED: Record<string, number> = {
  coffee: 4,
  move5: 5,
  lunch: 10,
  nodelivery: 20,
  wk_buffer: 40, // will be overridden by label logic later; fine for demo
  wk_party: 30,
};

function estimateSavedFromCompletions(completed: QuestCompletionMap) {
  return Object.entries(completed).reduce((sum, [id, done]) => {
    if (!done) return sum;
    return sum + (QUEST_EST_SAVED[id] ?? 0);
  }, 0);
}

export default function PartyPage() {
  const [data, setData] = useState<DemoPayload | null>(null);

  // The party you are "actually using" (stored locally)
  const [party, setParty] = useState<Party | null>(null);

  // Form
  const [mode, setMode] = useState<"join" | "create">("join");
  const [nameInput, setNameInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [goalInput, setGoalInput] = useState("60");

  // Quest completions (for progress)
  const [completed, setCompleted] = useState<QuestCompletionMap>({});

  useEffect(() => {
    // Load demo payload (fallback)
    const raw = localStorage.getItem("calendarquest_demo");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as DemoPayload;
        setData(parsed);
      } catch (e) {
        console.error("Failed to parse demo payload:", e);
      }
    }

    // Load party state (if exists)
    const pRaw = localStorage.getItem(partyStorageKey());
    if (pRaw) {
      try {
        setParty(JSON.parse(pRaw));
      } catch {
        // ignore
      }
    }

    // Load quest completions
    const cRaw = localStorage.getItem(completionsStorageKey());
    if (cRaw) {
      try {
        setCompleted(JSON.parse(cRaw));
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (party) localStorage.setItem(partyStorageKey(), JSON.stringify(party));
  }, [party]);

  const activeParty = useMemo<Party | null>(() => {
    // If user has created/joined a party, use that.
    // Otherwise, show demo party.
    if (party) return party;
    if (data?.party) return data.party;
    return null;
  }, [party, data]);

  const youName = useMemo(() => data?.user.name ?? "You", [data]);

  const estSaved = useMemo(() => estimateSavedFromCompletions(completed), [completed]);

  const goal = activeParty?.weeklyGoal ?? 60;
  const progressPct = clamp((estSaved / goal) * 100, 0, 100);

  const joinDemoParty = () => {
    if (!data) return;
    setParty({
      name: data.party.name,
      joinCode: data.party.joinCode,
      weeklyGoal: data.party.weeklyGoal,
      members: data.party.members,
    });
  };

  const handleCreate = () => {
    const partyName = nameInput.trim() || "My Lab Group";
    const joinCode = (codeInput.trim() || "JEKYLL").toUpperCase().slice(0, 10);
    const weeklyGoal = Math.max(10, Number(goalInput) || 60);

    const newParty: Party = {
      name: partyName,
      joinCode,
      weeklyGoal,
      members: [
        { name: youName, points: 0 },
        { name: "Alex", points: 0 },
        { name: "Sam", points: 0 },
      ],
    };

    setParty(newParty);
  };

  const handleJoin = () => {
    const joinCode = (codeInput.trim() || "").toUpperCase().slice(0, 10);
    if (!joinCode) return;

    // Hackathon-friendly: joining just creates a party shell locally.
    // In Supabase version, you'd query by code and join a real party.
    const joined: Party = {
      name: "Joined Lab Group",
      joinCode,
      weeklyGoal: 60,
      members: [
        { name: youName, points: 0 },
        { name: "Member A", points: 0 },
        { name: "Member B", points: 0 },
      ],
    };

    setParty(joined);
  };

  const resetParty = () => {
    setParty(null);
    localStorage.removeItem(partyStorageKey());
  };

  const cheer = (memberName: string) => {
    if (!activeParty) return;
    const next = {
      ...activeParty,
      members: activeParty.members.map((m) =>
        m.name === memberName ? { ...m, points: m.points + 1 } : m
      ),
    };
    setParty(next);
  };

  if (!data) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-white px-6 py-16">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg border border-emerald-100 p-8">
          <h1 className="text-2xl font-bold text-emerald-700 mb-2">
            Lab Group
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-white px-6 py-10">
      <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-emerald-700">👥 Lab Group</h1>
          <p className="text-gray-600">
            Peer accountability drives behavior change. Join a group, complete quests, and hit a shared savings goal.
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
            href="/quests"
            className="bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-5 py-3 rounded-xl shadow-md"
          >
            🎯 Quests
          </Link>
        </div>
      </div>

      {/* Progress + party summary */}
      <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardTitle>🏁 Weekly Goal Progress</CardTitle>
          <div className="text-4xl font-bold text-emerald-700">{Math.round(progressPct)}%</div>
          <div className="text-sm text-gray-600 mt-1">
            Est. saved: <span className="font-semibold">{formatMoney(estSaved)}</span> /{" "}
            <span className="font-semibold">{formatMoney(goal)}</span>
          </div>
          <div className="h-2 rounded-full bg-emerald-100 overflow-hidden mt-4">
            <div className="h-2 bg-emerald-600" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="mt-4 text-xs text-gray-500">
            Demo uses quest completions as “estimated saved.” Later: integrate transactions/CSV.
          </div>
        </Card>

        <Card>
          <CardTitle>🧪 Active Group</CardTitle>
          {activeParty ? (
            <>
              <div className="text-sm text-gray-600">
                Name: <span className="font-semibold text-gray-800">{activeParty.name}</span>
              </div>
              <div className="text-sm text-gray-600">
                Join code:{" "}
                <span className="font-mono font-semibold text-emerald-700">{activeParty.joinCode}</span>
              </div>
              <div className="text-sm text-gray-600 mt-2">
                Weekly goal: <span className="font-semibold">{formatMoney(activeParty.weeklyGoal)}</span>
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  onClick={resetParty}
                  className="bg-white hover:bg-emerald-50 transition text-emerald-700 font-semibold px-4 py-2 rounded-xl border border-emerald-200"
                >
                  Reset
                </button>
                {!party ? (
                  <button
                    onClick={joinDemoParty}
                    className="bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-4 py-2 rounded-xl"
                  >
                    Use Demo Group
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="text-gray-600 text-sm">
              No group yet — create or join below.
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>🤝 Social Mechanic</CardTitle>
          <p className="text-sm text-gray-600">
            “Cheer” a teammate to keep momentum. It’s lightweight, but it demonstrates the RBC requirement:
            <span className="font-semibold"> peer engagement drives behavior change.</span>
          </p>
          <div className="mt-4 text-xs text-gray-500">
            Later: add comments, streak reminders, and shared challenges.
          </div>
        </Card>
      </div>

      {/* Create / Join */}
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardTitle>➕ Create a Lab Group</CardTitle>

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
              <Field label="Group name">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Burnaby Savers"
                  className="w-full rounded-xl border border-emerald-200 px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </Field>

              <Field label="Join code">
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="JEKYLL"
                  className="w-full rounded-xl border border-emerald-200 px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </Field>

              <Field label="Weekly savings goal (CAD)">
                <input
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  placeholder="60"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-emerald-200 px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </Field>

              <button
                onClick={handleCreate}
                className="bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-5 py-3 rounded-xl shadow-md"
              >
                Create Group
              </button>

              <div className="text-xs text-gray-500">
                Hackathon version stores groups locally. Supabase version makes it real-time multiplayer.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Enter join code">
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="JEKYLL"
                  className="w-full rounded-xl border border-emerald-200 px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </Field>

              <button
                onClick={handleJoin}
                className="bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-5 py-3 rounded-xl shadow-md"
              >
                Join Group
              </button>

              <div className="text-xs text-gray-500">
                In the full build, this would find a real group by code and add you as a member.
              </div>
            </div>
          )}
        </Card>

        {/* Leaderboard */}
        <Card>
          <CardTitle>🏅 Leaderboard</CardTitle>
          {activeParty ? (
            <div className="space-y-2">
              {activeParty.members
                .slice()
                .sort((a, b) => b.points - a.points)
                .map((m) => (
                  <div
                    key={m.name}
                    className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3"
                  >
                    <div>
                      <div className="font-medium text-gray-800">{m.name}</div>
                      <div className="text-xs text-gray-500">{m.points} pts</div>
                    </div>

                    <button
                      onClick={() => cheer(m.name)}
                      className="bg-white hover:bg-emerald-100 transition text-emerald-700 font-semibold px-3 py-2 rounded-xl border border-emerald-200 text-sm"
                    >
                      👏 Cheer
                    </button>
                  </div>
                ))}

              <div className="mt-4 text-sm text-gray-600">
                <span className="font-semibold">Pitch line:</span> “Even lightweight social feedback increases follow-through.”
              </div>
            </div>
          ) : (
            <div className="text-gray-600 text-sm">
              Create or join a group to see the leaderboard.
            </div>
          )}
        </Card>
      </div>

      {/* Footer tip */}
      <div className="max-w-5xl mx-auto text-xs text-gray-500">
        Tip: For judging, emphasize that the group goal is driven by your weekly chaos level (calendar density + bills + social load).
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
    <h2 className="text-lg font-semibold text-emerald-700 mb-4">{children}</h2>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-semibold text-gray-700 mb-1">{label}</div>
      {children}
    </div>
  );
}