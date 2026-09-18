import { NextResponse, type NextRequest } from "next/server";

// ブラウザ標準のBasic認証ダイアログでアプリ全体にパスワードをかける。
// ユーザー名は問わず、パスワードだけを APP_PASSWORD と照合する。
// APP_PASSWORD が未設定の間（ローカル開発など）は誰でもアクセスできる —
// うっかりデプロイしても即座にロックアウトされないようにするため。
const REALM = "Password Required";

function isAuthorized(request: NextRequest): boolean {
  const expectedPassword = process.env.APP_PASSWORD;
  if (!expectedPassword) return true;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) return false;

  try {
    const decoded = atob(authHeader.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    const password = separatorIndex === -1 ? decoded : decoded.slice(separatorIndex + 1);
    return password === expectedPassword;
  } catch {
    return false;
  }
}

// Next.js 16でmiddleware.ts/middleware()はproxy.ts/proxy()に改称された
// (このリポジトリのNext.jsは通常と挙動が違うので、必ずnode_modules/next/
// dist/docs/を確認してから書くこと — AGENTS.md参照)。
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CORSプリフライト(OPTIONS)は資格情報を送らないのが仕様なので、ここで
  // 弾くとクロスオリジン呼び出しが一切できなくなる。実データを返す本番の
  // リクエストは引き続き下の認証チェックにかかる。
  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  // Vercel CronがGETで直接呼び出すWix同期エンドポイントには、Basic認証の
  // ヘッダーが付かない。ここでは通し、代わりにroute.ts側でCRON_SECRETを
  // 検証する。ダッシュボードの「今すぐWixと同期」ボタン(POST)はこの
  // Proxyの認証対象のまま。
  if (pathname === "/api/acc/sync-wix" && request.method === "GET") {
    return NextResponse.next();
  }

  if (isAuthorized(request)) {
    return NextResponse.next();
  }

  return new NextResponse("パスワードが必要です", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
