// app/api/clear_memory/route.ts

import { NextRequest, NextResponse } from "next/server";
import { clearEntityMemory } from "@/app/utils/contextMemory";

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id") || "anonymous";
  clearEntityMemory(userId);
  return NextResponse.json({ success: true, message: `Memory cleared for user "${userId}"` });
}
