"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEMO_STAGE } from "@/lib/stage";

const LINKS = [
  { href: "/", label: "Chat" },
  { href: "/knowledge", label: "Knowledge base" },
  // The Evaluation page is part of demo stage 3.
  ...(DEMO_STAGE >= 3 ? [{ href: "/evaluation", label: "Evaluation" }] : []),
];

/** Top bar shared by every signed-in page: brand, page links, account. */
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");

  useEffect(() => {
    // Reads the session cookie locally; no network round trip.
    createClient().auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ""));
  }, []);

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <nav className="flex items-center gap-6 px-5 h-14 flex-shrink-0 border-b border-white/[0.07] bg-[#12121a]">
      <Link href="/" className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-[#4f6eff] rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(79,110,255,0.2)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden="true">
            <path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" />
          </svg>
        </div>
        <span className="text-[17px] font-bold bg-gradient-to-br from-white to-[#a0a8ff] bg-clip-text text-transparent">
          RAGStack
        </span>
      </Link>

      <div className="flex items-center gap-1">
        {LINKS.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                active ? "bg-[#4f6eff]/15 text-[#8ba0ff]" : "text-[#8888aa] hover:text-[#e8e8f0] hover:bg-white/[0.04]"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-[#555570] max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap" title={email}>
          {email}
        </span>
        <button
          onClick={signOut}
          className="text-xs px-2.5 py-1 border border-white/[0.07] rounded-lg text-[#8888aa] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
