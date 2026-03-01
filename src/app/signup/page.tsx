"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

const COUNTRIES = [
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "US", name: "United States", currency: "USD" },
  { code: "BR", name: "Brazil", currency: "BRL" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "EU", name: "European Union", currency: "EUR" },
];

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("CA");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const signUp = async () => {
    setLoading(true);
    try {
      const supabase = supabaseBrowser();

      const selected = COUNTRIES.find((c) => c.code === country) ?? COUNTRIES[0];

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // store extra profile fields in user metadata
          data: {
            name,
            country: selected.code,
            currency: selected.currency,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
            "/dashboard"
          )}`,
        },
      });

      if (error) {
        console.error("signup error", error);
        return;
      }

      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-white px-6 py-16">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg border border-emerald-100 p-8">
        <h1 className="text-2xl font-bold text-emerald-700 mb-2">Create account</h1>
        <p className="text-gray-600 mb-6">Sign up with email, then personalize your profile.</p>

        {sent ? (
          <div className="text-sm text-gray-700 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            ✅ Check your inbox for the signup link.
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-1">Name</div>
              <input
                className="w-full rounded-xl border border-emerald-200 px-4 py-2 text-black placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Danton"
              />
            </div>

            <div>
              <div className="text-sm font-semibold text-gray-700 mb-1">Email</div>
              <input
                className="w-full rounded-xl border border-emerald-200 px-4 py-2 text-black placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="text-sm font-semibold text-gray-700 mb-1">Country</div>
              <select
                className="w-full rounded-xl border border-emerald-200 px-4 py-2 text-black outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={signUp}
              disabled={loading || !email || !name}
              className="w-full bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-5 py-3 rounded-xl shadow-md disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send signup link"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}