export const PCL_CANONICAL_MAP: Record<string, string> = {
  // TAROGONG KALER
  "RIFQIE NOOR": "RIFQIE NOOR IQBALULLOH",
  "RIFQIE NOOR I": "RIFQIE NOOR IQBALULLOH",
  "RIFQIE NOOR I.": "RIFQIE NOOR IQBALULLOH",
  "RIFQIE NOOR IQBQLULLOH": "RIFQIE NOOR IQBALULLOH",
  "RIFQIE NOOR IQBALULLOH": "RIFQIE NOOR IQBALULLOH",
  // BANYURESMI
  "FITRIA FEBIAN": "FITRIA FEBRIAN AGUSTI",
  "FITRIA FEBRIAN": "FITRIA FEBRIAN AGUSTI",
  "FITRIA FREBIAN": "FITRIA FEBRIAN AGUSTI",
  "FITRIA FREBRIAN": "FITRIA FEBRIAN AGUSTI",
  "FITRIA FEBRIAN AGUSTI": "FITRIA FEBRIAN AGUSTI",
  "MASHAADI PUDJIANTO": "MASHADI PUDJIANTO",
  "MASHAI PUDJIANTO": "MASHADI PUDJIANTO",
  "MASHADI PUDJIANTO": "MASHADI PUDJIANTO",
  // SINGAJAYA
  "DUDUNG WAHYIDIN": "DUDUNG WAHYUDIN",
  "DUDUNG WAYUDIN": "DUDUNG WAHYUDIN",
  "DUDUNG WAHYUDIN": "DUDUNG WAHYUDIN",
  // WANARAJA
  "AGNAN": "AGNAN AHMAD KURNIAWAN",
  "AGNAN AHMAD": "AGNAN AHMAD KURNIAWAN",
  "AGNAN AHMAD K": "AGNAN AHMAD KURNIAWAN",
  "AGNAN AHMAD KURNIAWAN": "AGNAN AHMAD KURNIAWAN",
  // TAROGONG KIDUL
  "AJRUL MUMININ": "AJRUL MU'MININ",
  "AJRUL MU'MININ": "AJRUL MU'MININ",
  // KARANGTENGAH
  "DADI HARYADI": "DADI HERYADI",
  "DADI HERYADI": "DADI HERYADI",
  // CIBATU
  "INTAN RACHMANIA S": "INTAN RACHMANIA SUPRIATIN",
  "INTAN RACHMANIA SUPRIATIN": "INTAN RACHMANIA SUPRIATIN",
  // PANGATIKAN
  "YUSAN YUSABTI": "YUSAN YUSANTI",
  "YUSAN YUSANTI": "YUSAN YUSANTI",
  // MEKARMUKTI
  "DEDING JOHAN BASARAH, SP": "DEDING JOHAN BASARAH",
  "DEDNG JOHAN BASARAH": "DEDING JOHAN BASARAH",
  "DEDING JOHAN BASARAH": "DEDING JOHAN BASARAH",
  // CIHURIP
  "INDRA BJ": "INDRA BUDI JAYA",
  "INDRA BUDI JAYA": "INDRA BUDI JAYA",
  // CISURUPAN
  "CUCUSURAHMAN": "CUCU SURAHMAN",
  "CUCU SURAHMAN": "CUCU SURAHMAN",
  // TALEGONG
  "ALDI": "ALDI FIRMAN",
  "ALDI FIRMAN": "ALDI FIRMAN",
};

export function normalizePclName(rawPcl?: string | null): string {
  const name = String(rawPcl || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  if (!name) return "";
  if (PCL_CANONICAL_MAP[name]) return PCL_CANONICAL_MAP[name];
  const cleaned = name.replace(/,\s*[A-Z.\s]+$/, "").replace(/\.+$/, "");
  if (PCL_CANONICAL_MAP[cleaned]) return PCL_CANONICAL_MAP[cleaned];
  return cleaned;
}

export function classifyPairScenario(p: any): {
  code: string;
  desc: string;
} {
  const sameAssign = p.assign_1 === p.assign_2 && p.sr_1 === p.sr_2;
  const sameType = p.jenis_1 === p.jenis_2;
  const samePcl = p.pcl_1 === p.pcl_2 && Boolean(p.pcl_1);
  const sameSr = p.sr_1 === p.sr_2;

  if (sameAssign) {
    return { code: "Skenario 5A", desc: "Lintas Jenis Foto (Assignment Sama)" };
  }
  if (!sameType) {
    return { code: "Skenario 5B", desc: "Lintas Jenis Foto (Beda Assignment)" };
  }
  if (!samePcl && sameSr) {
    return { code: "Skenario 1", desc: "Antar Petugas | Subround Sama" };
  }
  if (samePcl && !sameSr) {
    return { code: "Skenario 2", desc: "Petugas Sama | Lintas Subround" };
  }
  if (!samePcl && !sameSr) {
    return { code: "Skenario 3", desc: "Antar Petugas | Lintas Subround" };
  }
  return {
    code: "Skenario 4",
    desc: "Petugas Sama | Subround Sama (Beda Sampel)",
  };
}

export function normalizeClustersAndPairs(
  rawClusters: any[],
  rawPairs: any[]
): { clusters: any[]; pairs: any[]; crossPclClustersCount: number } {
  const pairs = (rawPairs || []).map((p) => {
    const pcl_1 = normalizePclName(p.pcl_1);
    const pcl_2 = normalizePclName(p.pcl_2);
    const nextP = { ...p, pcl_1, pcl_2 };
    const { code, desc } = classifyPairScenario(nextP);
    nextP.skenario_kode = code;
    nextP.skenario_deskripsi = desc;
    return nextP;
  });

  const clusters = (rawClusters || []).map((c) => {
    const members = Array.isArray(c.members)
      ? c.members.map((m: any) => ({
          ...m,
          pcl: normalizePclName(m.pcl),
        }))
      : [];

    const pcls = Array.from(
      new Set(members.map((m: any) => m.pcl).filter(Boolean))
    ).sort();
    const srs = Array.from(
      new Set(members.map((m: any) => m.subround).filter(Boolean))
    ).sort();
    const assigns = new Set(
      members.map((m: any) => `${m.subround || ""}:${m.assignmentId || ""}`)
    );

    let primary_tag = c.primary_tag || "";
    if (pcls.length > 1 && srs.length > 1) {
      primary_tag = "Lintas Petugas & Lintas Subround";
    } else if (pcls.length > 1) {
      primary_tag = "Lintas Petugas (Subround Sama)";
    } else if (srs.length > 1) {
      primary_tag = "Petugas Sama (Lintas Subround)";
    } else if (assigns.size > 1) {
      primary_tag = "Petugas Sama (Antar Sampel Berbeda)";
    } else {
      primary_tag = "Internal 1 Sampel (Lintas Jenis Foto)";
    }

    // Perbarui skenario_terlibat jika tadinya Skenario 1/3 tapi sekarang petugasnya cuma 1
    let skenario_terlibat = String(c.skenario_terlibat || "");
    if (pcls.length === 1) {
      skenario_terlibat = skenario_terlibat
        .replace(/Skenario 1/g, "Skenario 4")
        .replace(/Skenario 3/g, "Skenario 2");
    }

    return {
      ...c,
      jumlah_petugas: pcls.length,
      daftar_petugas: pcls.join(", "),
      primary_tag,
      skenario_terlibat,
      members,
    };
  });

  const crossPclClustersCount = clusters.filter(
    (c) => Number(c.jumlah_petugas || 0) >= 2
  ).length;

  return { clusters, pairs, crossPclClustersCount };
}
