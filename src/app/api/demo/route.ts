import { NextResponse } from "next/server";

export async function GET() {
  // Simple sample week (tune later)
  const data = {
    user: { name: "Demo User", weeklyIncome: 750 },
    bills: [
      { name: "Rent", amount: 450, due: "2026-03-01" },
      { name: "Phone", amount: 55, due: "2026-03-03" },
      { name: "Gym", amount: 18, due: "2026-03-05" },
    ],
    events: [
      { title: "Midterm Study Block", start: "2026-03-02T18:00:00", end: "2026-03-02T21:00:00", type: "deadline" },
      { title: "Team Meeting", start: "2026-03-03T12:00:00", end: "2026-03-03T13:00:00", type: "work" },
      { title: "Birthday Dinner (Downtown)", start: "2026-03-07T19:00:00", end: "2026-03-07T22:00:00", type: "social" },
      { title: "Hackathon Prep", start: "2026-03-06T17:00:00", end: "2026-03-06T19:00:00", type: "deadline" },
      { title: "Coffee w/ friend", start: "2026-03-04T16:00:00", end: "2026-03-04T17:00:00", type: "social" },
    ],
    party: {
      name: "Burnaby Savers",
      joinCode: "JEKYLL",
      weeklyGoal: 60,
      members: [
        { name: "You", points: 25 },
        { name: "Alex", points: 15 },
        { name: "Sam", points: 10 },
      ],
    },
  };

  return NextResponse.json(data);
}