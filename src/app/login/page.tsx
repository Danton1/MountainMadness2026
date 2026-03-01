"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/dashboard";

  const signIn = async () => {
    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      console.error(e);
      alert("Login failed. Check console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-white px-6 py-16">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg border border-emerald-100 p-8">
        <h1 className="text-2xl font-bold text-emerald-700 mb-2">Login</h1>
        <p className="text-gray-600 mb-6">
          Enter your email to receive a magic link.
        </p>

        {sent ? (
          <div className="text-sm text-gray-700 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            ✅ Check your inbox for the login link.
          </div>
        ) : (
          <>
            <label className="text-sm font-semibold text-gray-700">Email</label>
            <input
              className="w-full mt-2 mb-4 rounded-xl border border-emerald-200 px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-200"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />

            <button
              onClick={signIn}
              disabled={loading || !email}
              className="w-full bg-emerald-600 hover:bg-emerald-700 transition text-white font-semibold px-5 py-3 rounded-xl shadow-md disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send magic link"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}