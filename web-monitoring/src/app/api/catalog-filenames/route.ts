import { NextRequest, NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getSessionFromRequest } from "@/lib/auth";
import baselineCatalog from "@/lib/baselineCatalog.json";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const subround = (req.nextUrl.searchParams.get("subround") || "SR3").toUpperCase();
  const baseFns: string[] =
    (baselineCatalog.filenames as Record<string, string[]>)[subround] || [];
  const fileSet = new Set<string>(baseFns);

  if (isSupabaseConfigured && supabase) {
    try {
      let offset = 0;
      const limit = 1000;

      while (true) {
        let query = supabase
          .from("photo_catalog")
          .select("orig_filename")
          .order("orig_filename", { ascending: true })
          .range(offset, offset + limit - 1);

        if (subround) {
          query = query.eq("subround", subround);
        }

        const { data, error } = await query;
        if (error || !data || data.length === 0) break;

        for (const row of data) {
          if (row.orig_filename) fileSet.add(row.orig_filename);
        }

        if (data.length < limit) break;
        offset += limit;
      }
    } catch {}
  }

  const filenames = Array.from(fileSet);
  return NextResponse.json({
    subround,
    count: filenames.length,
    filenames,
  });
}
