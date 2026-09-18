import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, sha256Hex } from "@/lib/auth";

// アプリ全体を、パスワードだけを尋ねるログイン画面(/login)の背後に置く
// (ブラウザ標準のBasic認証ダイアログだとユーザー名欄も出てしまうため、
// 専用のログインページ+Cookieによる方式にしている)。APP_PASSWORD が
// 未設定の間（ローカル開発など）は誰でもアクセスできる。
//
// Next.js 16でmiddleware.ts/middleware()はproxy.ts/proxy()に改称された
// (このリポジトリのNext.jsは通常と挙動が違うので、必ずnode_modules/next/
// dist/docs/を確認してから書くこと — AGENTS.md参照)。
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CORSプリフライト(OPTIONS)は資格情報を送らないのが仕様なので、ここで
  // 弾くとクロスオリジン呼び出しが一切できなくなる。実データを返す本番の
  // リクエストは引き続き下の認証チェックにかかる。
  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  // Vercel CronがGETで直接呼び出すWix同期エンドポイントには、ログイン
  // Cookieが付かない。ここでは通し、代わりにroute.ts側でCRON_SECRETを
  // 検証する。ダッシュボードの「今すぐWixと同期」ボタン(POST)はこの
  // Proxyの認証対象のまま。
  if (pathname === "/api/acc/sync-wix" && request.method === "GET") {
    return NextResponse.next();
  }

  const expectedPassword = process.env.APP_PASSWORD;
  if (!expectedPassword) {
    return NextResponse.next();
  }

  // ログインページ・ログインAPI自体は素通りさせないと誰もログインできない。
  if (pathname === "/login" || pathname === "/api/login") {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (cookie && cookie === (await sha256Hex(expectedPassword))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
