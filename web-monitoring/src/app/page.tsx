"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Layers,
  GitCompare,
  Terminal,
  Copy,
  Check,
  UploadCloud,
  Search,
  RotateCcw,
  ExternalLink,
  X,
  Database,
  ShieldCheck,
} from "lucide-react";
import {
  SUBROUND_OPTIONS,
  generateFasihConsoleScript,
} from "@/lib/scraperTemplate";

type TabType = "exec" | "clusters" | "pairs" | "scraper";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabType>("exec");
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<string>("loading");
  const [summary, setSummary] = useState<any>({
    total_photos: 0,
    total_assignments: 0,
    total_pairs: 0,
    total_clusters: 0,
    multi_photo_clusters: 0,
    cross_pcl_clusters: 0,
    exact_pairs: 0,
  });
  const [clusters, setClusters] = useState<any[]>([]);
  const [pairs, setPairs] = useState<any[]>([]);

  // Filter States - Clusters
  const [cScen, setCScen] = useState("");
  const [cSize, setCSize] = useState(0);
  const [cPcl, setCPcl] = useState(0);
  const [cJenis, setCJenis] = useState("");
  const [cSearch, setCSearch] = useState("");

  // Filter States - Pairs
  const [pScen, setPScen] = useState("");
  const [pKat, setPKat] = useState("");
  const [pJenis, setPJenis] = useState("");
  const [pSearch, setPSearch] = useState("");

  // Scraper Tab States
  const [selectedSr, setSelectedSr] = useState(SUBROUND_OPTIONS[0]);
  const [customPeriodId, setCustomPeriodId] = useState(
    SUBROUND_OPTIONS[0].surveyPeriodId
  );
  const [copied, setCopied] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    msg: string;
  }>({ type: "idle", msg: "" });

  // Lightbox Modal
  const [lightbox, setLightbox] = useState<{
    open: boolean;
    src: string;
    caption: string;
  }>({ open: false, src: "", caption: "" });

  useEffect(() => {
    fetch("/api/audit-data")
      .then((r) => r.json())
      .then((res) => {
        setDataSource(res.source || "local_json");
        if (res.summary) setSummary(res.summary);
        if (Array.isArray(res.clusters)) setClusters(res.clusters);
        if (Array.isArray(res.pairs)) setPairs(res.pairs);
      })
      .finally(() => setLoading(false));
  }, []);

  // Matrix Ringkasan Skenario
  const scenarioSummary = useMemo(() => {
    const map: Record<
      string,
      { code: string; desc: string; kat1: number; kat2: number; kat3: number; total: number }
    > = {};
    for (const p of pairs) {
      const code = p.skenario_kode || "Lainnya";
      if (!map[code]) {
        map[code] = {
          code,
          desc: p.skenario_deskripsi || "",
          kat1: 0,
          kat2: 0,
          kat3: 0,
          total: 0,
        };
      }
      map[code].total++;
      const kat = String(p.kategori_temuan || "");
      if (kat.startsWith("1.")) map[code].kat1++;
      else if (kat.startsWith("2.")) map[code].kat2++;
      else map[code].kat3++;
    }
    return Object.values(map).sort((a, b) => a.code.localeCompare(b.code));
  }, [pairs]);

  // Top Kecamatan Summary
  const topKecamatans = useMemo(() => {
    const map: Record<
      string,
      { kec: string; clusters: number; photos: number; pcls: Set<string> }
    > = {};
    for (const c of clusters) {
      const seenKecs = new Set<string>();
      for (const m of c.members || []) {
        const kc = m.kecamatan || "LAINNYA";
        if (!map[kc]) {
          map[kc] = { kec: kc, clusters: 0, photos: 0, pcls: new Set() };
        }
        map[kc].photos++;
        if (m.pcl) map[kc].pcls.add(m.pcl);
        seenKecs.add(kc);
      }
      seenKecs.forEach((kc) => {
        if (map[kc]) map[kc].clusters++;
      });
    }
    return Object.values(map)
      .sort((a, b) => b.photos - a.photos)
      .slice(0, 12);
  }, [clusters]);

  // Filtered Clusters
  const filteredClusters = useMemo(() => {
    const q = cSearch.trim().toLowerCase();
    return clusters.filter((c) => {
      if (cScen && !String(c.skenario_terlibat || "").includes(cScen)) return false;
      if (cSize > 0 && Number(c.jumlah_foto || 0) < cSize) return false;
      if (cPcl > 0 && Number(c.jumlah_petugas || 0) < cPcl) return false;
      if (cJenis && !String(c.daftar_jenis_foto || "").includes(cJenis)) return false;
      if (q) {
        const hay = `${c.cluster_id} ${c.daftar_petugas} ${c.daftar_kecamatan} ${JSON.stringify(
          c.members || []
        )}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [clusters, cScen, cSize, cPcl, cJenis, cSearch]);

  // Filtered Pairs
  const filteredPairs = useMemo(() => {
    const q = pSearch.trim().toLowerCase();
    return pairs.filter((p) => {
      if (pScen && p.skenario_kode !== pScen) return false;
      if (pKat && !String(p.kategori_temuan || "").startsWith(pKat)) return false;
      if (
        pJenis &&
        p.jenis_1 !== pJenis &&
        p.jenis_2 !== pJenis
      )
        return false;
      if (q) {
        const hay = `${p.pcl_1} ${p.pcl_2} ${p.kec_1} ${p.kec_2} ${p.desa_1} ${p.desa_2} ${p.namakk_1} ${p.namakk_2} ${p.nks_1} ${p.nks_2}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pairs, pScen, pKat, pJenis, pSearch]);

  const consoleScript = useMemo(
    () => generateFasihConsoleScript(customPeriodId, selectedSr.code),
    [customPeriodId, selectedSr]
  );

  const handleCopyScript = async () => {
    await navigator.clipboard.writeText(consoleScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus({ type: "loading", msg: "Membaca dan mengunggah file JSON..." });

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch("/api/upload-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subround: selectedSr.code,
          surveyPeriodId: customPeriodId,
          assignments: parsed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengunggah JSON");
      setUploadStatus({ type: "success", msg: data.message });
    } catch (err: any) {
      setUploadStatus({
        type: "error",
        msg: err?.message || "Format file JSON tidak sesuai",
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Topbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-extrabold flex items-center justify-center shadow-sm">
              KSA
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">
                  Audit & Deteksi Duplikasi Foto Ubinan
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Database className="w-3 h-3" />
                  {dataSource === "supabase" ? "Supabase Cloud" : "Data Lokal Aktif"}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                BPS Kabupaten Garut · Sistem Kendali Mutu Dokumentasi FASIH-SM
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab("exec")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === "exec"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Ringkasan Eksekutif
            </button>
            <button
              onClick={() => setActiveTab("clusters")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === "clusters"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Kelompok Foto Sama ({clusters.length})
            </button>
            <button
              onClick={() => setActiveTab("pairs")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === "pairs"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              Perbandingan Pasangan ({pairs.length})
            </button>
            <button
              onClick={() => setActiveTab("scraper")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === "scraper"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Tarik Data FASIH
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Total Foto Diperiksa
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {summary.total_photos.toLocaleString("id-ID")}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Dari {summary.total_assignments.toLocaleString("id-ID")} Assignment Ubinan
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Kelompok (Cluster) Duplikat
            </div>
            <div className="text-2xl font-extrabold text-blue-600 mt-1">
              {summary.total_clusters.toLocaleString("id-ID")} Grup
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {summary.multi_photo_clusters} grup berisi ≥ 3 foto sekaligus
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Grup Lintas Petugas
            </div>
            <div className="text-2xl font-extrabold text-rose-600 mt-1">
              {summary.cross_pcl_clusters.toLocaleString("id-ID")} Grup
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Foto yang sama dipakai ≥ 2 petugas berbeda
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Pasangan File Identik 100%
            </div>
            <div className="text-2xl font-extrabold text-amber-600 mt-1">
              {summary.exact_pairs.toLocaleString("id-ID")}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Total keseluruhan: {summary.total_pairs.toLocaleString("id-ID")} pasangan
            </div>
          </div>
        </div>

        {/* TAB 1: RINGKASAN EKSEKUTIF */}
        {activeTab === "exec" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Matriks Skenario */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
                <h2 className="text-sm font-bold text-slate-900">
                  Matriks Temuan Berdasarkan Skenario Pemeriksaan
                </h2>
                <p className="text-xs text-slate-500 mb-4">
                  Klik pada baris skenario untuk melihat langsung daftar perbandingan fotonya.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase text-[11px]">
                        <th className="py-2.5 px-3">Kode</th>
                        <th className="py-2.5 px-3">Skenario Pemeriksaan</th>
                        <th className="py-2.5 px-3 text-center">SHA-256</th>
                        <th className="py-2.5 px-3 text-center">Kompresi</th>
                        <th className="py-2.5 px-3 text-center">Objek/ORB</th>
                        <th className="py-2.5 px-3 text-center">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {scenarioSummary.map((s) => (
                        <tr
                          key={s.code}
                          onClick={() => {
                            setPScen(s.code);
                            setActiveTab("pairs");
                          }}
                          className="hover:bg-slate-50 cursor-pointer transition"
                        >
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700">
                              {s.code}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">
                            {s.desc}
                          </td>
                          <td className="py-2.5 px-3 text-center">{s.kat1}</td>
                          <td className="py-2.5 px-3 text-center">{s.kat2}</td>
                          <td className="py-2.5 px-3 text-center">{s.kat3}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-blue-600">
                            {s.total}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top Kecamatan */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
                <h2 className="text-sm font-bold text-slate-900">
                  Sebaran Kelompok Duplikasi per Kecamatan (Top 12)
                </h2>
                <p className="text-xs text-slate-500 mb-4">
                  Klik nama kecamatan untuk memfilter kelompok foto di kecamatan tersebut.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase text-[11px]">
                        <th className="py-2.5 px-3">Kecamatan</th>
                        <th className="py-2.5 px-3 text-center">Grup</th>
                        <th className="py-2.5 px-3 text-center">Foto</th>
                        <th className="py-2.5 px-3 text-center">Petugas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {topKecamatans.map((k) => (
                        <tr
                          key={k.kec}
                          onClick={() => {
                            setCSearch(k.kec);
                            setActiveTab("clusters");
                          }}
                          className="hover:bg-slate-50 cursor-pointer transition"
                        >
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {k.kec}
                          </td>
                          <td className="py-2.5 px-3 text-center">{k.clusters}</td>
                          <td className="py-2.5 px-3 text-center font-semibold text-blue-600">
                            {k.photos}
                          </td>
                          <td className="py-2.5 px-3 text-center">{k.pcls.size}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="text-xs text-slate-600 space-y-1">
                <div className="font-bold text-slate-900 text-sm">
                  Metodologi Pemeriksaan 3 Tahap (Bebas Bias Watermark FASIH)
                </div>
                <p>
                  1. <b>Content-Area Cropping</b>: Memotong 26% bagian bawah gambar (tempat banner tanggal, koordinat GPS, dan logo FASIH berada) agar pendeteksian murni menilai objek sawah, petak, sketsa, dan timbangan.
                </p>
                <p>
                  2. <b>SHA-256 & Multi-Perceptual Hash (pHash/dHash + Rotasi)</b>: Menangkap file yang identik 100% secara biner maupun foto yang telah dikompres ulang oleh aplikasi/WhatsApp atau diputar.
                </p>
                <p>
                  3. <b>OpenCV ORB + RANSAC Homography Verification</b>: Menangkap foto yang diambil beruntun di lokasi/timbangan yang sama, di-crop, atau diganti teks tanggal watermark-nya.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: KELOMPOK FOTO SAMA (MULTI-FOTO CLUSTERS) */}
        {activeTab === "clusters" && (
          <div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Skenario
                </label>
                <select
                  value={cScen}
                  onChange={(e) => setCScen(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">Semua Skenario</option>
                  <option value="Skenario 1">Skenario 1 - Antar Petugas (SR Sama)</option>
                  <option value="Skenario 2">Skenario 2 - Petugas Sama (Lintas SR)</option>
                  <option value="Skenario 3">Skenario 3 - Antar Petugas (Lintas SR)</option>
                  <option value="Skenario 4">Skenario 4 - Petugas Sama (Beda Sampel)</option>
                  <option value="Skenario 5A">Skenario 5A - Lintas Jenis (1 Sampel)</option>
                  <option value="Skenario 5B">Skenario 5B - Lintas Jenis (Beda Sampel)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Jumlah Foto
                </label>
                <select
                  value={cSize}
                  onChange={(e) => setCSize(Number(e.target.value))}
                  className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white"
                >
                  <option value={0}>Semua (≥ 2 Foto)</option>
                  <option value={3}>Multi-Duplikat (≥ 3 Foto)</option>
                  <option value={5}>Duplikasi Masif (≥ 5 Foto)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Petugas
                </label>
                <select
                  value={cPcl}
                  onChange={(e) => setCPcl(Number(e.target.value))}
                  className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white"
                >
                  <option value={0}>Semua</option>
                  <option value={2}>Lintas Petugas (≥ 2 Petugas)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Jenis Foto
                </label>
                <select
                  value={cJenis}
                  onChange={(e) => setCJenis(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">Semua Jenis</option>
                  <option value="fotobidang">fotobidang (Sketsa)</option>
                  <option value="foto_petak">foto_petak</option>
                  <option value="fotoplot">fotoplot</option>
                  <option value="fotoberat">fotoberat (Timbangan)</option>
                </select>
              </div>

              <div className="flex-1 min-w-[200px]">
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Cari Petugas / Kecamatan / Desa / KK
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={cSearch}
                    onChange={(e) => setCSearch(e.target.value)}
                    placeholder="Ketik nama petugas, kecamatan, KK..."
                    className="w-full text-xs border border-slate-300 rounded-lg pl-8 pr-3 py-2"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  setCScen("");
                  setCSize(0);
                  setCPcl(0);
                  setCJenis("");
                  setCSearch("");
                }}
                className="flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>

              <div className="text-xs font-bold text-blue-600 ml-auto py-2">
                Menampilkan {filteredClusters.length} grup
              </div>
            </div>

            <div className="space-y-4">
              {filteredClusters.slice(0, 80).map((c) => (
                <div
                  key={c.cluster_id}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs"
                >
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold bg-slate-200 text-slate-800 px-2 py-0.5 rounded">
                        {c.cluster_id}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          c.jumlah_petugas > 1
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                        }`}
                      >
                        {c.jumlah_foto} Foto Sama
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-700">
                        {c.primary_tag}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-600">
                        Subround: {c.daftar_subround}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-600">
                        Jenis: {c.daftar_jenis_foto}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      Kecamatan: <b>{c.daftar_kecamatan}</b> · Petugas ({c.jumlah_petugas}):{" "}
                      <b>{c.daftar_petugas}</b>
                    </div>
                  </div>

                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                    {(c.members || []).map((m: any, idx: number) => (
                      <div
                        key={idx}
                        className="border border-slate-200 rounded-lg overflow-hidden bg-white flex flex-col"
                      >
                        <div
                          onClick={() =>
                            setLightbox({
                              open: true,
                              src: m.image_url,
                              caption: `[${m.subround} - ${m.jenis_foto}] Petugas: ${m.pcl} | ${m.kecamatan} - ${m.desa} | KK: ${m.namakk} (NKS: ${m.nks})`,
                            })
                          }
                          className="relative h-48 bg-slate-900 cursor-zoom-in overflow-hidden group"
                        >
                          <span className="absolute top-2 left-2 z-10 bg-slate-900/80 text-white text-[11px] font-bold px-2 py-0.5 rounded">
                            #{idx + 1}
                          </span>
                          <span className="absolute top-2 right-2 z-10 bg-blue-600/90 text-white text-[11px] font-semibold px-2 py-0.5 rounded">
                            {m.subround} · {m.jenis_foto}
                          </span>
                          <img
                            src={m.image_url}
                            alt={m.jenis_foto}
                            loading="lazy"
                            className="w-full h-full object-contain group-hover:scale-105 transition duration-200"
                          />
                        </div>
                        <div className="p-2.5 text-xs space-y-1">
                          <div className="font-bold text-slate-900 truncate">
                            👮 {m.pcl || "-"}
                          </div>
                          <div className="text-slate-600 font-medium truncate">
                            📍 {m.kecamatan} - {m.desa}
                          </div>
                          <div className="text-slate-700 truncate">
                            👤 <b>{m.namakk || "-"}</b>{" "}
                            <span className="text-slate-400">(NKS: {m.nks || "-"})</span>
                          </div>
                          <div className="text-slate-800">
                            ⚖️ Berat: <b>{m.beratbersih ?? "-"} kg</b> · Rumpun:{" "}
                            {m.jmlhrumpun ?? "-"}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400 truncate">
                            ID: {m.assignmentId}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: PERBANDINGAN PASANGAN (2 FOTO) */}
        {activeTab === "pairs" && (
          <div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Skenario
                </label>
                <select
                  value={pScen}
                  onChange={(e) => setPScen(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">Semua Skenario</option>
                  <option value="Skenario 1">Skenario 1 - Antar Petugas (SR Sama)</option>
                  <option value="Skenario 2">Skenario 2 - Petugas Sama (Lintas SR)</option>
                  <option value="Skenario 3">Skenario 3 - Antar Petugas (Lintas SR)</option>
                  <option value="Skenario 4">Skenario 4 - Petugas Sama (Beda Sampel)</option>
                  <option value="Skenario 5A">Skenario 5A - Lintas Jenis (1 Sampel)</option>
                  <option value="Skenario 5B">Skenario 5B - Lintas Jenis (Beda Sampel)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Tingkat Deteksi
                </label>
                <select
                  value={pKat}
                  onChange={(e) => setPKat(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">Semua Tingkat</option>
                  <option value="1.">1. Identik 100% (SHA-256)</option>
                  <option value="2.">2. Foto Sama (Beda Kompresi)</option>
                  <option value="3.">3. Objek Sama (Crop / Geser / Edit Watermark)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Jenis Foto
                </label>
                <select
                  value={pJenis}
                  onChange={(e) => setPJenis(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">Semua Jenis</option>
                  <option value="fotobidang">fotobidang</option>
                  <option value="foto_petak">foto_petak</option>
                  <option value="fotoplot">fotoplot</option>
                  <option value="fotoberat">fotoberat</option>
                </select>
              </div>

              <div className="flex-1 min-w-[200px]">
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Cari Petugas / Kecamatan / Desa / KK
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={pSearch}
                    onChange={(e) => setPSearch(e.target.value)}
                    placeholder="Ketik nama petugas, kecamatan, KK..."
                    className="w-full text-xs border border-slate-300 rounded-lg pl-8 pr-3 py-2"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  setPScen("");
                  setPKat("");
                  setPJenis("");
                  setPSearch("");
                }}
                className="flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>

              <div className="text-xs font-bold text-blue-600 ml-auto py-2">
                Menampilkan {filteredPairs.length} pasangan
              </div>
            </div>

            <div className="space-y-4">
              {filteredPairs.slice(0, 80).map((f, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs"
                >
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">
                        {f.skenario_kode}: {f.skenario_deskripsi}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          String(f.kategori_temuan).startsWith("1.")
                            ? "bg-rose-50 text-rose-700"
                            : String(f.kategori_temuan).startsWith("2.")
                            ? "bg-amber-50 text-amber-700"
                            : "bg-sky-50 text-sky-700"
                        }`}
                      >
                        {f.kategori_temuan}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      Kemiripan: <b>{f.skor_kemiripan_pct}%</b> ·{" "}
                      <span className="text-slate-400">{f.metode_deteksi}</span>
                    </div>
                  </div>

                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2].map((num) => {
                      const imgUrl = f[`image_url_${num}`];
                      const sr = f[`sr_${num}`];
                      const jenis = f[`jenis_${num}`];
                      const pcl = f[`pcl_${num}`];
                      const kec = f[`kec_${num}`];
                      const desa = f[`desa_${num}`];
                      const kk = f[`namakk_${num}`];
                      const nks = f[`nks_${num}`];
                      const berat = f[`berat_${num}`];
                      const rumpun = f[`rumpun_${num}`];
                      const res = f[`res_${num}`];
                      const aid = f[`assign_${num}`];

                      return (
                        <div
                          key={num}
                          className="flex gap-3.5 border border-slate-200 rounded-lg p-3 bg-slate-50/40"
                        >
                          <div
                            onClick={() =>
                              setLightbox({
                                open: true,
                                src: imgUrl,
                                caption: `[${sr} - ${jenis}] ${pcl} | ${kec} - ${desa} | KK: ${kk}`,
                              })
                            }
                            className="relative w-44 h-48 bg-slate-900 rounded-lg overflow-hidden shrink-0 cursor-zoom-in"
                          >
                            <span className="absolute top-2 right-2 z-10 bg-blue-600/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded">
                              {sr} · {jenis}
                            </span>
                            <img
                              src={imgUrl}
                              alt={jenis}
                              loading="lazy"
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="text-xs space-y-1.5 flex-1 min-w-0">
                            <div className="font-bold text-slate-900 text-sm">
                              👮 {pcl || "-"}
                            </div>
                            <div className="text-slate-700 font-medium">
                              📍 {kec} - {desa}
                            </div>
                            <div className="text-slate-700">
                              👤 Sampel/KK: <b>{kk || "-"}</b> (NKS: {nks || "-"})
                            </div>
                            <div className="text-slate-800">
                              ⚖️ Berat Bersih: <b>{berat ?? "-"} kg</b> · Rumpun:{" "}
                              {rumpun ?? "-"}
                            </div>
                            <div className="text-slate-400 text-[11px] pt-1 font-mono break-all">
                              Resolusi: {res} · ID: {aid}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: TARIK DATA FASIH (SCRAPER & SYNC) */}
        {activeTab === "scraper" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Kolom Kiri: Generator Script Console */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Langkah 1: Salin Kode Penarik Data FASIH-SM (Ramah Server)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Karena FASIH-SM dilindungi SSO BPS & Cloudflare/F5 WAF, penarikan daftar assignment dan Presigned URL paling aman dijalankan langsung dari Console tab tempat kamu sudah login FASIH-SM.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pilih Periode Subround
                  </label>
                  <select
                    value={selectedSr.code}
                    onChange={(e) => {
                      const found = SUBROUND_OPTIONS.find(
                        (o) => o.code === e.target.value
                      );
                      if (found) {
                        setSelectedSr(found);
                        setCustomPeriodId(found.surveyPeriodId);
                      }
                    }}
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2.5 bg-white font-medium"
                  >
                    {SUBROUND_OPTIONS.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Survey Period ID (Bisa disesuaikan)
                  </label>
                  <input
                    type="text"
                    value={customPeriodId}
                    onChange={(e) => setCustomPeriodId(e.target.value)}
                    className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2.5"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  onClick={handleCopyScript}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-xs transition cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Kode Berhasil Disalin!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Salin Kode Console ({selectedSr.code})
                    </>
                  )}
                </button>

                <a
                  href="https://fasih-sm.bps.go.id"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3.5 py-2.5 rounded-lg transition"
                >
                  Buka FASIH-SM
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="relative">
                <pre className="bg-slate-900 text-slate-100 text-[11px] font-mono p-4 rounded-xl overflow-x-auto max-h-72 leading-relaxed">
                  {consoleScript}
                </pre>
              </div>
            </div>

            {/* Kolom Kanan: Upload JSON & Trigger Analisis */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Langkah 2: Unggah File JSON Hasil Scrape
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Setelah script di Console selesai berjalan, browser akan mengunduh file{" "}
                    <code className="bg-slate-100 px-1.5 py-0.5 rounded">
                      rekap_foto_ubinan_...json
                    </code>
                    . Unggah file tersebut di sini untuk disimpan ke Supabase & memicu analisis otomatis via GitHub Actions.
                  </p>
                </div>

                <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition bg-slate-50/50">
                  <UploadCloud className="w-10 h-10 text-blue-600 mb-2" />
                  <span className="text-xs font-bold text-slate-800">
                    Klik untuk memilih file JSON hasil scrape ({selectedSr.code})
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1">
                    Format: rekap_foto_ubinan_{customPeriodId.slice(0, 8)}....json
                  </span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                {uploadStatus.type !== "idle" && (
                  <div
                    className={`p-3.5 rounded-lg text-xs font-medium ${
                      uploadStatus.type === "success"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : uploadStatus.type === "error"
                        ? "bg-rose-50 text-rose-800 border border-rose-200"
                        : "bg-blue-50 text-blue-800 border border-blue-200"
                    }`}
                  >
                    {uploadStatus.msg}
                  </div>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600 space-y-1.5">
                <div className="font-bold text-slate-800">
                  💡 Cara Kerja Arsitektur Cloud Gratis (Vercel + Supabase + GitHub Actions):
                </div>
                <p>
                  1. File JSON berisi metadata dan Presigned URL S3 (aktif 7 hari) dikirim ke tabel{" "}
                  <code>raw_scrape_uploads</code> di Supabase.
                </p>
                <p>
                  2. GitHub Actions otomatis mengunduh foto dari S3 FASIH, menjalankan algoritma{" "}
                  <b>SHA-256 + pHash + OpenCV ORB</b>, lalu mengunggah foto terkompresi (WebP) ke{" "}
                  <b>Supabase Storage</b>.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Lightbox Modal */}
      {lightbox.open && (
        <div
          onClick={() => setLightbox({ open: false, src: "", caption: "" })}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xs flex flex-col items-center justify-center p-6"
        >
          <button
            onClick={() => setLightbox({ open: false, src: "", caption: "" })}
            className="absolute top-5 right-6 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightbox.src}
            alt="Zoom Preview"
            className="max-w-[92vw] max-h-[82vh] object-contain rounded-lg shadow-2xl bg-black"
          />
          <div className="mt-3 bg-black/70 text-white text-xs md:text-sm px-4 py-2 rounded-lg">
            {lightbox.caption}
          </div>
        </div>
      )}
    </div>
  );
}

