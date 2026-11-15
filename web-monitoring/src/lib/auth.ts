import crypto from "crypto";
import { NextRequest } from "next/server";

export type UserRole = "admin" | "user";

export interface SessionUser {
  username: string;
  fullName: string;
  role: UserRole;
  exp: number;
}

export const SESSION_COOKIE_NAME = "ksa_session";

function getSecretKey(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "bps-garut-ksa-ubinan-secret-key-3205"
  );
}

export function hashPassword(password: string): string {
  return crypto
    .createHash("sha256")
    .update(`ksa3205:${password}`)
    .digest("hex");
}

export function createSessionToken(user: Omit<SessionUser, "exp">): string {
  const payload: SessionUser = {
    ...user,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 hari
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSecretKey())
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}

export function verifySessionToken(token?: string | null): SessionUser | null {
  if (!token || !token.includes(".")) return null;
  try {
    const [data, sig] = token.split(".");
    const expectedSig = crypto
      .createHmac("sha256", getSecretKey())
      .update(data)
      .digest("base64url");
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf-8")
    ) as SessionUser;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getSessionFromRequest(req: NextRequest): SessionUser | null {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(cookie);
}

// Akun bawaan (digunakan untuk seed otomatis ke tabel app_users di Supabase)
export const DEFAULT_USERS: Array<{
  username: string;
  passwordPlain: string;
  full_name: string;
  role: UserRole;
}> = [
  {
    username: "admin",
    passwordPlain: process.env.DEFAULT_ADMIN_PASSWORD || "ksa3205admin",
    full_name: "Administrator KSA BPS Garut",
    role: "admin",
  },
  {
    username: "pemeriksa",
    passwordPlain: process.env.DEFAULT_USER_PASSWORD || "ksa3205",
    full_name: "Tim Pemeriksa KSA / Ubinan",
    role: "user",
  },
];

