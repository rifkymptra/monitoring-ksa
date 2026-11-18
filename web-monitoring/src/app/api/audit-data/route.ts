import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getSessionFromRequest } from "@/lib/auth";

interface OfficerPopItem {
  pcl: string;
  kecamatans: string[];
  subrounds: string[];
  total_assignments: number;
  total_photos: number;
}

let cachedOfficerPop: { data: OfficerPopItem[]; ts: number } | null = null;

async function fetchSupabaseOfficerPopulation(): Promise<OfficerPopItem[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  if (cachedOfficerPop && Date.now() - cachedOfficerPop.ts < 60_000) {
    return cachedOfficerPop.data;
  }

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

  const map: Record<
    string,
    {
      pcl: string;
      kecs: Set<string>;
      srs: Set<string>;
      assigns: Set<string>;
      photos: number;
    }
  > = {};

  for (const res of pageResults) {
    if (!res.data) continue;
    for (const row of res.data) {
      const name = String(row.pcl || "Tanpa Nama").trim().toUpperCase();
      if (!name) continue;
      if (!map[name]) {
        map[name] = {
          pcl: name,
          kecs: new Set(),
          srs: new Set(),
          assigns: new Set(),
          photos: 0,
        };
      }
      map[name].photos += 1;
      if (row.kecamatan) map[name].kecs.add(String(row.kecamatan).trim().toUpperCase());
      if (row.subround) map[name].srs.add(String(row.subround).trim().toUpperCase());
      if (row.assignment_id) {
        map[name].assigns.add(`${row.subround || ""}:${row.assignment_id}`);
      }
    }
  }

  const result: OfficerPopItem[] = Object.values(map).map((item) => ({
    pcl: item.pcl,
    kecamatans: Array.from(item.kecs).sort(),
    subrounds: Array.from(item.srs).sort(),
    total_assignments: item.assigns.size,
    total_photos: item.photos,
  }));

  if (result.length > 0) {
    cachedOfficerPop = { data: result, ts: Date.now() };
  }
  return result;
}

function buildLocalOfficerPopulation(): OfficerPopItem[] {
  const jsonDir = path.resolve(process.cwd(), "..", "hasil_json");
  if (!fs.existsSync(jsonDir)) return [];

  const map: Record<
    string,
    {
      pcl: string;
      kecs: Set<string>;
      srs: Set<string>;
      assigns: Set<string>;
      photos: number;
    }
  > = {};

  try {
    const files = fs.readdirSync(jsonDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      let sr = "SR3";
      if (file.includes("d74be6a7")) sr = "SR1";
      else if (file.includes("d182137c")) sr = "SR2";
      else if (file.includes("6f581089")) sr = "SR3";

      const raw = fs.readFileSync(path.join(jsonDir, file), "utf-8");
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) continue;

      for (const a of list) {
        const photosObj = a.photos || {};
        const photoKeys = ["fotobidang", "foto_petak", "fotoplot", "fotoberat"].filter(
          (k) => photosObj[k] && photosObj[k].fileName
        );
        if (photoKeys.length === 0) continue;

        const name = String(a.pcl || "Tanpa Nama").trim().toUpperCase();
        if (!map[name]) {
          map[name] = {
            pcl: name,
            kecs: new Set(),
            srs: new Set(),
            assigns: new Set(),
            photos: 0,
          };
        }
        map[name].photos += photoKeys.length;
        if (a.kecamatan) map[name].kecs.add(String(a.kecamatan).trim().toUpperCase());
        map[name].srs.add(sr);
        if (a.assignmentId) map[name].assigns.add(`${sr}:${a.assignmentId}`);
      }
    }
  } catch {}

  return Object.values(map).map((item) => ({
    pcl: item.pcl,
    kecamatans: Array.from(item.kecs).sort(),
    subrounds: Array.from(item.srs).sort(),
    total_assignments: item.assigns.size,
    total_photos: item.photos,
  }));
}

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized. Silakan login terlebih dahulu." },
      { status: 401 }
    );
  }

  // 1. Jika Supabase sudah dikonfigurasi, ambil langsung dari Supabase Database
  if (isSupabaseConfigured && supabase) {
    try {
      const [{ data: summary }, { data: clusters }, { data: pairs }, officerPopulation] =
        await Promise.all([
          supabase.from("audit_summary").select("*").eq("id", "latest").single(),
          supabase
            .from("duplicate_clusters")
            .select("*")
            .order("jumlah_foto", { ascending: false }),
          supabase.from("duplicate_pairs").select("*").order("id", { ascending: true }),
          fetchSupabaseOfficerPopulation(),
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
    const officerPopulation = buildLocalOfficerPopulation();
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
    officer_population: [],
  });
}
