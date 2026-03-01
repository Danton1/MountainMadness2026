"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

function LoginInner() {
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
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
            next
          )}`,
        },
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      console.error(e);
      alert("Failed to send magic link. Check console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* your existing JSX here, unchanged */}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div />}>
      <LoginInner />
    </Suspense>
  );
}