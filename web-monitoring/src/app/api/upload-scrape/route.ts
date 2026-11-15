import { NextRequest, NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getSessionFromRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json(
      { error: "Akses ditolak. Fitur ini hanya dapat dijalankan oleh Administrator." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { subround, surveyPeriodId, assignments } = body;

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json(
        { error: "File JSON tidak valid atau kosong." },
        { status: 400 }
      );
    }

    let uploadId = null;

    // 1. Simpan JSON ke tabel raw_scrape_uploads di Supabase jika sudah terhubung
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("raw_scrape_uploads")
        .insert({
          subround: subround || "SR3",
          survey_period_id: surveyPeriodId || "",
          total_assignments: assignments.length,
          payload: assignments,
          status: "PENDING",
        })
        .select("id")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      uploadId = data?.id;
    }

    // 2. Opsional: Trigger GitHub Actions workflow_dispatch jika GITHUB_TOKEN & GITHUB_REPO diset di Vercel
    let githubTriggered = false;
    const ghToken = process.env.GITHUB_PAT_TOKEN;
    const ghRepo = process.env.GITHUB_REPO;

    if (ghToken && ghRepo) {
      const ghRes = await fetch(
        `https://api.github.com/repos/${ghRepo}/actions/workflows/analyze_ubinan.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${ghToken}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            ref: "main",
            inputs: {
              subround: String(subround || "SR3"),
              upload_id: String(uploadId || "latest"),
            },
          }),
        }
      );
      githubTriggered = ghRes.ok;
    }

    return NextResponse.json({
      success: true,
      totalAssignments: assignments.length,
      uploadId,
      githubTriggered,
      message: githubTriggered
        ? `Berhasil menyimpan ${assignments.length} assignment ke Supabase dan memicu GitHub Actions untuk analisis foto!`
        : `Berhasil memvalidasi ${assignments.length} assignment${uploadId ? " dan menyimpannya ke Supabase" : ""}.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Gagal memproses upload JSON" },
      { status: 500 }
    );
  }
}
