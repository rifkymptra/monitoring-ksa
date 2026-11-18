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

export function generateFasihConsoleScript(
  surveyPeriodId: string,
  subroundLabel: string,
  knownFileNames: string[] = []
): string {
  const knownJson = JSON.stringify(knownFileNames);
  return `/**
 * ============================================================================
 * SCRIPT SCRAPING FOTO UBINAN FASIH-SM (INKREMENTAL + RELAY ANTI-BLOKIR GEO-IP)
 * Target: ${subroundLabel} (${surveyPeriodId})
 * Foto lama di katalog (${knownFileNames.length} file) otomatis di-skip!
 * ============================================================================
 */
(async () => {
  const SURVEY_PERIOD_ID = "${surveyPeriodId}";
  const PHOTO_KEYS = ["fotobidang", "foto_petak", "fotoplot", "fotoberat"];
  const KNOWN_FILES = new Set(${knownJson});
  const MIN_DELAY_MS = 750;
  const MAX_DELAY_MS = 1400;
  const COOLDOWN_EVERY = 35;
  const COOLDOWN_MS = 3500;

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

  // Fungsi Hitung SHA-256 Asli (100% identik dengan hashlib.sha256 Python)
  const computeSha256Hex = async (arrayBuffer) => {
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  // Fungsi Kompresi Gambar ke WebP (~40KB) untuk Relay ke Supabase Storage
  const compressToWebpBase64 = async (blob) => {
    const bitmap = await createImageBitmap(blob);
    const origWidth = bitmap.width;
    const origHeight = bitmap.height;
    const maxDim = 1000;
    let targetW = origWidth;
    let targetH = origHeight;
    if (origWidth > maxDim || origHeight > maxDim) {
      if (origWidth >= origHeight) {
        targetW = maxDim;
        targetH = Math.round((origHeight * maxDim) / origWidth);
      } else {
        targetH = maxDim;
        targetW = Math.round((origWidth * maxDim) / origHeight);
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    const webpDataUrl = canvas.toDataURL("image/webp", 0.82);
    bitmap.close();
    return { origWidth, origHeight, webpDataUrl };
  };

  window.__CACHE_UBINAN__ = window.__CACHE_UBINAN__ || {};
  window.__STOP_SCRAPE__ = false;
  console.log(
    "%c🚀 Memulai Penarikan Data & Foto Ubinan (${subroundLabel}) — Mode Inkremental Pintar...",
    "color: #2563eb; font-weight: bold; font-size: 14px;"
  );
  console.log(\`ℹ️ Katalog Supabase saat ini sudah menyimpan \${KNOWN_FILES.size} foto di ${subroundLabel} (tidak akan di-download ulang).\`);

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
    console.log(\`   -> Mengambil daftar assignment: \${allAssignments.length} / \${totalRecords}\`);
    if (rows.length < pageSize || (typeof totalRecords === "number" && allAssignments.length >= totalRecords)) break;
    start += pageSize;
    await sleep(800);
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
          const fn = ans[0].filename;
          photos[key] = { fileName: fn, presignedUrl: null };
          // Hanya minta presignedUrl untuk foto BARU yang belum ada di katalog
          if (!KNOWN_FILES.has(fn)) {
            fileNamesToSign.push(fn);
          }
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

      if (fileNamesToSign.length > 0) {
        batchPresignPayload.push({ assignmentId, fileNames: fileNamesToSign });
      }
      if ((i + 1) % 10 === 0 || i === listToProcess.length - 1) {
        console.log(\`   -> Progress Metadata: \${i + 1}/\${listToProcess.length}\`);
      }
    } catch (err) { await sleep(2000); }
  }

  // Ambil Presigned URL hanya untuk foto baru
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
    await sleep(800);
  }

  // Hitung berapa foto baru vs foto lama
  const newPhotoItems = [];
  let skippedOldCount = 0;
  for (const item of assignmentDetails) {
    for (const key of PHOTO_KEYS) {
      const pObj = item.photos[key];
      if (!pObj) continue;
      if (KNOWN_FILES.has(pObj.fileName)) {
        skippedOldCount++;
      } else if (urlMap[pObj.fileName]) {
        pObj.presignedUrl = urlMap[pObj.fileName];
        newPhotoItems.push(pObj);
      }
    }
  }

  console.log(
    \`%c📸 Ringkasan Foto: \${skippedOldCount} foto lama di-skip | \${newPhotoItems.length} foto BARU akan di-download & di-hash di browser...\`,
    "color: #059669; font-weight: bold;"
  );

  // Download HANYA foto baru di browser (IP Indonesia -> Bebas blokir Geo-IP BPS!)
  for (let i = 0; i < newPhotoItems.length; i++) {
    if (window.__STOP_SCRAPE__) break;
    const pObj = newPhotoItems[i];
    try {
      const imgResp = await fetch(pObj.presignedUrl);
      if (!imgResp.ok) throw new Error(\`HTTP \${imgResp.status}\`);
      const arrayBuf = await imgResp.arrayBuffer();

      // 1. Pengaman SHA-256 Asli dari file JPEG mentah FASIH
      pObj.origSha256 = await computeSha256Hex(arrayBuf);
      pObj.origSize = arrayBuf.byteLength;

      // 2. Kompres ke WebP (~40KB) untuk di-relay ke Supabase Storage
      const blob = new Blob([arrayBuf], { type: "image/jpeg" });
      const { origWidth, origHeight, webpDataUrl } = await compressToWebpBase64(blob);
      pObj.origWidth = origWidth;
      pObj.origHeight = origHeight;
      pObj.webpBase64 = webpDataUrl;

      if ((i + 1) % 5 === 0 || i === newPhotoItems.length - 1) {
        console.log(\`   -> Download & Hash Foto Baru: \${i + 1} / \${newPhotoItems.length}\`);
      }
      await sleep(350);
    } catch (e) {
      console.warn(\`   ⚠️ Gagal mengambil foto baru \${pObj.fileName}:\`, e);
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
  console.log("%c💾 Selesai! File JSON (beserta paket foto baru terkompresi) berhasil diunduh. Silakan unggah di tab 'Tarik Data FASIH' pada Web Monitoring!", "color: #2563eb; font-weight: bold;");
})();`;
}
