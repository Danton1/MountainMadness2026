"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const loadDemo = async () => {
    setLoading(true);

    try {
      const res = await fetch("/api/demo");
      const data = await res.json();

      localStorage.setItem("calendarquest_demo", JSON.stringify(data));
      router.push("/dashboard");
    } catch (err) {
      console.error("Failed to load demo:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-white flex flex-col">
      {/* HERO SECTION */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-20">
        <h1 className="text-5xl font-bold text-emerald-700 mb-4">
          🧪 Dr. Jekyll’s CalendarQuest
        </h1>

        <p className="text-lg text-gray-700 max-w-2xl mb-6">
          Take control of your finances with CalendarQuest, the app that turns your chaotic schedule into actionable insights. Predict financial risks, complete gamified challenges, and achieve your goals with accountability and ease.
        </p>

        <div className="bg-white shadow-lg rounded-xl p-6 max-w-xl mb-8 border border-emerald-100">
          <h2 className="text-xl font-semibold text-emerald-600 mb-2">
            💡 Why CalendarQuest?
          </h2>
          <p className="text-gray-600 text-sm">
            Managing finances isn’t just about numbers, it’s about managing life. With deadlines, bills, birthdays, and social events, it’s easy to lose track. CalendarQuest helps you stay ahead by analyzing your schedule and turning chaos into clarity.
          </p>
        </div>

        <div className="bg-white shadow-lg rounded-xl p-6 max-w-xl mb-8 border border-emerald-100">
          <h2 className="text-xl font-semibold text-emerald-600 mb-2">
            🔬 How It Works
          </h2>
          <p className="text-gray-600 text-sm">
            CalendarQuest scans your week to calculate a Chaos Index, predicts spending risks, and transforms your financial habits into fun, gamified quests. With peer accountability, you’ll stay motivated and on track.
          </p>
        </div>

        <button
          onClick={loadDemo}
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-8 py-3 rounded-xl shadow-md"
        >
          {loading ? "Loading..." : "🚀 Go to Dashboard!"}
        </button>
      </section>

      {/* FEATURES SECTION */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8">
          <FeatureCard
            title="📅 Chaos Index"
            description="Analyze your schedule to identify high-risk weeks and plan ahead with confidence."
          />
          <FeatureCard
            title="🎯 Gamified Challenges"
            description="Turn financial discipline into fun quests that help you build consistent saving habits."
          />
          <FeatureCard
            title="👥 Accountability Groups"
            description="Join a group, set shared goals, and stay motivated with peer support and encouragement."
          />
        </div>
      </section>

      {/* FOOTER */}
      <footer className="text-center text-sm text-gray-500 py-6">
        Built for Mountain Madness 🪙 – Dr. Jekyll Edition
      </footer>
    </main>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="bg-emerald-50 rounded-xl p-6 shadow-sm border border-emerald-100">
      <h3 className="text-lg font-semibold text-emerald-700 mb-2">
        {title}
      </h3>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}