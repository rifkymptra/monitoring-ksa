import { NextRequest, NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { DEFAULT_USERS, getSessionFromRequest, hashPassword } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Akses ditolak (Khusus Admin)." }, { status: 403 });
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from("app_users")
      .select("id, username, full_name, role, is_active, created_at")
      .order("id", { ascending: true });

    if (!error && data) {
      return NextResponse.json({ source: "supabase", users: data });
    }
  }

  return NextResponse.json({
    source: "fallback",
    users: DEFAULT_USERS.map((u, idx) => ({
      id: idx + 1,
      username: u.username,
      full_name: u.full_name,
      role: u.role,
      is_active: true,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Akses ditolak (Khusus Admin)." }, { status: 403 });
  }

  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json(
      { error: "Supabase belum terhubung untuk menyimpan pengguna baru." },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.fullName || "").trim();
    const role = body.role === "admin" ? "admin" : "user";

    if (!username || !password || !fullName) {
      return NextResponse.json(
        { error: "Username, nama lengkap, dan password wajib diisi." },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("app_users").upsert(
      {
        username,
        password_hash: hashPassword(password),
        full_name: fullName,
        role,
        is_active: true,
      },
      { onConflict: "username" }
    );

    if (error) {
      return NextResponse.json(
        {
          error: `Gagal menyimpan ke tabel app_users: ${error.message}. Pastikan sudah menjalankan query tabel app_users di Supabase SQL Editor.`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Akun '${username}' (${role.toUpperCase()}) berhasil disimpan.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Gagal menyimpan pengguna." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Akses ditolak (Khusus Admin)." }, { status: 403 });
  }

  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json({ error: "Supabase belum terhubung." }, { status: 400 });
  }

  const username = req.nextUrl.searchParams.get("username")?.trim().toLowerCase();
  if (!username) {
    return NextResponse.json({ error: "Username tidak valid." }, { status: 400 });
  }
  if (username === session.username.toLowerCase()) {
    return NextResponse.json(
      { error: "Tidak dapat menghapus akun yang sedang Anda gunakan login." },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("app_users").delete().eq("username", username);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: `Akun '${username}' berhasil dihapus.`,
  });
}

