"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccessMsg(""); setLoading(true);
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setSuccessMsg("Account created! You can sign in now.");
        setMode("signin");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        router.push("/");
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f13] px-4">
      <div className="w-full max-w-sm bg-[#16161e] border border-white/[0.07] rounded-2xl p-8 shadow-xl">

        {/* Brand */}
        <div className="flex items-center justify-center gap-2.5 mb-7">
          <div className="w-9 h-9 bg-[#4f6eff] rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(79,110,255,0.25)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <span className="text-lg font-bold bg-gradient-to-br from-white to-[#a0a8ff] bg-clip-text text-transparent">
            AskPDF
          </span>
        </div>

        <h2 className="text-xl font-bold text-[#e8e8f0] text-center mb-1">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h2>
        <p className="text-sm text-[#8888aa] text-center mb-6">
          {mode === "signin" ? "Sign in to continue" : "Sign up to start asking your PDFs"}
        </p>

        {error && (
          <div className="mb-4 px-3.5 py-2.5 bg-red-500/10 border border-red-500/25 rounded-xl text-sm text-red-400">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 px-3.5 py-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-sm text-emerald-400">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[#8888aa]">
            Email
            <input
              type="email" value={email} required autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="px-3.5 py-2.5 bg-[#1e1e2a] border border-white/[0.07] rounded-xl text-sm text-[#e8e8f0] placeholder:text-[#555570] outline-none transition focus:border-[#4f6eff] focus:ring-2 focus:ring-[#4f6eff]/25"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[#8888aa]">
            Password
            <input
              type="password" value={password} required minLength={6}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="px-3.5 py-2.5 bg-[#1e1e2a] border border-white/[0.07] rounded-xl text-sm text-[#e8e8f0] placeholder:text-[#555570] outline-none transition focus:border-[#4f6eff] focus:ring-2 focus:ring-[#4f6eff]/25"
            />
          </label>
          <button
            type="submit" disabled={loading}
            className="mt-1 py-3 bg-[#4f6eff] hover:bg-[#6381ff] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition shadow-[0_0_20px_rgba(79,110,255,0.15)] hover:shadow-[0_4px_16px_rgba(79,110,255,0.35)]"
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign In" : "Sign Up"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#8888aa]">
          {mode === "signin" ? (
            <>Don&apos;t have an account?{" "}
              <button onClick={() => { setMode("signup"); setError(""); }} className="text-[#4f6eff] hover:text-[#6381ff] font-medium underline transition">
                Sign Up
              </button></>
          ) : (
            <>Already have an account?{" "}
              <button onClick={() => { setMode("signin"); setError(""); }} className="text-[#4f6eff] hover:text-[#6381ff] font-medium underline transition">
                Sign In
              </button></>
          )}
        </p>
      </div>
    </div>
  );
}
