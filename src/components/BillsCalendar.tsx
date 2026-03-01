"use client";

import { useEffect, useMemo, useState } from "react";

export type BillCategory =
  | "House"
  | "Entertainment"
  | "Food"
  | "Education"
  | "Utilities"
  | "Transportation"
  | "Shopping"
  | "Others";

export type BillRecurrence = "none" | "weekly" | "monthly" | "yearly";

export type BillEvent = {
  id: string;
  title: string;
  start_at: string;
  amount_cents?: number | null;
  category?: BillCategory | null;
  recurrence?: BillRecurrence | null;
};

type CreateBillPayload = {
  title: string;
  start_at: string; // ISO
  amount_cents: number;
  category: BillCategory;
  recurrence: BillRecurrence;
};

function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function startOfCalendarGrid(d: Date) {
  const first = startOfMonth(d);
  const dow = first.getDay(); // 0..6
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - dow);
  return gridStart;
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function formatMoneyCents(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "CAD" });
}

function categoryEmoji(cat: BillCategory | null | undefined) {
  switch (cat) {
    case "House":
      return "🏠";
    case "Entertainment":
      return "🎮";
    case "Food":
      return "🍔";
    case "Education":
      return "📚";
    case "Utilities":
      return "💡";
    case "Transportation":
      return "🚌";
    case "Shopping":
      return "🛍️";
    default:
      return "🧾";
  }
}

function toNoonUTCISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate() +1).padStart(2, "0");
  return new Date(`${y}-${m}-${day}T12:00:00Z`).toISOString();
}


/**
 * Strips:
 *  - "[BILL] " prefix
 *  - a single leading emoji + space (best-effort)
 */
function cleanBillTitle(raw: string) {
  let s = raw ?? "";
  s = s.replace(/^\[BILL\]\s*/i, "").trim();
  s = s.replace(/^[^\w\d]+\s+/, "").trim(); // strip leading emoji/symbols
  return s;
}

export default function BillsCalendar({
  bills,
  month = new Date(),            // used as initial month (or controlled value if you pass it)
  onMonthChange,                 // parent can fetch bills for this month
  onCreateBill,
  onDeleteBill,
}: {
  bills: BillEvent[];
  month?: Date;
  onMonthChange?: (month: Date) => void;
  onCreateBill: (payload: CreateBillPayload) => Promise<void>;
  onDeleteBill?: (id: string) => Promise<void>;
}) {
  // -------------------- Month navigation --------------------
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(month));

  // If parent passes a new month prop, sync our view
  useEffect(() => {
    setViewMonth(startOfMonth(month));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month?.getFullYear?.(), month?.getMonth?.()]);

  const goToMonth = (m: Date) => {
    const next = startOfMonth(m);
    setViewMonth(next);
    onMonthChange?.(next);
  };

  const goPrev = () => goToMonth(addMonths(viewMonth, -1));
  const goNext = () => goToMonth(addMonths(viewMonth, 1));
  const goToday = () => goToMonth(new Date());

  // ---------- Map bills to YYYY-MM-DD ----------
  const map = useMemo(() => {
    const m = new Map<string, BillEvent[]>();
    for (const b of bills) {
      if (!b.start_at) continue;
      const day = ymdLocal(new Date(b.start_at));
      const arr = m.get(day) ?? [];
      arr.push(b);
      m.set(day, arr);
    }
    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => (a.start_at ?? "").localeCompare(b.start_at ?? ""));
      m.set(k, arr);
    }
    return m;
  }, [bills]);

  // ---------- Calendar grid ----------
  const days = useMemo(() => {
    const gridStart = startOfCalendarGrid(viewMonth);
    const grid: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      grid.push(d);
    }
    return grid;
  }, [viewMonth]);

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const todayKey = ymdLocal(new Date());

  // ---------- Modal state ----------
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form fields
  const [title, setTitle] = useState("Rent");
  const [amount, setAmount] = useState("1200");
  const [category, setCategory] = useState<BillCategory>("House");
  const [recurrence, setRecurrence] = useState<BillRecurrence>("monthly");

  const openForDay = (d: Date) => {
    setSelectedDay(d);
    setModalOpen(true);

    setTitle("Bill");
    setAmount("0");
    setCategory("Others");
    setRecurrence("none");
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedDay(null);
    setSaving(false);
  };

  const submit = async () => {
    if (!selectedDay) return;

    const cleanTitle = title.trim() || "Bill";
    const amountCents = Math.max(0, Math.round((Number(amount) || 0) * 100));
    const start_at = toNoonUTCISO(selectedDay);

    setSaving(true);
    try {
      await onCreateBill({
        title: cleanTitle, // clean title (no [BILL] tag)
        start_at,
        amount_cents: amountCents,
        category,
        recurrence,
      });
      closeModal();
    } catch (e) {
      console.error("Create bill failed", e);
      setSaving(false);
    }
  };

  const requestDelete = (bill: BillEvent) => {
    const clean = cleanBillTitle(bill.title);
    setDeleteTarget({ id: bill.id, title: clean || "Bill" });
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !onDeleteBill) {
      setDeleteTarget(null);
      return;
    }

    setDeleting(true);
    try {
      await onDeleteBill(deleteTarget.id);
      setDeleteTarget(null);
    } catch (e) {
      console.error("Delete bill failed", e);
    } finally {
      setDeleting(false);
    }
  };

  const selectedKey = selectedDay ? ymdLocal(selectedDay) : null;
  const selectedList = selectedKey ? map.get(selectedKey) ?? [] : [];

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-emerald-100 p-6">
      {/* Header + Month Nav */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-lg font-semibold text-emerald-700">🗓 Bills Calendar</h2>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="rounded-xl border border-emerald-200 px-3 py-2 text-emerald-700 hover:bg-emerald-50"
            title="Previous month"
          >
            ←
          </button>

          <button
            type="button"
            onClick={goToday}
            className="rounded-xl border border-emerald-200 px-3 py-2 text-emerald-700 hover:bg-emerald-50"
            title="Jump to current month"
          >
            Today
          </button>

          <button
            type="button"
            onClick={goNext}
            className="rounded-xl border border-emerald-200 px-3 py-2 text-emerald-700 hover:bg-emerald-50"
            title="Next month"
          >
            →
          </button>

          <div className="ml-2 text-sm text-gray-600 min-w-[160px] text-right">
            {viewMonth.toLocaleString(undefined, { month: "long", year: "numeric" })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-xs text-gray-500 mb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const key = ymdLocal(d);
          const inMonth = d >= monthStart && d <= monthEnd;
          const isToday = key === todayKey;
          const list = map.get(key) ?? [];

          return (
            <button
              key={key}
              type="button"
              onClick={() => openForDay(d)}
              className={`text-left min-h-[92px] rounded-xl border p-2 transition ${
                inMonth ? "bg-white border-emerald-100 hover:bg-emerald-50" : "bg-gray-50 border-gray-100 opacity-70"
              } ${isToday ? "ring-2 ring-emerald-200" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className={`text-xs font-semibold ${inMonth ? "text-gray-700" : "text-gray-400"}`}>
                  {d.getDate()}
                </div>
                {list.length ? (
                  <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                    {list.length}
                  </span>
                ) : null}
              </div>

              <div className="mt-2 space-y-1">
                {list.slice(0, 2).map((b) => {
                  const emoji = categoryEmoji(b.category ?? "Others");
                  const clean = cleanBillTitle(b.title);
                  const amountText =
                    typeof b.amount_cents === "number" ? ` • ${formatMoneyCents(b.amount_cents)}` : "";
                  const recur =
                    b.recurrence && b.recurrence !== "none" ? ` • ${b.recurrence}` : "";

                  return (
                    <div
                      key={b.id}
                      className="text-[11px] bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1 text-emerald-900"
                      title={`${clean}${amountText}${recur}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate min-w-0">
                          {emoji} {clean}
                          {typeof b.amount_cents === "number" ? (
                            <span className="text-[10px] text-emerald-700"> {formatMoneyCents(b.amount_cents)}</span>
                          ) : null}
                        </div>

                        {onDeleteBill ? (
                          <span
                            role="button"
                            title="Delete bill"
                            className="shrink-0 text-gray-500 hover:text-red-600 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              requestDelete(b);
                            }}
                          >
                            ✕
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {list.length > 2 ? <div className="text-[11px] text-gray-500">+{list.length - 2} more</div> : null}
              </div>
            </button>
          );
        })}
      </div>

      {/* Add Bill Modal */}
      {modalOpen && selectedDay ? (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 z-50" onClick={closeModal}>
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-emerald-100 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-emerald-700">Add Bill</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Due on <span className="font-mono">{ymdLocal(selectedDay)}</span>
                </p>
              </div>
              <button className="text-gray-500 hover:text-gray-700" onClick={closeModal}>
                ✕
              </button>
            </div>

            {/* Existing bills on this day */}
            {selectedList.length > 0 ? (
              <div className="mt-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">Bills on this day</div>
                <div className="space-y-2">
                  {selectedList.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-emerald-900 truncate">
                          {categoryEmoji(b.category ?? "Others")} {cleanBillTitle(b.title)}
                        </div>
                        <div className="text-xs text-gray-600">
                          {typeof b.amount_cents === "number" ? formatMoneyCents(b.amount_cents) : null}
                          {b.recurrence && b.recurrence !== "none" ? ` • ${b.recurrence}` : null}
                        </div>
                      </div>

                      {onDeleteBill ? (
                        <button
                          type="button"
                          className="text-gray-500 hover:text-red-600"
                          onClick={() => requestDelete(b)}
                          title="Delete bill"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              <div>
                <div className="text-sm font-semibold text-gray-700 mb-1">Title</div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-emerald-200 px-4 py-2 text-black outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="Rent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-1">Amount (CAD)</div>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    className="w-full rounded-xl border border-emerald-200 px-4 py-2 text-black outline-none focus:ring-2 focus:ring-emerald-200"
                    placeholder="1200"
                  />
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-1">Category</div>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as BillCategory)}
                    className="w-full rounded-xl border border-emerald-200 px-4 py-2 text-black outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    {["House","Entertainment","Food","Education","Utilities","Transportation","Shopping","Others"].map((c) => (
                      <option key={c} value={c}>
                        {categoryEmoji(c as BillCategory)} {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-700 mb-1">Recurrence</div>
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value as BillRecurrence)}
                  className="w-full rounded-xl border border-emerald-200 px-4 py-2 text-black outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="none">One-time</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <button
                onClick={submit}
                disabled={saving}
                className="w-full bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-5 py-3 rounded-xl shadow-md disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Bill"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete confirmation modal */}
      {deleteTarget ? (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 z-[60]"
          onClick={() => (deleting ? null : setDeleteTarget(null))}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-red-100 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-red-700">Delete bill?</h3>
            <p className="text-sm text-gray-600 mt-2">
              This will permanently delete <span className="font-semibold">{deleteTarget.title}</span>.
            </p>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                disabled={deleting}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={deleting || !onDeleteBill}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
                onClick={confirmDelete}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>

            {!onDeleteBill ? (
              <div className="text-xs text-gray-500 mt-3">
                Delete not wired: pass <span className="font-mono">onDeleteBill</span> from parent.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}