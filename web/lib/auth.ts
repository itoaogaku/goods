export const AUTH_COOKIE_NAME = "app_session";

/**
 * SHA-256 of the app password, hex-encoded. Used as the login cookie's
 * value instead of the raw password itself — a stolen/leaked cookie still
 * doesn't reveal the password, and rotating APP_PASSWORD invalidates every
 * existing cookie automatically (the hash simply stops matching).
 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
