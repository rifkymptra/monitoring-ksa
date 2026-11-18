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
  Users,
  ChevronLeft,
  ChevronRight,
  Download,
  ArrowUpRight,
  FileCheck2,
  AlertTriangle,
  Sparkles,
  MapPin,
  Moon,
  Sun,
  Lock,
  LogOut,
  LogIn,
  Eye,
  EyeOff,
  Cpu,
  ScanSearch,
  Fingerprint,
  UserPlus,
  Trash2,
  KeyRound,
  CheckCircle2,
} from "lucide-react";
import {
  SUBROUND_OPTIONS,
  generateFasihConsoleScript,
} from "@/lib/scraperTemplate";
import { supabase } from "@/lib/supabase";

type TabType = "exec" | "clusters" | "pairs" | "scraper";

interface AuthUser {
  username: string;
  fullName: string;
  role: "admin" | "user";
}

const PERIOD_MAP: Record<string, string> = {
  SR3: "6f581089-c787-4c0f-a307-0564f1e4e293",
  SR2: "d182137c-c614-48ca-be9b-1df41f906c0e",
  SR1: "d74be6a7-567c-498b-ae2a-4ac7a163c7c5",
};

function getFasihAssignmentUrl(subround?: string, assignmentId?: string): string {
  const srKey = String(subround || "SR3").trim().toUpperCase();
  const periodId = PERIOD_MAP[srKey] || PERIOD_MAP.SR3;
  return `https://fasih-sm.bps.go.id/app/assignment/${periodId}/${assignmentId || ""}/`;
}

function buildPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

export default function DashboardPage() {
  // Auth & Theme States
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<TabType>("exec");
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(false);
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
  const [officerPopulation, setOfficerPopulation] = useState<any[]>([]);

  // Executive Officer Table States
  const [pclSearch, setPclSearch] = useState("");
  const [pclFilterType, setPclFilterType] = useState<
    "all" | "flagged" | "cross_pcl" | "clean"
  >("all");
  const [pclSortBy, setPclSortBy] = useState<
    "pct_desc" | "count_desc" | "clean_first" | "name_asc"
  >("pct_desc");
  const [pclPage, setPclPage] = useState(1);
  const pclPageSize = 12;

  // Filter States - Clusters
  const [cScen, setCScen] = useState("");
  const [cSr, setCSr] = useState("");
  const [cSize, setCSize] = useState(0);
  const [cPcl, setCPcl] = useState(0);
  const [cJenis, setCJenis] = useState("");
  const [cSearch, setCSearch] = useState("");
  const [clusterPage, setClusterPage] = useState(1);
  const [clusterPageSize, setClusterPageSize] = useState(10);

  // Filter States - Pairs
  const [pScen, setPScen] = useState("");
  const [pSr, setPSr] = useState("");
  const [pKat, setPKat] = useState("");
  const [pJenis, setPJenis] = useState("");
  const [pSearch, setPSearch] = useState("");
  const [pairPage, setPairPage] = useState(1);
  const [pairPageSize, setPairPageSize] = useState(10);

  // Scraper & Admin User Management States
  const [selectedSr, setSelectedSr] = useState(SUBROUND_OPTIONS[0]);
  const [customPeriodId, setCustomPeriodId] = useState(
    SUBROUND_OPTIONS[0].surveyPeriodId
  );
  const [catalogFilenames, setCatalogFilenames] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    msg: string;
  }>({ type: "idle", msg: "" });

  const [userList, setUserList] = useState<any[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [userMsg, setUserMsg] = useState<{ type: "idle" | "ok" | "err"; text: string }>({
    type: "idle",
    text: "",
  });

  // Lightbox Modal
  const [lightbox, setLightbox] = useState<{
    open: boolean;
    src: string;
    caption: string;
  }>({ open: false, src: "", caption: "" });

  // Load saved theme preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ksa_theme");
      if (saved === "dark") setDarkMode(true);
    } catch {}
  }, []);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("ksa_theme", next ? "dark" : "light");
      } catch {}
      return next;
    });
  };

  // Check active session on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((res) => {
        if (res.authenticated && res.user) {
          setCurrentUser(res.user);
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecking(false));
  }, []);

  // Fetch audit data only when authenticated
  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    fetch("/api/audit-data")
      .then((r) => {
        if (!r.ok) throw new Error("Unauthorized");
        return r.json();
      })
      .then((res) => {
        setDataSource(res.source || "local_json");
        if (res.summary) setSummary(res.summary);
        if (Array.isArray(res.clusters)) setClusters(res.clusters);
        if (Array.isArray(res.pairs)) setPairs(res.pairs);
        if (Array.isArray(res.officer_population)) {
          setOfficerPopulation(res.officer_population);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    if (currentUser.role === "admin") {
      fetchUsersList();
    }
  }, [currentUser]);

  const fetchUsersList = () => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((res) => {
        if (Array.isArray(res.users)) setUserList(res.users);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") return;
    fetch(`/api/catalog-filenames?subround=${encodeURIComponent(selectedSr.code)}`)
      .then((r) => r.json())
      .then((res) => {
        if (Array.isArray(res.filenames)) {
          setCatalogFilenames(res.filenames);
        }
      })
      .catch(() => {});
  }, [currentUser, selectedSr.code]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Gagal masuk. Periksa kembali akun Anda.");
        return;
      }
      setCurrentUser(data.user);
      setShowLoginModal(false);
      setLoginUsername("");
      setLoginPassword("");
      setActiveTab("exec");
    } catch {
      setLoginError("Terjadi gangguan jaringan saat menghubungi server.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setCurrentUser(null);
    setClusters([]);
    setPairs([]);
    setActiveTab("exec");
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserMsg({ type: "idle", text: "" });
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername,
          fullName: newFullName,
          password: newPassword,
          role: newRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan user");
      setUserMsg({ type: "ok", text: data.message });
      setNewUsername("");
      setNewFullName("");
      setNewPassword("");
      fetchUsersList();
    } catch (err: any) {
      setUserMsg({ type: "err", text: err?.message || "Gagal menyimpan user" });
    }
  };

  const handleDeleteUser = async (uname: string) => {
    if (!confirm(`Hapus akun '${uname}'?`)) return;
    try {
      const res = await fetch(`/api/users?username=${encodeURIComponent(uname)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus user");
      setUserMsg({ type: "ok", text: data.message });
      fetchUsersList();
    } catch (err: any) {
      setUserMsg({ type: "err", text: err?.message || "Gagal menghapus user" });
    }
  };

  // Reset pagination when filters change
  useEffect(() => {
    setClusterPage(1);
  }, [cScen, cSr, cSize, cPcl, cJenis, cSearch, clusterPageSize]);

  useEffect(() => {
    setPairPage(1);
  }, [pScen, pSr, pKat, pJenis, pSearch, pairPageSize]);

  useEffect(() => {
    setPclPage(1);
  }, [pclSearch, pclFilterType, pclSortBy]);

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

  // Rekapitulasi Per Petugas (PCL) - Mencakup Seluruh Petugas Termasuk yang 0% (Bersih)
  const officerSummary = useMemo(() => {
    const map: Record<
      string,
      {
        pcl: string;
        kecamatans: Set<string>;
        subrounds: Set<string>;
        totalAssignments: number;
        totalPhotos: number;
        clustersCount: number;
        crossPclClusters: number;
        diffSampleClusters: number;
        sameSampleClusters: number;
        samplesInvolved: Set<string>;
        uniquePhotosInvolved: Set<string>;
      }
    > = {};

    // 1. Inisialisasi seluruh populasi petugas dari photo_catalog (agar petugas 0% ikut tampil)
    for (const pop of officerPopulation) {
      const name = String(pop.pcl || "Tanpa Nama").trim().toUpperCase();
      if (!name) continue;
      map[name] = {
        pcl: name,
        kecamatans: new Set(Array.isArray(pop.kecamatans) ? pop.kecamatans : []),
        subrounds: new Set(Array.isArray(pop.subrounds) ? pop.subrounds : []),
        totalAssignments: Number(pop.total_assignments || 0),
        totalPhotos: Number(pop.total_photos || 0),
        clustersCount: 0,
        crossPclClusters: 0,
        diffSampleClusters: 0,
        sameSampleClusters: 0,
        samplesInvolved: new Set(),
        uniquePhotosInvolved: new Set(),
      };
    }

    // 2. Akumulasikan temuan dari duplicate_clusters
    for (const c of clusters) {
      const members = Array.isArray(c.members) ? c.members : [];
      const pclsInCluster = new Set<string>();
      const assignmentsInCluster = new Set<string>();

      for (const m of members) {
        const name = String(m.pcl || "Tanpa Nama").trim().toUpperCase();
        pclsInCluster.add(name);
        if (m.assignmentId) {
          assignmentsInCluster.add(`${m.subround || ""}:${m.assignmentId}`);
        }
      }

      const isCrossPcl = pclsInCluster.size > 1;
      const isDiffSample = assignmentsInCluster.size > 1;

      const countedForCluster = new Set<string>();
      for (const m of members) {
        const name = String(m.pcl || "Tanpa Nama").trim().toUpperCase();
        if (!map[name]) {
          map[name] = {
            pcl: name,
            kecamatans: new Set(),
            subrounds: new Set(),
            totalAssignments: 0,
            totalPhotos: 0,
            clustersCount: 0,
            crossPclClusters: 0,
            diffSampleClusters: 0,
            sameSampleClusters: 0,
            samplesInvolved: new Set(),
            uniquePhotosInvolved: new Set(),
          };
        }
        if (m.kecamatan) map[name].kecamatans.add(String(m.kecamatan).trim().toUpperCase());
        if (m.subround) map[name].subrounds.add(String(m.subround).trim().toUpperCase());
        if (m.assignmentId) {
          map[name].samplesInvolved.add(`${m.subround || ""}:${m.assignmentId}`);
        }
        const photoUniqueKey = `${m.subround || ""}:${m.assignmentId || ""}:${
          m.jenis_foto || m.relpath || ""
        }`;
        map[name].uniquePhotosInvolved.add(photoUniqueKey);

        if (!countedForCluster.has(name)) {
          countedForCluster.add(name);
          map[name].clustersCount++;
          if (isCrossPcl) {
            map[name].crossPclClusters++;
          } else if (isDiffSample) {
            map[name].diffSampleClusters++;
          } else {
            map[name].sameSampleClusters++;
          }
        }
      }
    }

    return Object.values(map).map((item) => {
      const sampleCount = item.samplesInvolved.size;
      const photosCount = item.uniquePhotosInvolved.size;
      const totalAssignments = Math.max(item.totalAssignments, sampleCount);
      const totalPhotos = Math.max(item.totalPhotos, photosCount);
      const samplePct =
        totalAssignments > 0
          ? Number(((sampleCount / totalAssignments) * 100).toFixed(1))
          : 0;
      const photoPct =
        totalPhotos > 0
          ? Number(((photosCount / totalPhotos) * 100).toFixed(1))
          : 0;

      return {
        ...item,
        kecamatanList: Array.from(item.kecamatans).sort().join(", "),
        subroundList: Array.from(item.subrounds).sort().join(", "),
        sampleCount,
        photosCount,
        totalAssignments,
        totalPhotos,
        samplePct,
        photoPct,
        isClean: item.clustersCount === 0,
      };
    });
  }, [clusters, officerPopulation]);

  const officerCounts = useMemo(() => {
    let flagged = 0;
    let crossPcl = 0;
    let clean = 0;
    for (const o of officerSummary) {
      if (o.isClean) clean++;
      else flagged++;
      if (o.crossPclClusters > 0) crossPcl++;
    }
    return { total: officerSummary.length, flagged, crossPcl, clean };
  }, [officerSummary]);

  const filteredOfficers = useMemo(() => {
    const q = pclSearch.trim().toLowerCase();
    const filtered = officerSummary.filter((o) => {
      if (pclFilterType === "flagged" && o.isClean) return false;
      if (pclFilterType === "cross_pcl" && o.crossPclClusters === 0) return false;
      if (pclFilterType === "clean" && !o.isClean) return false;
      if (q) {
        const hay = `${o.pcl} ${o.kecamatanList}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (pclSortBy === "pct_desc") {
        if (b.samplePct !== a.samplePct) return b.samplePct - a.samplePct;
        if (b.photoPct !== a.photoPct) return b.photoPct - a.photoPct;
        if (b.clustersCount !== a.clustersCount) return b.clustersCount - a.clustersCount;
        return a.pcl.localeCompare(b.pcl);
      }
      if (pclSortBy === "count_desc") {
        if (b.sampleCount !== a.sampleCount) return b.sampleCount - a.sampleCount;
        if (b.clustersCount !== a.clustersCount) return b.clustersCount - a.clustersCount;
        if (b.photosCount !== a.photosCount) return b.photosCount - a.photosCount;
        return a.pcl.localeCompare(b.pcl);
      }
      if (pclSortBy === "clean_first") {
        if (a.samplePct !== b.samplePct) return a.samplePct - b.samplePct;
        if (b.totalAssignments !== a.totalAssignments)
          return b.totalAssignments - a.totalAssignments;
        return a.pcl.localeCompare(b.pcl);
      }
      return a.pcl.localeCompare(b.pcl);
    });
  }, [officerSummary, pclSearch, pclFilterType, pclSortBy]);

  const totalPclPages = Math.max(1, Math.ceil(filteredOfficers.length / pclPageSize));
  const paginatedOfficers = useMemo(() => {
    const start = (pclPage - 1) * pclPageSize;
    return filteredOfficers.slice(start, start + pclPageSize);
  }, [filteredOfficers, pclPage]);

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
    return Object.values(map).sort((a, b) => b.photos - a.photos);
  }, [clusters]);

  // Filtered Clusters
  const filteredClusters = useMemo(() => {
    const q = cSearch.trim().toLowerCase();
    return clusters.filter((c) => {
      if (cScen && !String(c.skenario_terlibat || "").includes(cScen)) return false;
      if (cSr) {
        const hasSrInHeader = String(c.daftar_subround || "").includes(cSr);
        const hasSrInMembers = Array.isArray(c.members)
          ? c.members.some((m: any) => m.subround === cSr)
          : false;
        if (!hasSrInHeader && !hasSrInMembers) return false;
      }
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
  }, [clusters, cScen, cSr, cSize, cPcl, cJenis, cSearch]);

  const totalClusterPages = Math.max(
    1,
    Math.ceil(filteredClusters.length / clusterPageSize)
  );
  const paginatedClusters = useMemo(() => {
    const start = (clusterPage - 1) * clusterPageSize;
    return filteredClusters.slice(start, start + clusterPageSize);
  }, [filteredClusters, clusterPage, clusterPageSize]);

  // Filtered Pairs
  const filteredPairs = useMemo(() => {
    const q = pSearch.trim().toLowerCase();
    return pairs.filter((p) => {
      if (pScen && p.skenario_kode !== pScen) return false;
      if (pSr && p.sr_1 !== pSr && p.sr_2 !== pSr) return false;
      if (pKat && !String(p.kategori_temuan || "").startsWith(pKat)) return false;
      if (pJenis && p.jenis_1 !== pJenis && p.jenis_2 !== pJenis) return false;
      if (q) {
        const hay = `${p.pcl_1} ${p.pcl_2} ${p.kec_1} ${p.kec_2} ${p.desa_1} ${p.desa_2} ${p.namakk_1} ${p.namakk_2} ${p.nks_1} ${p.nks_2} ${p.assign_1} ${p.assign_2}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pairs, pScen, pSr, pKat, pJenis, pSearch]);

  const totalPairPages = Math.max(1, Math.ceil(filteredPairs.length / pairPageSize));
  const paginatedPairs = useMemo(() => {
    const start = (pairPage - 1) * pairPageSize;
    return filteredPairs.slice(start, start + pairPageSize);
  }, [filteredPairs, pairPage, pairPageSize]);

  const consoleScript = useMemo(
    () =>
      generateFasihConsoleScript(
        customPeriodId,
        selectedSr.code,
        catalogFilenames
      ),
    [customPeriodId, selectedSr, catalogFilenames]
  );

  const handleCopyScript = async () => {
    await navigator.clipboard.writeText(consoleScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadOfficerCsv = () => {
    const headers = [
      "No",
      "Nama Petugas",
      "Kecamatan",
      "Subround",
      "Status Pemeriksaan",
      "Sampel Terindikasi",
      "Total Sampel Petugas",
      "Persentase Sampel Bermasalah (%)",
      "Foto Terindikasi",
      "Total Foto Petugas",
      "Persentase Foto Duplikat (%)",
      "Total Grup Duplikat",
      "Grup Lintas Petugas",
      "Grup Antar Sampel Sendiri",
      "Grup Internal 1 Sampel",
    ];
    const rows = filteredOfficers.map((o, i) => [
      i + 1,
      `"${o.pcl.replace(/"/g, '""')}"`,
      `"${o.kecamatanList.replace(/"/g, '""')}"`,
      `"${o.subroundList}"`,
      o.isClean ? "BERSIH (0%)" : "TERINDIKASI DUPLIKAT",
      o.sampleCount,
      o.totalAssignments,
      o.samplePct,
      o.photosCount,
      o.totalPhotos,
      o.photoPct,
      o.clustersCount,
      o.crossPclClusters,
      o.diffSampleClusters,
      o.sameSampleClusters,
    ]);
    const csvContent =
      "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekap_evaluasi_petugas_ubinan_garut.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus({ type: "loading", msg: "Membaca file JSON hasil scrape..." });

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error("Format JSON harus berupa array daftar assignment.");
      }

      // 1. Cek apakah ada foto baru dengan webpBase64 untuk di-upload langsung (Direct Browser -> Supabase Storage)
      const newPhotosToRelay: Array<{ pObj: any; fileName: string }> = [];
      for (const a of parsed) {
        const photos = a?.photos || {};
        for (const k of ["fotobidang", "foto_petak", "fotoplot", "fotoberat"]) {
          const pObj = photos[k];
          if (pObj && pObj.webpBase64 && pObj.fileName) {
            newPhotosToRelay.push({ pObj, fileName: pObj.fileName });
          }
        }
      }

      if (newPhotosToRelay.length > 0 && supabase) {
        for (let i = 0; i < newPhotosToRelay.length; i++) {
          const { pObj, fileName } = newPhotosToRelay[i];
          setUploadStatus({
            type: "loading",
            msg: `Mengunggah foto baru langsung ke Supabase Storage (${i + 1}/${newPhotosToRelay.length})...`,
          });

          try {
            const base64Part = String(pObj.webpBase64).split(",")[1] || "";
            const binaryStr = atob(base64Part);
            const bytes = new Uint8Array(binaryStr.length);
            for (let b = 0; b < binaryStr.length; b++) {
              bytes[b] = binaryStr.charCodeAt(b);
            }
            const blob = new Blob([bytes], { type: "image/webp" });
            const tempKey = `temp_new/${fileName}.webp`;

            const { error: upErr } = await supabase.storage
              .from("ubinan-photos")
              .upload(tempKey, blob, {
                contentType: "image/webp",
                upsert: true,
              });

            if (!upErr) {
              const { data: pubData } = supabase.storage
                .from("ubinan-photos")
                .getPublicUrl(tempKey);
              pObj.tempStorageKey = tempKey;
              pObj.tempStorageUrl = pubData.publicUrl;
            }
          } catch (relayErr) {
            console.warn("Gagal relay foto ke temp_new:", relayErr);
          }

          // Hapus string base64 agar payload JSON ke Vercel tetap sangat ringan
          delete pObj.webpBase64;
        }
      } else {
        // Pastikan tidak ada base64 tersisa meskipun supabase client belum diinisialisasi
        for (const { pObj } of newPhotosToRelay) {
          delete pObj.webpBase64;
        }
      }

      setUploadStatus({
        type: "loading",
        msg: "Menyimpan metadata & memicu analisis otomatis GitHub Actions...",
      });

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
      setUploadStatus({
        type: "success",
        msg: `${data.message}${
          newPhotosToRelay.length > 0
            ? ` (${newPhotosToRelay.length} foto baru berhasil di-relay ke Supabase Storage bebas blokir IP!)`
            : ""
        }`,
      });
    } catch (err: any) {
      setUploadStatus({
        type: "error",
        msg: err?.message || "Format file JSON tidak sesuai",
      });
    }
  };

  const changeClusterPage = (nextPage: number) => {
    const target = Math.max(1, Math.min(totalClusterPages, nextPage));
    setClusterPage(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const changePairPage = (nextPage: number) => {
    const target = Math.max(1, Math.min(totalPairPages, nextPage));
    setPairPage(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ============================================================================
  // RENDER 1: PUBLIC LANDING PAGE (SAAT BELUM LOGIN)
  // ============================================================================
  if (!currentUser) {
    return (
      <div className={darkMode ? "dark" : ""}>
        <div className="min-h-screen bg-[#f8fafc] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between relative overflow-hidden transition-colors duration-200 selection:bg-blue-600 selection:text-white">
          {/* Subtle Ambient Background Glow */}
          <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[750px] h-[400px] bg-gradient-to-tr from-blue-500/10 via-indigo-500/10 to-emerald-500/10 blur-3xl rounded-full" />

          {/* Public Topbar */}
          <header className="relative z-20 border-b border-slate-200/70 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1.5 flex items-center justify-center shadow-2xs">
                  <img
                    src="/bps_logo.webp"
                    alt="Logo BPS"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                    BPS Kabupaten Garut
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Quality Assurance Survei KSA & Ubinan
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={toggleDarkMode}
                  title={darkMode ? "Mode Terang" : "Mode Gelap"}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>

                <button
                  onClick={() => setShowLoginModal(true)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Masuk Sistem
                </button>
              </div>
            </div>
          </header>

          {/* Hero & Introduction Content */}
          <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-14">
            {/* Hero Section */}
            <div className="text-center max-w-3xl mx-auto space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/80">
                <Sparkles className="w-3.5 h-3.5" />
                Sistem Kendali Mutu Dokumentasi FASIH-SM · Kabupaten Garut
              </div>

              <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.15]">
                Audit & Deteksi Duplikasi Foto{" "}
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                  Ubinan Padi
                </span>
              </h1>

              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mx-auto">
                Platform cerdas berbasis <b>Computer Vision</b> untuk memverifikasi keaslian foto dokumentasi lapangan Survei Ubinan (Subround 1, 2, dan 3). Mendeteksi secara otomatis indikasi penggunaan foto berulang lintas petugas, lintas subround, maupun lintas sampel secara presisi.
              </p>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => setShowLoginModal(true)}
                  disabled={authChecking}
                  className="inline-flex items-center gap-2.5 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 text-white text-xs sm:text-sm font-bold px-6 py-3.5 rounded-2xl shadow-md hover:shadow-lg transition cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  {authChecking ? "Memeriksa Sesi..." : "Masuk ke Ruang Pemeriksaan"}
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-[11px] text-slate-400 dark:text-slate-500">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Bebas Bias Watermark FASIH
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Sinkronisasi Inkremental Otomatis
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Akses Terproteksi Hak Akses (Role-Based)
                </span>
              </div>
            </div>

            {/* 3 Core Technology Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <ScanSearch className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  1. Content-Area Cropping
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Memotong otomatis 26% area bawah dan 5% area atas foto (lokasi banner waktu, koordinat GPS, dan logo FASIH) sehingga pengujian murni menilai objek sawah, petak, sketsa bidang, serta timbangan.
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Fingerprint className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  2. SHA-256 & Multi-Rotation pHash
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Mengombinasikan sidik jari kriptografi <b>SHA-256</b> untuk menangkap file identik 100% dan <b>Perceptual Hash (pHash/dHash)</b> 8 orientasi untuk mendeteksi foto yang dikompres ulang via WhatsApp atau diputar.
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  3. OpenCV ORB + RANSAC Homography
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Mencocokkan ribuan titik fitur geometris (keypoints) dengan verifikasi matriks homografi RANSAC untuk mengenali foto yang diambil beruntun di titik yang sama, di-crop, atau diedit teks tanggalnya.
                </p>
              </div>
            </div>

            {/* 6 Scenarios Overview Card */}
            <div className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-5 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Cakupan 6 Skenario Pemeriksaan Dokumentasi
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Seluruh foto dari 4 variabel kuesioner (<code>fotobidang</code>, <code>foto_petak</code>, <code>fotoplot</code>, <code>fotoberat</code>) diuji silang secara menyeluruh.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                  <ShieldCheck className="w-4 h-4" />
                  Standar Kendali Mutu BPS
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-5 text-xs">
                {[
                  {
                    code: "Skenario 1",
                    title: "Antar Petugas (Subround Sama)",
                    desc: "Mendeteksi satu foto yang digunakan bersama oleh dua atau lebih petugas berbeda pada periode subround yang sama.",
                  },
                  {
                    code: "Skenario 2",
                    title: "Petugas Sama (Lintas Subround)",
                    desc: "Mendeteksi petugas yang menggunakan kembali foto dari subround sebelumnya (misal foto SR1/SR2 diunggah lagi di SR3).",
                  },
                  {
                    code: "Skenario 3",
                    title: "Antar Petugas (Lintas Subround)",
                    desc: "Mendeteksi foto milik suatu petugas di subround lama yang dipakai oleh petugas lain pada subround berikutnya.",
                  },
                  {
                    code: "Skenario 4",
                    title: "Petugas Sama (Antar Sampel Berbeda)",
                    desc: "Mendeteksi petugas yang memakai foto yang sama untuk dua rumah tangga/sampel NKS berbeda di subround yang sama.",
                  },
                  {
                    code: "Skenario 5A",
                    title: "Lintas Jenis Foto (1 Sampel Sama)",
                    desc: "Mendeteksi salah unggah atau duplikasi antar blok isian dalam satu sampel (misal foto_petak diisi sama dengan fotoplot).",
                  },
                  {
                    code: "Skenario 5B",
                    title: "Lintas Jenis Foto (Beda Sampel)",
                    desc: "Mendeteksi foto dari variabel tertentu yang digunakan ulang sebagai variabel lain pada sampel ubinan berbeda.",
                  },
                ].map((item) => (
                  <div
                    key={item.code}
                    className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1.5"
                  >
                    <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100/80 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                      {item.code}
                    </span>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {item.title}
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </main>

          {/* Footer */}
          <footer className="relative z-10 border-t border-slate-200/70 dark:border-slate-800/80 py-5 text-center text-xs text-slate-400 dark:text-slate-500">
            © {new Date().getFullYear()} Badan Pusat Statistik Kabupaten Garut · Sistem Monitoring & Audit Dokumentasi KSA/Ubinan
          </footer>

          {/* FLOATING LOGIN MODAL */}
          {showLoginModal && (
            <div
              onClick={() => setShowLoginModal(false)}
              className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1.5 flex items-center justify-center">
                      <img
                        src="/bps_logo.webp"
                        alt="Logo BPS"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        Masuk ke Dashboard Audit
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Gunakan akun Pemeriksa atau Administrator BPS
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowLoginModal(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
                  {loginError && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-700 dark:text-rose-300">
                      {loginError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Username
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="Contoh: pemeriksa atau admin"
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Masukkan password..."
                        className="w-full text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl pl-3.5 pr-10 py-2.5 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loginLoading}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold py-3 rounded-xl shadow-sm transition cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    {loginLoading ? "Memverifikasi Akun..." : "Masuk Sekarang"}
                  </button>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between">
                    <span>🔒 Koneksi Terenkripsi (HTTP-Only Session)</span>
                    <span>BPS Kab. Garut (3205)</span>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER 2: AUTHENTICATED DASHBOARD (ADMIN & USER)
  // ============================================================================
  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-[#f8fafc] dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200 selection:bg-blue-600 selection:text-white">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
            <div
              onClick={() => setActiveTab("exec")}
              className="flex items-center gap-3.5 cursor-pointer group"
            >
              <div className="w-11 h-11 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 p-1.5 flex items-center justify-center shadow-2xs group-hover:border-blue-300 dark:group-hover:border-blue-500 transition">
                <img
                  src="/bps_logo.webp"
                  alt="Logo BPS"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-white">
                    Quality Assurance Foto Ubinan KSA
                  </h1>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {dataSource === "supabase" ? "Supabase Cloud" : "Data Lokal"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  BPS Kabupaten Garut · Sistem Deteksi Duplikasi Dokumentasi FASIH-SM
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <nav className="flex items-center gap-1 bg-slate-100/90 dark:bg-slate-800/90 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/70 overflow-x-auto">
                <button
                  onClick={() => setActiveTab("exec")}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                    activeTab === "exec"
                      ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Ringkasan & Petugas
                </button>
                <button
                  onClick={() => setActiveTab("clusters")}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                    activeTab === "clusters"
                      ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Kelompok Foto Sama
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-md text-[10px] bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                    {clusters.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab("pairs")}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                    activeTab === "pairs"
                      ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  Perbandingan Pasangan
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-md text-[10px] bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                    {pairs.length}
                  </span>
                </button>

                {/* Tab Tarik Data FASIH & Admin HANYA muncul untuk Role Admin */}
                {currentUser.role === "admin" && (
                  <button
                    onClick={() => setActiveTab("scraper")}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                      activeTab === "scraper"
                        ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs"
                        : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    Tarik Data FASIH
                  </button>
                )}
              </nav>

              {/* User Role Badge + Dark Mode + Logout */}
              <div className="flex items-center gap-1.5">
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {currentUser.username}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      currentUser.role === "admin"
                        ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {currentUser.role}
                  </span>
                </div>

                <button
                  onClick={toggleDarkMode}
                  title={darkMode ? "Beralih ke Mode Terang" : "Beralih ke Mode Gelap"}
                  className="p-2 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer shrink-0"
                >
                  {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>

                <button
                  onClick={handleLogout}
                  title="Keluar / Logout"
                  className="flex items-center gap-1 px-2.5 py-2 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition cursor-pointer shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Keluar</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Minimalist Modern KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Populasi Pemeriksaan
                </span>
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                  <Database className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {summary.total_photos.toLocaleString("id-ID")}{" "}
                  <span className="text-xs font-normal text-slate-400">foto</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Dari{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {summary.total_assignments.toLocaleString("id-ID")}
                  </span>{" "}
                  assignment ubinan (SR1–SR3)
                </div>
              </div>
            </div>

            <div
              onClick={() => {
                setCScen("");
                setCSr("");
                setCSize(0);
                setCPcl(0);
                setActiveTab("clusters");
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-2xs hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                  Kelompok Foto Sama
                </span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold tracking-tight text-blue-600 dark:text-blue-400">
                    {summary.total_clusters.toLocaleString("id-ID")}
                  </span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    grup unik
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                  <span>{summary.multi_photo_clusters} grup berisi ≥ 3 foto</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
                </div>
              </div>
            </div>

            <div
              onClick={() => {
                setCPcl(2);
                setCScen("");
                setCSr("");
                setCSize(0);
                setActiveTab("clusters");
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-2xs hover:border-rose-300 dark:hover:border-rose-700 hover:shadow-sm transition cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition">
                  Indikasi Lintas Petugas
                </span>
                <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold tracking-tight text-rose-600 dark:text-rose-400">
                    {summary.cross_pcl_clusters.toLocaleString("id-ID")}
                  </span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    grup lintas PCL
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                  <span>Dipakai ≥ 2 petugas berbeda</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-rose-600 dark:group-hover:text-rose-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
                </div>
              </div>
            </div>

            <div
              onClick={() => {
                setPKat("1.");
                setPScen("");
                setPSr("");
                setActiveTab("pairs");
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-2xs hover:border-amber-300 dark:hover:border-amber-700 hover:shadow-sm transition cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition">
                  File Identik 100% (SHA-256)
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <FileCheck2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold tracking-tight text-amber-600 dark:text-amber-400">
                    {summary.exact_pairs.toLocaleString("id-ID")}
                  </span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    dari {summary.total_pairs.toLocaleString("id-ID")} pasang
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                  <span>Biner file persis sama tanpa ubahan</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
                </div>
              </div>
            </div>
          </div>

          {/* TAB 1: RINGKASAN EKSEKUTIF & REKAP PETUGAS */}
          {activeTab === "exec" && (
            <div className="space-y-6">
              {/* REKAPITULASI PER PETUGAS */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xs overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <h2 className="text-base font-bold text-slate-900 dark:text-white">
                          Evaluasi & Persentase Indikasi Duplikasi per Petugas (PCL)
                        </h2>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          Total {officerCounts.total} Petugas
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800">
                          {officerCounts.clean} Petugas Bersih (0%)
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800">
                          {officerCounts.flagged} Petugas Terindikasi
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Menampilkan perbandingan beban tugas (total sampel & total foto) terhadap jumlah sampel maupun foto yang terindikasi duplikat untuk seluruh petugas, termasuk petugas dengan temuan 0% (bersih).
                      </p>
                    </div>

                    <button
                      onClick={handleDownloadOfficerCsv}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl transition cursor-pointer shrink-0"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      Unduh CSV Lengkap ({filteredOfficers.length})
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                    {/* Filter Chips */}
                    <div className="flex flex-wrap items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-medium gap-0.5">
                      <button
                        onClick={() => setPclFilterType("all")}
                        className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                          pclFilterType === "all"
                            ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        Semua ({officerCounts.total})
                      </button>
                      <button
                        onClick={() => setPclFilterType("flagged")}
                        className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                          pclFilterType === "flagged"
                            ? "bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        Ada Indikasi ({officerCounts.flagged})
                      </button>
                      <button
                        onClick={() => setPclFilterType("cross_pcl")}
                        className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                          pclFilterType === "cross_pcl"
                            ? "bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-2xs font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        Lintas Petugas ({officerCounts.crossPcl})
                      </button>
                      <button
                        onClick={() => setPclFilterType("clean")}
                        className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                          pclFilterType === "clean"
                            ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        ✅ Bersih 0% ({officerCounts.clean})
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Sort Selector */}
                      <select
                        value={pclSortBy}
                        onChange={(e) => setPclSortBy(e.target.value as any)}
                        className="text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 font-medium"
                      >
                        <option value="pct_desc">Urut: % Sampel Tertinggi</option>
                        <option value="count_desc">Urut: Jumlah Temuan Terbanyak</option>
                        <option value="clean_first">Urut: Petugas Bersih (0%) di Atas</option>
                        <option value="name_asc">Urut: Nama Petugas (A–Z)</option>
                      </select>

                      {/* Search Box */}
                      <div className="relative min-w-[210px]">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={pclSearch}
                          onChange={(e) => setPclSearch(e.target.value)}
                          placeholder="Cari nama petugas / kecamatan..."
                          className="w-full text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl pl-8 pr-3 py-2 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-3.5 w-10 text-center">#</th>
                        <th className="py-3 px-4">Nama Petugas & Wilayah</th>
                        <th className="py-3 px-3 text-center">Subround</th>
                        <th className="py-3 px-3 text-center">
                          Sampel (Terindikasi / Total)
                        </th>
                        <th className="py-3 px-3 text-center">
                          Foto (Terindikasi / Total)
                        </th>
                        <th className="py-3 px-4 min-w-[165px]">
                          % Indikasi (Sampel & Foto)
                        </th>
                        <th className="py-3 px-4">Status & Pola Duplikasi</th>
                        <th className="py-3 px-4 text-right">Telusuri Bukti</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {paginatedOfficers.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400">
                            {loading
                              ? "Memuat data pemeriksaan..."
                              : "Tidak ada data petugas yang cocok dengan filter pencarian."}
                          </td>
                        </tr>
                      ) : (
                        paginatedOfficers.map((o, idx) => {
                          const rank = (pclPage - 1) * pclPageSize + idx + 1;
                          const isHighRisk =
                            o.crossPclClusters > 0 || o.samplePct >= 25;
                          return (
                            <tr
                              key={o.pcl}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition group"
                            >
                              <td className="py-3 px-3.5 text-center font-mono text-slate-400">
                                {rank}
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-900 dark:text-white">
                                  {o.pcl}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[230px]">
                                  📍 {o.kecamatanList || "-"}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-[11px]">
                                  {o.subroundList || "-"}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <span
                                  className={`font-extrabold text-sm ${
                                    o.sampleCount > 0
                                      ? "text-slate-900 dark:text-white"
                                      : "text-emerald-600 dark:text-emerald-400"
                                  }`}
                                >
                                  {o.sampleCount}
                                </span>
                                <span className="text-slate-400">
                                  {" "}
                                  / {o.totalAssignments} sampel
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <span
                                  className={`font-bold text-sm ${
                                    o.photosCount > 0
                                      ? "text-blue-600 dark:text-blue-400"
                                      : "text-emerald-600 dark:text-emerald-400"
                                  }`}
                                >
                                  {o.photosCount}
                                </span>
                                <span className="text-slate-400">
                                  {" "}
                                  / {o.totalPhotos} foto
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                {o.isClean ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                                        0,0% Sampel
                                      </span>
                                      <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 font-medium">
                                        0,0% Foto
                                      </span>
                                    </div>
                                    <div className="w-full h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 overflow-hidden">
                                      <div className="h-full w-0 bg-emerald-500 rounded-full" />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <span
                                        className={`font-extrabold text-sm ${
                                          isHighRisk
                                            ? "text-rose-600 dark:text-rose-400"
                                            : "text-amber-600 dark:text-amber-400"
                                        }`}
                                      >
                                        {o.samplePct.toLocaleString("id-ID")}%{" "}
                                        <span className="text-[10px] font-semibold">
                                          Sampel
                                        </span>
                                      </span>
                                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                        ({o.photoPct.toLocaleString("id-ID")}% Foto)
                                      </span>
                                    </div>
                                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${
                                          isHighRisk ? "bg-rose-500" : "bg-amber-500"
                                        }`}
                                        style={{
                                          width: `${Math.min(100, Math.max(4, o.samplePct))}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                {o.isClean ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Bersih 100% (Semua Unik)
                                  </span>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {o.crossPclClusters > 0 && (
                                      <span
                                        title="Foto yang sama dipakai bersama petugas lain"
                                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800"
                                      >
                                        {o.crossPclClusters} Lintas Petugas
                                      </span>
                                    )}
                                    {o.diffSampleClusters > 0 && (
                                      <span
                                        title="Foto yang sama dipakai ulang di sampel lain oleh petugas ini"
                                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800"
                                      >
                                        {o.diffSampleClusters} Antar Sampel
                                      </span>
                                    )}
                                    {o.sameSampleClusters > 0 && (
                                      <span
                                        title="Foto dipakai ganda pada isian berbeda di dalam 1 sampel yang sama"
                                        className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                                      >
                                        {o.sameSampleClusters} Internal Sampel
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                {o.isClean ? (
                                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    Aman ✓
                                  </span>
                                ) : (
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      onClick={() => {
                                        setCScen("");
                                        setCSr("");
                                        setCSize(0);
                                        setCPcl(0);
                                        setCJenis("");
                                        setCSearch(o.pcl);
                                        setActiveTab("clusters");
                                      }}
                                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white transition cursor-pointer"
                                    >
                                      Lihat Grup ({o.clustersCount})
                                    </button>
                                    <button
                                      onClick={() => {
                                        setPScen("");
                                        setPSr("");
                                        setPKat("");
                                        setPJenis("");
                                        setPSearch(o.pcl);
                                        setActiveTab("pairs");
                                      }}
                                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                                    >
                                      Pasangan
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {filteredOfficers.length > pclPageSize && (
                  <div className="px-5 py-3.5 bg-slate-50/60 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <div>
                      Menampilkan{" "}
                      <b className="text-slate-800 dark:text-slate-200">
                        {(pclPage - 1) * pclPageSize + 1}–
                        {Math.min(pclPage * pclPageSize, filteredOfficers.length)}
                      </b>{" "}
                      dari{" "}
                      <b className="text-slate-800 dark:text-slate-200">
                        {filteredOfficers.length}
                      </b>{" "}
                      petugas
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={pclPage <= 1}
                        onClick={() => setPclPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      {buildPageNumbers(pclPage, totalPclPages).map((p, idx) =>
                        p === "..." ? (
                          <span key={`ellipsis-${idx}`} className="px-2 text-slate-400">
                            ...
                          </span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setPclPage(p)}
                            className={`min-w-[30px] h-7 rounded-lg text-xs font-semibold transition cursor-pointer ${
                              pclPage === p
                                ? "bg-blue-600 text-white"
                                : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                            }`}
                          >
                            {p}
                          </button>
                        )
                      )}
                      <button
                        disabled={pclPage >= totalPclPages}
                        onClick={() => setPclPage((p) => Math.min(totalPclPages, p + 1))}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Skenario & Sebaran Kecamatan Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xs">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Matriks Temuan Berdasarkan Skenario Pemeriksaan
                    </h2>
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                      Klik baris untuk filter
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Klasifikasi pasangan temuan menurut relasi petugas, periode subround, dan sampel.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider">
                          <th className="py-2.5 px-3">Kode</th>
                          <th className="py-2.5 px-3">Skenario Pemeriksaan</th>
                          <th className="py-2.5 px-2.5 text-center">SHA-256</th>
                          <th className="py-2.5 px-2.5 text-center">Kompresi</th>
                          <th className="py-2.5 px-2.5 text-center">Objek/ORB</th>
                          <th className="py-2.5 px-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {scenarioSummary.map((s) => (
                          <tr
                            key={s.code}
                            onClick={() => {
                              setPScen(s.code);
                              setActiveTab("pairs");
                            }}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition group"
                          >
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 group-hover:bg-indigo-600 group-hover:text-white transition">
                                {s.code}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200">
                              {s.desc}
                            </td>
                            <td className="py-3 px-2.5 text-center text-slate-600 dark:text-slate-400">
                              {s.kat1}
                            </td>
                            <td className="py-3 px-2.5 text-center text-slate-600 dark:text-slate-400">
                              {s.kat2}
                            </td>
                            <td className="py-3 px-2.5 text-center text-slate-600 dark:text-slate-400">
                              {s.kat3}
                            </td>
                            <td className="py-3 px-3 text-right font-extrabold text-blue-600 dark:text-blue-400">
                              {s.total}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xs">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      Sebaran Kecamatan ({topKecamatans.length} Wilayah)
                    </h2>
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                      Klik untuk filter
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Seluruh kecamatan yang memiliki keterlibatan foto duplikat (diurutkan dari tertinggi).
                  </p>
                  <div className="overflow-x-auto max-h-[340px] overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800/80">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
                        <tr className="border-b border-slate-200/80 dark:border-slate-700 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider">
                          <th className="py-2.5 px-3 w-8 text-center">#</th>
                          <th className="py-2.5 px-3">Kecamatan</th>
                          <th className="py-2.5 px-3 text-center">Grup</th>
                          <th className="py-2.5 px-3 text-center">Foto</th>
                          <th className="py-2.5 px-3 text-center">Petugas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {topKecamatans.map((k, idx) => {
                          const maxPhotos = topKecamatans[0]?.photos || 1;
                          const pct = Math.round((k.photos / maxPhotos) * 100);
                          return (
                            <tr
                              key={k.kec}
                              onClick={() => {
                                setCSearch(k.kec);
                                setActiveTab("clusters");
                              }}
                              className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                            >
                              <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-400">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-slate-800 dark:text-slate-200">
                                  {k.kec}
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
                                  <div
                                    className="bg-blue-500 h-full rounded-full"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-center font-medium text-slate-700 dark:text-slate-300">
                                {k.clusters}
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold text-blue-600 dark:text-blue-400">
                                {k.photos}
                              </td>
                              <td className="py-2.5 px-3 text-center text-slate-600 dark:text-slate-400">
                                {k.pcls.size}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: KELOMPOK FOTO SAMA (MULTI-FOTO CLUSTERS + PAGINATION) */}
          {activeTab === "clusters" && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Skenario
                  </label>
                  <select
                    value={cScen}
                    onChange={(e) => setCScen(e.target.value)}
                    className="text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
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
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Subround
                  </label>
                  <select
                    value={cSr}
                    onChange={(e) => setCSr(e.target.value)}
                    className="text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Semua Subround</option>
                    <option value="SR1">SR1 (Jan–Apr)</option>
                    <option value="SR2">SR2 (Mei–Agu)</option>
                    <option value="SR3">SR3 (Sep–Des)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Jumlah Foto
                  </label>
                  <select
                    value={cSize}
                    onChange={(e) => setCSize(Number(e.target.value))}
                    className="text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value={0}>Semua (≥ 2 Foto)</option>
                    <option value={3}>Multi-Duplikat (≥ 3 Foto)</option>
                    <option value={5}>Duplikasi Masif (≥ 5 Foto)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Relasi Petugas
                  </label>
                  <select
                    value={cPcl}
                    onChange={(e) => setCPcl(Number(e.target.value))}
                    className="text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value={0}>Semua</option>
                    <option value={2}>Lintas Petugas (≥ 2 Petugas)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Jenis Foto
                  </label>
                  <select
                    value={cJenis}
                    onChange={(e) => setCJenis(e.target.value)}
                    className="text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Semua Jenis</option>
                    <option value="fotobidang">fotobidang (Sketsa)</option>
                    <option value="foto_petak">foto_petak</option>
                    <option value="fotoplot">fotoplot</option>
                    <option value="fotoberat">fotoberat (Timbangan)</option>
                  </select>
                </div>

                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Cari Petugas / Kecamatan / Desa / KK / ID
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={cSearch}
                      onChange={(e) => setCSearch(e.target.value)}
                      placeholder="Ketik nama petugas, kecamatan, KK..."
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl pl-8 pr-3 py-2 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <button
                  onClick={() => {
                    setCScen("");
                    setCSr("");
                    setCSize(0);
                    setCPcl(0);
                    setCJenis("");
                    setCSearch("");
                  }}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2 rounded-xl transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Menampilkan{" "}
                  <b className="text-slate-900 dark:text-white">
                    {filteredClusters.length === 0
                      ? 0
                      : (clusterPage - 1) * clusterPageSize + 1}
                    –
                    {Math.min(clusterPage * clusterPageSize, filteredClusters.length)}
                  </b>{" "}
                  dari{" "}
                  <b className="text-blue-600 dark:text-blue-400">
                    {filteredClusters.length}
                  </b>{" "}
                  kelompok foto sama
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>Per halaman:</span>
                    <select
                      value={clusterPageSize}
                      onChange={(e) => setClusterPageSize(Number(e.target.value))}
                      className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold"
                    >
                      <option value={10}>10 grup</option>
                      <option value={20}>20 grup</option>
                      <option value={50}>50 grup</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      disabled={clusterPage <= 1}
                      onClick={() => changeClusterPage(clusterPage - 1)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-semibold px-2 text-slate-700 dark:text-slate-300">
                      Hal {clusterPage} / {totalClusterPages}
                    </span>
                    <button
                      disabled={clusterPage >= totalClusterPages}
                      onClick={() => changeClusterPage(clusterPage + 1)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {paginatedClusters.map((c) => (
                  <div
                    key={c.cluster_id}
                    className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs"
                  >
                    <div className="bg-slate-50/80 dark:bg-slate-800/60 px-4 py-3 border-b border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-100 px-2 py-0.5 rounded-md">
                          {c.cluster_id}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            c.jumlah_petugas > 1
                              ? "bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                              : "bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                          }`}
                        >
                          {c.jumlah_foto} Foto Sama
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                          {c.primary_tag}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                          Subround: {c.daftar_subround}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                          Jenis: {c.daftar_jenis_foto}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        Kecamatan: <b>{c.daftar_kecamatan}</b> · Petugas ({c.jumlah_petugas}):{" "}
                        <b>{c.daftar_petugas}</b>
                      </div>
                    </div>

                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                      {(c.members || []).map((m: any, idx: number) => {
                        const fasihUrl = getFasihAssignmentUrl(m.subround, m.assignmentId);
                        return (
                          <div
                            key={idx}
                            className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900/80 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition"
                          >
                            <div>
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
                                <span className="absolute top-2 left-2 z-10 bg-slate-900/80 text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
                                  #{idx + 1}
                                </span>
                                <span className="absolute top-2 right-2 z-10 bg-blue-600/90 text-white text-[11px] font-semibold px-2 py-0.5 rounded-md">
                                  {m.subround} · {m.jenis_foto}
                                </span>
                                <img
                                  src={m.image_url}
                                  alt={m.jenis_foto}
                                  loading="lazy"
                                  className="w-full h-full object-contain group-hover:scale-105 transition duration-200"
                                />
                              </div>
                              <div className="p-3 text-xs space-y-1">
                                <div className="font-bold text-slate-900 dark:text-white truncate">
                                  👮 {m.pcl || "-"}
                                </div>
                                <div className="text-slate-600 dark:text-slate-300 font-medium truncate">
                                  📍 {m.kecamatan} - {m.desa}
                                </div>
                                <div className="text-slate-700 dark:text-slate-300 truncate">
                                  👤 <b>{m.namakk || "-"}</b>{" "}
                                  <span className="text-slate-400">(NKS: {m.nks || "-"})</span>
                                </div>
                                <div className="text-slate-800 dark:text-slate-200">
                                  ⚖️ Berat: <b>{m.beratbersih ?? "-"} kg</b> · Rumpun:{" "}
                                  {m.jmlhrumpun ?? "-"}
                                </div>
                              </div>
                            </div>

                            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                              <div
                                title={m.assignmentId}
                                className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate"
                              >
                                ID: {m.assignmentId}
                              </div>
                              {m.assignmentId && (
                                <a
                                  href={fasihUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white transition shrink-0"
                                >
                                  Buka FASIH
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {totalClusterPages > 1 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl px-5 py-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Halaman <b className="text-slate-800 dark:text-slate-200">{clusterPage}</b> dari{" "}
                    <b className="text-slate-800 dark:text-slate-200">{totalClusterPages}</b> (
                    {filteredClusters.length} grup)
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={clusterPage <= 1}
                      onClick={() => changeClusterPage(clusterPage - 1)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Sebelumnya
                    </button>
                    {buildPageNumbers(clusterPage, totalClusterPages).map((p, idx) =>
                      p === "..." ? (
                        <span key={`c-ell-${idx}`} className="px-2 text-slate-400 text-xs">
                          ...
                        </span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => changeClusterPage(p)}
                          className={`min-w-[32px] h-8 rounded-xl text-xs font-semibold transition cursor-pointer ${
                            clusterPage === p
                              ? "bg-blue-600 text-white shadow-2xs"
                              : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                    <button
                      disabled={clusterPage >= totalClusterPages}
                      onClick={() => changeClusterPage(clusterPage + 1)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      Berikutnya
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PERBANDINGAN PASANGAN (2 FOTO + PAGINATION) */}
          {activeTab === "pairs" && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Skenario
                  </label>
                  <select
                    value={pScen}
                    onChange={(e) => setPScen(e.target.value)}
                    className="text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
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
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Subround
                  </label>
                  <select
                    value={pSr}
                    onChange={(e) => setPSr(e.target.value)}
                    className="text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Semua Subround</option>
                    <option value="SR1">SR1 (Jan–Apr)</option>
                    <option value="SR2">SR2 (Mei–Agu)</option>
                    <option value="SR3">SR3 (Sep–Des)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Tingkat Deteksi
                  </label>
                  <select
                    value={pKat}
                    onChange={(e) => setPKat(e.target.value)}
                    className="text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Semua Tingkat</option>
                    <option value="1.">1. Identik 100% (SHA-256)</option>
                    <option value="2.">2. Foto Sama (Beda Kompresi)</option>
                    <option value="3.">3. Objek Sama (Crop / Geser / Edit Watermark)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Jenis Foto
                  </label>
                  <select
                    value={pJenis}
                    onChange={(e) => setPJenis(e.target.value)}
                    className="text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Semua Jenis</option>
                    <option value="fotobidang">fotobidang</option>
                    <option value="foto_petak">foto_petak</option>
                    <option value="fotoplot">fotoplot</option>
                    <option value="fotoberat">fotoberat</option>
                  </select>
                </div>

                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Cari Petugas / Kecamatan / Desa / KK / ID
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={pSearch}
                      onChange={(e) => setPSearch(e.target.value)}
                      placeholder="Ketik nama petugas, kecamatan, KK..."
                      className="w-full text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl pl-8 pr-3 py-2 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <button
                  onClick={() => {
                    setPScen("");
                    setPSr("");
                    setPKat("");
                    setPJenis("");
                    setPSearch("");
                  }}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2 rounded-xl transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Menampilkan{" "}
                  <b className="text-slate-900 dark:text-white">
                    {filteredPairs.length === 0 ? 0 : (pairPage - 1) * pairPageSize + 1}–
                    {Math.min(pairPage * pairPageSize, filteredPairs.length)}
                  </b>{" "}
                  dari{" "}
                  <b className="text-blue-600 dark:text-blue-400">
                    {filteredPairs.length}
                  </b>{" "}
                  pasangan temuan
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>Per halaman:</span>
                    <select
                      value={pairPageSize}
                      onChange={(e) => setPairPageSize(Number(e.target.value))}
                      className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold"
                    >
                      <option value={10}>10 pasang</option>
                      <option value={20}>20 pasang</option>
                      <option value={50}>50 pasang</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      disabled={pairPage <= 1}
                      onClick={() => changePairPage(pairPage - 1)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-semibold px-2 text-slate-700 dark:text-slate-300">
                      Hal {pairPage} / {totalPairPages}
                    </span>
                    <button
                      disabled={pairPage >= totalPairPages}
                      onClick={() => changePairPage(pairPage + 1)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {paginatedPairs.map((f, idx) => (
                  <div
                    key={`${f.assign_1}-${f.assign_2}-${idx}`}
                    className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs"
                  >
                    <div className="bg-slate-50/80 dark:bg-slate-800/60 px-4 py-2.5 border-b border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300">
                          {f.skenario_kode}: {f.skenario_deskripsi}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            String(f.kategori_temuan).startsWith("1.")
                              ? "bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300"
                              : String(f.kategori_temuan).startsWith("2.")
                              ? "bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300"
                              : "bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300"
                          }`}
                        >
                          {f.kategori_temuan}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">
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
                        const fasihUrl = getFasihAssignmentUrl(sr, aid);

                        return (
                          <div
                            key={num}
                            className="flex flex-col sm:flex-row gap-3.5 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 bg-slate-50/40 dark:bg-slate-800/30"
                          >
                            <div
                              onClick={() =>
                                setLightbox({
                                  open: true,
                                  src: imgUrl,
                                  caption: `[${sr} - ${jenis}] ${pcl} | ${kec} - ${desa} | KK: ${kk}`,
                                })
                              }
                              className="relative sm:w-44 h-48 bg-slate-900 rounded-lg overflow-hidden shrink-0 cursor-zoom-in group"
                            >
                              <span className="absolute top-2 right-2 z-10 bg-blue-600/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded-md">
                                {sr} · {jenis}
                              </span>
                              <img
                                src={imgUrl}
                                alt={jenis}
                                loading="lazy"
                                className="w-full h-full object-contain group-hover:scale-105 transition duration-200"
                              />
                            </div>
                            <div className="text-xs flex flex-col justify-between flex-1 min-w-0">
                              <div className="space-y-1.5">
                                <div className="font-bold text-slate-900 dark:text-white text-sm">
                                  👮 {pcl || "-"}
                                </div>
                                <div className="text-slate-700 dark:text-slate-300 font-medium">
                                  📍 {kec} - {desa}
                                </div>
                                <div className="text-slate-700 dark:text-slate-300">
                                  👤 Sampel/KK: <b>{kk || "-"}</b> (NKS: {nks || "-"})
                                </div>
                                <div className="text-slate-800 dark:text-slate-200">
                                  ⚖️ Berat Bersih: <b>{berat ?? "-"} kg</b> · Rumpun:{" "}
                                  {rumpun ?? "-"}
                                </div>
                                <div className="text-slate-400 text-[11px] font-mono break-all">
                                  Resolusi: {res} · ID: {aid}
                                </div>
                              </div>

                              {aid && (
                                <div className="pt-2 mt-2 border-t border-slate-200/70 dark:border-slate-700/70 flex items-center justify-end">
                                  <a
                                    href={fasihUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white transition"
                                  >
                                    Buka di FASIH-SM
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {totalPairPages > 1 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl px-5 py-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Halaman <b className="text-slate-800 dark:text-slate-200">{pairPage}</b> dari{" "}
                    <b className="text-slate-800 dark:text-slate-200">{totalPairPages}</b> (
                    {filteredPairs.length} pasangan)
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={pairPage <= 1}
                      onClick={() => changePairPage(pairPage - 1)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Sebelumnya
                    </button>
                    {buildPageNumbers(pairPage, totalPairPages).map((p, idx) =>
                      p === "..." ? (
                        <span key={`p-ell-${idx}`} className="px-2 text-slate-400 text-xs">
                          ...
                        </span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => changePairPage(p)}
                          className={`min-w-[32px] h-8 rounded-xl text-xs font-semibold transition cursor-pointer ${
                            pairPage === p
                              ? "bg-blue-600 text-white shadow-2xs"
                              : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                    <button
                      disabled={pairPage >= totalPairPages}
                      onClick={() => changePairPage(pairPage + 1)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      Berikutnya
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: TARIK DATA FASIH & MANAJEMEN AKUN (KHUSUS ADMIN) */}
          {activeTab === "scraper" && currentUser.role === "admin" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Kolom Kiri: Generator Script Console */}
                <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xs">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Langkah 1: Salin Kode Penarik Data FASIH-SM (Ramah Server)
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Karena FASIH-SM dilindungi SSO BPS & Cloudflare/F5 WAF, penarikan daftar assignment dan Presigned URL paling aman dijalankan langsung dari Console tab tempat kamu sudah login FASIH-SM.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                        className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                      >
                        {SUBROUND_OPTIONS.map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Survey Period ID (Bisa disesuaikan)
                      </label>
                      <input
                        type="text"
                        value={customPeriodId}
                        onChange={(e) => setCustomPeriodId(e.target.value)}
                        className="w-full text-xs font-mono border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2.5"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      onClick={handleCopyScript}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition cursor-pointer"
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
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3.5 py-2.5 rounded-xl transition"
                    >
                      Buka FASIH-SM
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <div className="relative">
                    <pre className="bg-slate-900 text-slate-100 text-[11px] font-mono p-4 rounded-xl overflow-x-auto max-h-72 leading-relaxed border border-slate-800">
                      {consoleScript}
                    </pre>
                  </div>
                </div>

                {/* Kolom Kanan: Upload JSON & Trigger Analisis */}
                <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-4 shadow-2xs">
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        Langkah 2: Unggah File JSON Hasil Scrape
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Setelah script di Console selesai berjalan, browser akan mengunduh file{" "}
                        <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          rekap_foto_ubinan_...json
                        </code>
                        . Unggah file tersebut di sini untuk disimpan ke Supabase & memicu analisis otomatis via GitHub Actions.
                      </p>
                    </div>

                    <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition bg-slate-50/50 dark:bg-slate-800/30">
                      <UploadCloud className="w-10 h-10 text-blue-600 dark:text-blue-400 mb-2" />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
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
                        className={`p-3.5 rounded-xl text-xs font-medium ${
                          uploadStatus.type === "success"
                            ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                            : uploadStatus.type === "error"
                            ? "bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                            : "bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                        }`}
                      >
                        {uploadStatus.msg}
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                    <div className="font-bold text-slate-800 dark:text-white">
                      💡 Cara Kerja Update Inkremental Otomatis:
                    </div>
                    <p>
                      1. File JSON hasil scrape dikirim ke tabel{" "}
                      <code>raw_scrape_uploads</code> di Supabase.
                    </p>
                    <p>
                      2. GitHub Actions otomatis bangun, memeriksa <code>photo_catalog</code>, dan <b>hanya mengunduh foto baru</b> yang belum pernah diproses sebelumnya.
                    </p>
                  </div>
                </div>
              </div>

              {/* MANAJEMEN AKUN PENGGUNA (TABEL app_users) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      Manajemen Akun & Hak Akses Pengguna (Tabel <code>app_users</code>)
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Tambah akun pemeriksa baru, ubah password, atau atur role (<b>user</b>: hanya lihat hasil pemeriksaan; <b>admin</b>: akses penuh termasuk Tarik Data FASIH).
                    </p>
                  </div>
                </div>

                {userMsg.type !== "idle" && (
                  <div
                    className={`p-3 rounded-xl text-xs font-medium ${
                      userMsg.type === "ok"
                        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                        : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                    }`}
                  >
                    {userMsg.text}
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Form Tambah / Update User */}
                  <form
                    onSubmit={handleSaveUser}
                    className="lg:col-span-5 bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 rounded-xl p-4 space-y-3"
                  >
                    <div className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5 text-blue-600" />
                      Tambah / Perbarui Password Akun
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Username
                        </label>
                        <input
                          type="text"
                          required
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          placeholder="mis. pemeriksa2"
                          className="w-full text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Role Akses
                        </label>
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value as "user" | "admin")}
                          className="w-full text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2"
                        >
                          <option value="user">User Biasa (Pemeriksa)</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Nama Lengkap / Jabatan
                      </label>
                      <input
                        type="text"
                        required
                        value={newFullName}
                        onChange={(e) => setNewFullName(e.target.value)}
                        placeholder="mis. Tim Pemeriksa KSA Garut"
                        className="w-full text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Password Baru
                      </label>
                      <input
                        type="text"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Ketik password..."
                        className="w-full text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg transition cursor-pointer"
                    >
                      Simpan Akun ke Supabase
                    </button>
                  </form>

                  {/* Tabel Daftar User */}
                  <div className="lg:col-span-7 overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase text-[10px]">
                          <th className="py-2.5 px-3">Username</th>
                          <th className="py-2.5 px-3">Nama Lengkap</th>
                          <th className="py-2.5 px-3 text-center">Role</th>
                          <th className="py-2.5 px-3 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {userList.map((u) => (
                          <tr key={u.username}>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                              {u.username}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                              {u.full_name}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  u.role === "admin"
                                    ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                                }`}
                              >
                                {u.role}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {u.username !== currentUser.username && (
                                <button
                                  onClick={() => handleDeleteUser(u.username)}
                                  className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 text-[11px] font-semibold cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Hapus
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
              className="absolute top-5 right-6 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
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
    </div>
  );
}
