import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, sha256Hex } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface LoginBody {
  password?: string;
}

export async function POST(request: NextRequest) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "パスワードが設定されていません" }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as LoginBody | null;
  const password = body?.password ?? "";

  if (password !== expected) {
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, await sha256Hex(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // 180日
  });
  return response;
}
