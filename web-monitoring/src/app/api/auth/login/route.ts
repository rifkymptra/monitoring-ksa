import { NextRequest, NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  createSessionToken,
  DEFAULT_USERS,
  hashPassword,
  SESSION_COOKIE_NAME,
  UserRole,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawUser = String(body.username || "").trim().toLowerCase();
    const rawPass = String(body.password || "");

    if (!rawUser || !rawPass) {
      return NextResponse.json(
        { error: "Username dan password wajib diisi." },
        { status: 400 }
      );
    }

    const inputHash = hashPassword(rawPass);
    let matchedUser: {
      username: string;
      fullName: string;
      role: UserRole;
    } | null = null;

    // 1. Cek ke tabel app_users di Supabase
    if (isSupabaseConfigured && supabase) {
      const { data: existingUsers, error: tableErr } = await supabase
        .from("app_users")
        .select("*");

      if (!tableErr && Array.isArray(existingUsers)) {
        // Jika tabel ada tapi masih kosong, seed otomatis akun default
        if (existingUsers.length === 0) {
          const seedRows = DEFAULT_USERS.map((u) => ({
            username: u.username,
            password_hash: hashPassword(u.passwordPlain),
            full_name: u.full_name,
            role: u.role,
            is_active: true,
          }));
          await supabase.from("app_users").insert(seedRows);
        }

        const { data: dbUser } = await supabase
          .from("app_users")
          .select("*")
          .eq("username", rawUser)
          .eq("is_active", true)
          .single();

        if (
          dbUser &&
          (dbUser.password_hash === inputHash || dbUser.password_hash === rawPass)
        ) {
          matchedUser = {
            username: dbUser.username,
            fullName: dbUser.full_name || dbUser.username,
            role: dbUser.role === "admin" ? "admin" : "user",
          };
        }
      }
    }

    // 2. Fallback ke DEFAULT_USERS jika tabel app_users belum dibuat di Supabase
    if (!matchedUser) {
      const fallback = DEFAULT_USERS.find(
        (u) =>
          u.username.toLowerCase() === rawUser &&
          (hashPassword(u.passwordPlain) === inputHash || u.passwordPlain === rawPass)
      );

      // Pastikan jika user tersebut ada di DB dengan password berbeda, jangan izinkan fallback
      let overriddenInDb = false;
      if (isSupabaseConfigured && supabase && fallback) {
        const { data: checkDb } = await supabase
          .from("app_users")
          .select("username")
          .eq("username", rawUser)
          .single();
        if (checkDb) overriddenInDb = true;
      }

      if (fallback && !overriddenInDb) {
        matchedUser = {
          username: fallback.username,
          fullName: fallback.full_name,
          role: fallback.role,
        };
      }
    }

    if (!matchedUser) {
      return NextResponse.json(
        { error: "Username atau password tidak sesuai." },
        { status: 401 }
      );
    }

    const token = createSessionToken(matchedUser);
    const res = NextResponse.json({
      success: true,
      user: matchedUser,
    });

    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Gagal memproses login." },
      { status: 500 }
    );
  }
}

