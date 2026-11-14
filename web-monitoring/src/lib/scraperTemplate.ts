export const SUBROUND_OPTIONS = [
  {
    code: "SR3",
    label: "Subround 3 (September - Desember)",
    surveyPeriodId: "6f581089-c787-4c0f-a307-0564f1e4e293",
  },
  {
    code: "SR2",
    label: "Subround 2 (Mei - Agustus)",
    surveyPeriodId: "d182137c-c614-48ca-be9b-1df41f906c0e",
  },
  {
    code: "SR1",
    label: "Subround 1 (Januari - April)",
    surveyPeriodId: "d74be6a7-567c-498b-ae2a-4ac7a163c7c5",
  },
];

export function generateFasihConsoleScript(surveyPeriodId: string, subroundLabel: string): string {
  return `/**
 * ============================================================================
 * SCRIPT SCRAPING FOTO UBINAN FASIH-SM (RAMAH SERVER & ULTRA-SAFE)
 * Target: ${subroundLabel} (${surveyPeriodId})
 * ============================================================================
 */
(async () => {
  const SURVEY_PERIOD_ID = "${surveyPeriodId}";
  const PHOTO_KEYS = ["fotobidang", "foto_petak", "fotoplot", "fotoberat"];
  const MIN_DELAY_MS = 800;
  const MAX_DELAY_MS = 1500;
  const COOLDOWN_EVERY = 35;
  const COOLDOWN_MS = 4000;

  const getHeaders = () => {
    const xsrf = document.cookie.split("; ").find((r) => r.startsWith("XSRF-TOKEN="))?.split("=")[1];
    return {
      Accept: "*/*",
      "Content-Type": "application/json",
      ...(xsrf ? { "X-XSRF-TOKEN": decodeURIComponent(xsrf) } : {}),
    };
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const randomSleep = () => sleep(Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS);

  window.__CACHE_UBINAN__ = window.__CACHE_UBINAN__ || {};
  window.__STOP_SCRAPE__ = false;
  console.log("%c🚀 Memulai Penarikan Data & Foto Ubinan (${subroundLabel})...", "color: #2563eb; font-weight: bold; font-size: 14px;");

  let dirHandle = null;
  if ("showDirectoryPicker" in window) {
    try {
      const pick = confirm(
        "Pilih folder di komputer untuk menyimpan foto secara langsung?\\n\\n" +
        "- Klik OK untuk memilih folder tujuan\\n" +
        "- Klik Cancel jika hanya ingin mengunduh file JSON untuk di-upload ke Web Monitoring"
      );
      if (pick) dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (e) {}
  }

  let allAssignments = [];
  let start = 0;
  const pageSize = 100;
  let totalRecords = null;

  while (true) {
    if (window.__STOP_SCRAPE__) return;
    const payload = {
      start,
      length: pageSize,
      columns: ["id","codeIdentity","data1","data2","data3","data4","data5","data6","data7","data8","data9","data10"].map(d => ({ data: d, orderable: true })),
      order: [],
      search: { value: "", regex: false },
      assignmentExtraParam: { surveyPeriodId: SURVEY_PERIOD_ID, assignmentErrorStatusType: -1, filterTargetType: "TARGET_ONLY" },
    };

    const res = await fetch("/app/api/analytic/api/v2/assignment/datatable-all-user-survey-periode", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }).then((r) => r.json());

    const rows = res?.searchData || res?.data?.data || [];
    if (totalRecords === null) totalRecords = res?.totalHit ?? "Unknown";
    if (!rows.length) break;

    allAssignments.push(...rows);
    console.log(\`   -> Mengambil daftar: \${allAssignments.length} / \${totalRecords}\`);
    if (rows.length < pageSize || (typeof totalRecords === "number" && allAssignments.length >= totalRecords)) break;
    start += pageSize;
    await sleep(900);
  }

  const targetAssignments = allAssignments.filter((r) => {
    const hasData9 = r.data9 !== null && r.data9 !== undefined && String(r.data9).trim() !== "";
    const isNotOpen = r.assignmentStatusAlias && r.assignmentStatusAlias !== "OPEN";
    return hasData9 || isNotOpen;
  });

  const listToProcess = targetAssignments.length > 0 ? targetAssignments : allAssignments;
  const assignmentDetails = [];
  const batchPresignPayload = [];
  let networkRequestCount = 0;

  for (let i = 0; i < listToProcess.length; i++) {
    if (window.__STOP_SCRAPE__) break;
    const row = listToProcess[i];
    const assignmentId = row.id || row._id;
    if (!assignmentId) continue;

    try {
      let detailRes = window.__CACHE_UBINAN__[assignmentId];
      if (!detailRes) {
        if (networkRequestCount > 0 && networkRequestCount % COOLDOWN_EVERY === 0) await sleep(COOLDOWN_MS);
        const resp = await fetch(\`/app/api/assignment-general/api/assignment/get-by-assignment-id?assignmentId=\${assignmentId}\`, { headers: getHeaders() });
        if (resp.status === 429 || resp.status === 503) { await sleep(15000); i--; continue; }
        detailRes = await resp.json();
        window.__CACHE_UBINAN__[assignmentId] = detailRes;
        networkRequestCount++;
        await randomSleep();
      }

      const rawDataStr = detailRes?.data?.data;
      let answers = typeof rawDataStr === "string" ? (JSON.parse(rawDataStr).answers || []) : (rawDataStr?.answers || []);
      const getAns = (key) => answers.find((a) => a.dataKey === key)?.answer;

      const photos = {};
      const fileNamesToSign = [];
      for (const key of PHOTO_KEYS) {
        const ans = getAns(key);
        if (Array.isArray(ans) && ans.length > 0 && ans[0]?.filename) {
          photos[key] = { fileName: ans[0].filename, presignedUrl: null };
          fileNamesToSign.push(ans[0].filename);
        }
      }

      assignmentDetails.push({
        assignmentId,
        kecamatan: getAns("kecamatan") || row?.region?.level1?.level2?.level3?.name || "",
        desa: getAns("desa") || "",
        nks: getAns("nks") || row.data6 || "",
        sls: getAns("sls") || row.data7 || "",
        subsls: getAns("subsls") || row.data8 || "",
        namakk: getAns("namakk") || row.data1 || "",
        bulan: row.data2 || getAns("bulanmaster") || "",
        komoditas: row.data3 || getAns("jenistan") || "",
        status_sampel: row.data5 || getAns("statussampel") || "",
        hasil_cacah: row.data9 || "",
        beratbersih: getAns("beratbersih") ?? "",
        jmlhrumpun: getAns("jmlhrumpun") ?? "",
        pcl: getAns("pcl_bps") || row.currentUserFullname || "",
        status_assignment: row.assignmentStatusAlias || "",
        photos,
      });

      if (fileNamesToSign.length > 0) batchPresignPayload.push({ assignmentId, fileNames: fileNamesToSign });
      if ((i + 1) % 5 === 0 || i === listToProcess.length - 1) {
        console.log(\`   -> Progress Detail: \${i + 1}/\${listToProcess.length}\`);
      }
    } catch (err) { await sleep(2000); }
  }

  const urlMap = {};
  for (let i = 0; i < batchPresignPayload.length; i += 20) {
    const chunk = batchPresignPayload.slice(i, i + 20);
    try {
      const presignRes = await fetch(\`/app/api/assignment-general/api/image/presigned-url-get?surveyPeriodId=\${SURVEY_PERIOD_ID}\`, {
        method: "POST", headers: getHeaders(), body: JSON.stringify(chunk),
      }).then((r) => r.json());
      for (const item of presignRes?.data || []) {
        for (const p of item.presignedUrls || []) urlMap[p.fileName] = p.presignedUrl;
      }
    } catch (err) {}
    await sleep(1000);
  }

  for (const item of assignmentDetails) {
    for (const key of PHOTO_KEYS) {
      if (item.photos[key]) item.photos[key].presignedUrl = urlMap[item.photos[key].fileName] || null;
    }
  }

  const blob = new Blob([JSON.stringify(assignmentDetails, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = \`rekap_foto_ubinan_\${SURVEY_PERIOD_ID}.json\`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log("💾 File JSON berhasil diunduh! Silakan upload file tersebut di tab 'Tarik Data FASIH' pada Web Monitoring.");
})();`;
}

