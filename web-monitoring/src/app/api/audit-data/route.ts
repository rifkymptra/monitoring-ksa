import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export async function GET() {
  // 1. Jika Supabase sudah dikonfigurasi, ambil langsung dari Supabase Database
  if (isSupabaseConfigured && supabase) {
    try {
      const [{ data: summary }, { data: clusters }, { data: pairs }] = await Promise.all([
        supabase.from("audit_summary").select("*").eq("id", "latest").single(),
        supabase.from("duplicate_clusters").select("*").order("jumlah_foto", { ascending: false }),
        supabase.from("duplicate_pairs").select("*").order("id", { ascending: true }),
      ]);

      if (clusters && clusters.length > 0) {
        return NextResponse.json({
          source: "supabase",
          summary: summary || {
            total_photos: 3585,
            total_assignments: 975,
            total_pairs: pairs?.length || 0,
            total_clusters: clusters.length,
            multi_photo_clusters: clusters.filter((c: any) => c.jumlah_foto >= 3).length,
            cross_pcl_clusters: clusters.filter((c: any) => c.jumlah_petugas >= 2).length,
            exact_pairs: pairs?.filter((p: any) => String(p.kategori_temuan).startsWith("1.")).length || 0,
          },
          clusters,
          pairs: pairs || [],
        });
      }
    } catch (err) {
      console.warn("Supabase fetch fallback ke local file:", err);
    }
  }

  // 2. Fallback: Baca dari hasil_analisis/web_data.json lokal
  const localJsonPath = path.resolve(process.cwd(), "..", "hasil_analisis", "web_data.json");
  if (fs.existsSync(localJsonPath)) {
    const raw = fs.readFileSync(localJsonPath, "utf-8");
    const parsed = JSON.parse(raw);
    return NextResponse.json({
      source: "local_json",
      ...parsed,
    });
  }

  return NextResponse.json({
    source: "empty",
    summary: {
      total_photos: 0,
      total_assignments: 0,
      total_pairs: 0,
      total_clusters: 0,
      multi_photo_clusters: 0,
      cross_pcl_clusters: 0,
      exact_pairs: 0,
    },
    clusters: [],
    pairs: [],
  });
}

