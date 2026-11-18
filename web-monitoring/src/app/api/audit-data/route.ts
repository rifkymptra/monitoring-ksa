import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getSessionFromRequest } from "@/lib/auth";
import baselineCatalog from "@/lib/baselineCatalog.json";

interface OfficerPopItem {
  pcl: string;
  kecamatans: string[];
  subrounds: string[];
  total_assignments: number;
  total_photos: number;
}

let cachedOfficerPop: { data: OfficerPopItem[]; ts: number } | null = null;

async function fetchMergedOfficerPopulation(): Promise<OfficerPopItem[]> {
  if (cachedOfficerPop && Date.now() - cachedOfficerPop.ts < 60_000) {
    return cachedOfficerPop.data;
  }

  // Mulai dari populasi baseline (79 petugas dari SR1, SR2, SR3)
  const map: Record<
    string,
    {
      pcl: string;
      kecs: Set<string>;
      srs: Set<string>;
      total_assignments: number;
      total_photos: number;
    }
  > = {};

  for (const b of baselineCatalog.officer_population || []) {
    map[b.pcl] = {
      pcl: b.pcl,
      kecs: new Set(b.kecamatans || []),
      srs: new Set(b.subrounds || []),
      total_assignments: b.total_assignments || 0,
      total_photos: b.total_photos || 0,
    };
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const ranges = [
        [0, 999],
        [1000, 1999],
        [2000, 2999],
        [3000, 3999],
        [4000, 4999],
        [5000, 5999],
      ];

      const pageResults = await Promise.all(
        ranges.map(([start, end]) =>
          supabase!
            .from("photo_catalog")
            .select("pcl,kecamatan,subround,assignment_id")
            .order("orig_filename", { ascending: true })
            .range(start, end)
        )
      );

      const dbMap: Record<
        string,
        {
          pcl: string;
          kecs: Set<string>;
          srs: Set<string>;
          assigns: Set<string>;
          photos: number;
        }
      > = {};

      let totalDbRows = 0;
      for (const res of pageResults) {
        if (!res.data) continue;
        for (const row of res.data) {
          totalDbRows++;
          const name = String(row.pcl || "Tanpa Nama").trim().toUpperCase();
          if (!name) continue;
          if (!dbMap[name]) {
            dbMap[name] = {
              pcl: name,
              kecs: new Set(),
              srs: new Set(),
              assigns: new Set(),
              photos: 0,
            };
          }
          dbMap[name].photos += 1;
          if (row.kecamatan) dbMap[name].kecs.add(String(row.kecamatan).trim().toUpperCase());
          if (row.subround) dbMap[name].srs.add(String(row.subround).trim().toUpperCase());
          if (row.assignment_id) {
            dbMap[name].assigns.add(`${row.subround || ""}:${row.assignment_id}`);
          }
        }
      }

      if (totalDbRows > 0) {
        for (const [name, d] of Object.entries(dbMap)) {
          if (!map[name]) {
            map[name] = {
              pcl: name,
              kecs: d.kecs,
              srs: d.srs,
              total_assignments: d.assigns.size,
              total_photos: d.photos,
            };
          } else {
            d.kecs.forEach((k) => map[name].kecs.add(k));
            d.srs.forEach((s) => map[name].srs.add(s));
            map[name].total_assignments = Math.max(
              map[name].total_assignments,
              d.assigns.size
            );
            map[name].total_photos = Math.max(map[name].total_photos, d.photos);
          }
        }
      }
    } catch {}
  }

  const result: OfficerPopItem[] = Object.values(map).map((item) => ({
    pcl: item.pcl,
    kecamatans: Array.from(item.kecs).sort(),
    subrounds: Array.from(item.srs).sort(),
    total_assignments: item.total_assignments,
    total_photos: item.total_photos,
  }));

  cachedOfficerPop = { data: result, ts: Date.now() };
  return result;
}

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized. Silakan login terlebih dahulu." },
      { status: 401 }
    );
  }

  const officerPopulation = await fetchMergedOfficerPopulation();

  // 1. Jika Supabase sudah dikonfigurasi, ambil langsung dari Supabase Database
  if (isSupabaseConfigured && supabase) {
    try {
      const [{ data: summary }, { data: clusters }, { data: pairs }] = await Promise.all([
        supabase.from("audit_summary").select("*").eq("id", "latest").single(),
        supabase
          .from("duplicate_clusters")
          .select("*")
          .order("jumlah_foto", { ascending: false }),
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
            exact_pairs:
              pairs?.filter((p: any) => String(p.kategori_temuan).startsWith("1.")).length || 0,
          },
          clusters,
          pairs: pairs || [],
          officer_population: officerPopulation,
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
      officer_population: officerPopulation,
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
    officer_population: officerPopulation,
  });
}
