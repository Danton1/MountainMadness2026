"use client";

import { useMemo } from "react";

type BillEvent = {
  id: string;
  title: string;
  start_at: string; // ISO
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
  // Sunday-start grid; change if you want Monday
  const first = startOfMonth(d);
  const dow = first.getDay(); // 0..6
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - dow);
  return gridStart;
}

export default function BillsCalendar({
  bills,
  month = new Date(),
}: {
  bills: BillEvent[];
  month?: Date;
}) {
  const map = useMemo(() => {
    const m = new Map<string, BillEvent[]>();
    for (const b of bills) {
      const day = ymdLocal(new Date(b.start_at));
      const arr = m.get(day) ?? [];
      arr.push(b);
      m.set(day, arr);
    }
    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => a.start_at.localeCompare(b.start_at));
      m.set(k, arr);
    }
    return m;
  }, [bills]);

  const days = useMemo(() => {
    const gridStart = startOfCalendarGrid(month);
    const grid: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      grid.push(d);
    }
    return grid;
  }, [month]);

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const todayKey = ymdLocal(new Date());

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-emerald-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-emerald-700">🗓 Bills Calendar</h2>
        <div className="text-sm text-gray-600">
          {month.toLocaleString(undefined, { month: "long", year: "numeric" })}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-xs text-gray-500 mb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const key = ymdLocal(d);
          const inMonth = d >= monthStart && d <= monthEnd;
          const isToday = key === todayKey;
          const list = map.get(key) ?? [];

          return (
            <div
              key={key}
              className={`min-h-[92px] rounded-xl border p-2 ${
                inMonth ? "bg-white border-emerald-100" : "bg-gray-50 border-gray-100 opacity-70"
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
                {list.slice(0, 2).map((b) => (
                  <div
                    key={b.id}
                    className="text-[11px] truncate bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1 text-emerald-900"
                    title={b.title}
                  >
                    {b.title.replace(/^\[BILL\]\s*/i, "")}
                  </div>
                ))}
                {list.length > 2 ? (
                  <div className="text-[11px] text-gray-500">+{list.length - 2} more</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}