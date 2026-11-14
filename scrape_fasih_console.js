/**
 * ============================================================================
 * SCRIPT SCRAPING & DOWNLOAD FOTO UBINAN FASIH-SM (RAMAH SERVER & ULTRA-SAFE)
 * ============================================================================
 * Survey Period ID : 6f581089-c787-4c0f-a307-0564f1e4e293 -- Sesuaikan dengan subround yang ingin diambil fotonya
 * S3: 6f581089-c787-4c0f-a307-0564f1e4e293
 * S2: d182137c-c614-48ca-be9b-1df41f906c0e
 * S1: d74be6a7-567c-498b-ae2a-4ac7a163c7c5
 */

(async () => {
  const SURVEY_PERIOD_ID = "d74be6a7-567c-498b-ae2a-4ac7a163c7c5";
  const PHOTO_KEYS = ["fotobidang", "foto_petak", "fotoplot", "fotoberat"];

  // Konfigurasi Keamanan Server (Rate Limiting)
  const MIN_DELAY_MS = 800;   // Minimal jeda 0.8 detik antar request
  const MAX_DELAY_MS = 1500;  // Maksimal jeda 1.5 detik antar request (acak/manusiawi)
  const COOLDOWN_EVERY = 35;  // Istirahat sejenak setiap 35 request
  const COOLDOWN_MS = 4000;   // Durasi istirahat 4 detik

  const getHeaders = () => {
    const xsrf = document.cookie
      .split("; ")
      .find((r) => r.startsWith("XSRF-TOKEN="))
      ?.split("=")[1];
    return {
      Accept: "*/*",
      "Content-Type": "application/json",
      ...(xsrf ? { "X-XSRF-TOKEN": decodeURIComponent(xsrf) } : {}),
    };
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const randomSleep = () => {
    const ms = Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
    return sleep(ms);
  };

  window.__CACHE_UBINAN__ = window.__CACHE_UBINAN__ || {};
  window.__STOP_SCRAPE__ = false;
  console.log("%c🚀 Memulai Script Penarikan Foto Ubinan FASIH-SM...", "color: #00e676; font-weight: bold; font-size: 14px;");
  console.log("💡 Tips: Ketik `window.__STOP_SCRAPE__ = true` di console kapan saja jika ingin menghentikan script dengan aman.");

  let dirHandle = null;
  if ("showDirectoryPicker" in window) {
    try {
      const pick = confirm(
        "Pilih folder di komputer untuk menyimpan foto secara langsung?\n\n" +
        "- Klik OK untuk memilih folder tujuan\n" +
        "- Klik Cancel jika hanya ingin mendownload file JSON & CSV daftar link foto"
      );
      if (pick) {
        dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        console.log("📁 Folder penyimpanan dipilih:", dirHandle.name);
      }
    } catch (e) {
      console.warn("⚠️ Pemilihan folder dibatalkan, lanjut mengumpulkan link & metadata saja.");
    }
  }

  // ============================================================================
  // TAHAP 1: Ambil Daftar Assignment (searchData & totalHit)
  // ============================================================================
  console.log("📋 [Tahap 1/4] Mengambil daftar assignment...");
  let allAssignments = [];
  let start = 0;
  const pageSize = 100;
  let totalRecords = null;

  while (true) {
    if (window.__STOP_SCRAPE__) return console.warn("🛑 Dihentikan oleh pengguna.");

    const payload = {
      start: start,
      length: pageSize,
      columns: [
        { data: "id", orderable: true },
        { data: "codeIdentity", orderable: true },
        { data: "data1", orderable: true },
        { data: "data2", orderable: true },
        { data: "data3", orderable: true },
        { data: "data4", orderable: true },
        { data: "data5", orderable: true },
        { data: "data6", orderable: true },
        { data: "data7", orderable: true },
        { data: "data8", orderable: true },
        { data: "data9", orderable: true },
        { data: "data10", orderable: true },
      ],
      order: [],
      search: { value: "", regex: false },
      assignmentExtraParam: {
        surveyPeriodId: SURVEY_PERIOD_ID,
        assignmentErrorStatusType: -1,
        filterTargetType: "TARGET_ONLY",
      },
    };

    const res = await fetch(
      "/app/api/analytic/api/v2/assignment/datatable-all-user-survey-periode",
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      }
    ).then((r) => r.json());

    // Struktur FASIH v2 menggunakan res.searchData dan res.totalHit
    const rows = res?.searchData || res?.data?.data || res?.data?.content || [];

    if (totalRecords === null) {
      totalRecords = res?.totalHit ?? res?.data?.recordsTotal ?? "Unknown";
      console.log(`📊 Total Assignment di server: ${totalRecords}`);
      if (Array.isArray(res?.searchAggregation)) {
        console.log(
          "📊 Ringkasan Status di Server:",
          res.searchAggregation.map((a) => `${a.keyAggregation}: ${a.docCount}`).join(" | ")
        );
      }
    }

    if (!rows || rows.length === 0) break;

    allAssignments.push(...rows);
    console.log(`   -> Mengambil daftar: ${allAssignments.length} / ${totalRecords}`);

    if (rows.length < pageSize || (typeof totalRecords === "number" && allAssignments.length >= totalRecords)) {
      break;
    }
    start += pageSize;
    await sleep(900);
  }

  // Filter: Hanya ambil yang sudah ada isian (bukan OPEN kosong) atau data9 sudah terisi
  // Dari searchAggregation: 443 masih OPEN, hanya ~71 yang DRAFT / SUBMITTED / APPROVED!
  // Ini menghemat 85% request ke server!
  const targetAssignments = allAssignments.filter((r) => {
    const hasData9 = r.data9 !== null && r.data9 !== undefined && String(r.data9).trim() !== "";
    const isNotOpen = r.assignmentStatusAlias && r.assignmentStatusAlias !== "OPEN";
    return hasData9 || isNotOpen;
  });

  console.log(
    `✅ [Tahap 1 Selesai] Total di tabel: ${allAssignments.length} | Yang sudah diisi/ada progres: ${targetAssignments.length} assignment (Hemat ${allAssignments.length - targetAssignments.length} request kosong!).`
  );

  const listToProcess = targetAssignments.length > 0 ? targetAssignments : allAssignments;

  // ============================================================================
  // TAHAP 2: Ambil Detail Jawaban Tiap Assignment yang Terisi
  // ============================================================================
  console.log(
    `🔍 [Tahap 2/4] Mengambil detail ${listToProcess.length} assignment (Estimasi waktu ~${Math.ceil((listToProcess.length * 1.2) / 60)} menit)...`
  );
  const assignmentDetails = [];
  const batchPresignPayload = [];
  let networkRequestCount = 0;

  for (let i = 0; i < listToProcess.length; i++) {
    if (window.__STOP_SCRAPE__) {
      console.warn("🛑 Dihentikan oleh pengguna. Menyimpan data yang sudah terkumpul sejauh ini...");
      break;
    }

    const row = listToProcess[i];
    const assignmentId = row.id || row._id || row.assignmentId;
    if (!assignmentId) continue;

    try {
      let detailRes = window.__CACHE_UBINAN__[assignmentId];
      if (!detailRes) {
        if (networkRequestCount > 0 && networkRequestCount % COOLDOWN_EVERY === 0) {
          console.log(`⏸️ Istirahat ${COOLDOWN_MS / 1000} detik agar server tetap ringan...`);
          await sleep(COOLDOWN_MS);
        }

        const resp = await fetch(
          `/app/api/assignment-general/api/assignment/get-by-assignment-id?assignmentId=${assignmentId}`,
          { headers: getHeaders() }
        );

        if (resp.status === 429 || resp.status === 503) {
          console.warn(`⚠️ Server sibuk (HTTP ${resp.status}), menunggu 15 detik sebelum lanjut...`);
          await sleep(15000);
          i--;
          continue;
        }

        detailRes = await resp.json();
        window.__CACHE_UBINAN__[assignmentId] = detailRes;
        networkRequestCount++;
        await randomSleep();
      }

      const rawDataStr = detailRes?.data?.data;
      let answers = [];
      if (typeof rawDataStr === "string") {
        try {
          answers = JSON.parse(rawDataStr).answers || [];
        } catch (e) {}
      } else if (rawDataStr?.answers) {
        answers = rawDataStr.answers;
      }

      const getAns = (key) => answers.find((a) => a.dataKey === key)?.answer;

      const photos = {};
      const fileNamesToSign = [];

      for (const key of PHOTO_KEYS) {
        const ans = getAns(key);
        if (Array.isArray(ans) && ans.length > 0 && ans[0]?.filename) {
          const fn = ans[0].filename;
          photos[key] = { fileName: fn, presignedUrl: null };
          fileNamesToSign.push(fn);
        }
      }

      assignmentDetails.push({
        assignmentId,
        kecamatan:
          getAns("kecamatan") ||
          row?.region?.level1?.level2?.level3?.name ||
          detailRes?.data?.region?.level_1?.level_2?.level_3?.name ||
          "",
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
        status_assignment: row.assignmentStatusAlias || detailRes?.data?.assignment_status_alias || "",
        photos,
      });

      if (fileNamesToSign.length > 0) {
        batchPresignPayload.push({ assignmentId, fileNames: fileNamesToSign });
      }

      if ((i + 1) % 5 === 0 || i === listToProcess.length - 1) {
        console.log(
          `   -> Progress Detail: ${i + 1}/${listToProcess.length} selesai (${batchPresignPayload.length} assignment memiliki foto)`
        );
      }
    } catch (err) {
      console.warn(`⚠️ Gagal ambil detail ${assignmentId}:`, err);
      await sleep(2000);
    }
  }

  // ============================================================================
  // TAHAP 3: Request Presigned URL secara Batch
  // ============================================================================
  console.log("🔑 [Tahap 3/4] Meminta Presigned URL aktif (secara batch)...");
  const urlMap = {};
  const chunkSize = 20;

  for (let i = 0; i < batchPresignPayload.length; i += chunkSize) {
    const chunk = batchPresignPayload.slice(i, i + chunkSize);
    try {
      const presignRes = await fetch(
        `/app/api/assignment-general/api/image/presigned-url-get?surveyPeriodId=${SURVEY_PERIOD_ID}`,
        {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(chunk),
        }
      ).then((r) => r.json());

      if (Array.isArray(presignRes?.data)) {
        for (const item of presignRes.data) {
          for (const p of item.presignedUrls || []) {
            urlMap[p.fileName] = p.presignedUrl;
          }
        }
      }
      console.log(
        `   -> Presigned URL batch ${Math.min(i + chunkSize, batchPresignPayload.length)}/${batchPresignPayload.length} selesai`
      );
    } catch (err) {
      console.warn(`⚠️ Gagal presign batch ${i}:`, err);
    }
    await sleep(1000);
  }

  for (const item of assignmentDetails) {
    for (const key of PHOTO_KEYS) {
      if (item.photos[key]) {
        item.photos[key].presignedUrl = urlMap[item.photos[key].fileName] || null;
      }
    }
  }

  window.__DATA_FOTO_UBINAN__ = assignmentDetails;

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  downloadBlob(
    new Blob([JSON.stringify(assignmentDetails, null, 2)], { type: "application/json" }),
    `rekap_foto_ubinan_${SURVEY_PERIOD_ID}.json`
  );

  const csvHeaders = [
    "assignmentId", "kecamatan", "desa", "nks", "sls", "subsls", "namakk",
    "bulan", "komoditas", "status_sampel", "hasil_cacah", "beratbersih", "jmlhrumpun", "pcl", "status_assignment",
    ...PHOTO_KEYS.flatMap((k) => [`${k}_filename`, `${k}_url`]),
  ];
  const escapeCsv = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const csvRows = [
    csvHeaders.join(","),
    ...assignmentDetails.map((d) =>
      [
        d.assignmentId, d.kecamatan, d.desa, d.nks, d.sls, d.subsls, d.namakk,
        d.bulan, d.komoditas, d.status_sampel, d.hasil_cacah, d.beratbersih, d.jmlhrumpun, d.pcl, d.status_assignment,
        ...PHOTO_KEYS.flatMap((k) => [d.photos[k]?.fileName || "", d.photos[k]?.presignedUrl || ""]),
      ].map(escapeCsv).join(",")
    ),
  ];
  downloadBlob(
    new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" }),
    `rekap_foto_ubinan_${SURVEY_PERIOD_ID}.csv`
  );

  console.log("💾 File Rekap JSON & CSV berhasil didownload!");

  // ============================================================================
  // TAHAP 4: Download Foto ke Folder Lokal
  // ============================================================================
  if (dirHandle) {
    console.log("📥 [Tahap 4/4] Mengunduh semua file foto ke folder lokal...");
    let successCount = 0, failCount = 0;
    const safeName = (str) => String(str || "").replace(/[<>:"/\\|?*]/g, "_").trim();

    for (let i = 0; i < assignmentDetails.length; i++) {
      if (window.__STOP_SCRAPE__) break;
      const d = assignmentDetails[i];
      for (const key of PHOTO_KEYS) {
        const photo = d.photos[key];
        if (!photo || !photo.presignedUrl) continue;

        const customFileName = `${safeName(d.kecamatan)}_${safeName(d.desa)}_${safeName(d.nks)}_${safeName(d.namakk)}__${key}__${photo.fileName}`;
        try {
          const imgRes = await fetch(photo.presignedUrl);
          if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
          const blob = await imgRes.blob();
          const fileHandle = await dirHandle.getFileHandle(customFileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          successCount++;
          await sleep(250);
        } catch (err) {
          failCount++;
        }
      }
      if ((i + 1) % 5 === 0 || i === assignmentDetails.length - 1) {
        console.log(`   -> Progress Download Foto: ${i + 1}/${assignmentDetails.length} assignment (Berhasil: ${successCount}, Gagal: ${failCount})`);
      }
    }
    console.log(`🎉 SELESAI! ${successCount} foto tersimpan. (Gagal/terblokir CORS: ${failCount})`);
    if (failCount > 0) {
      console.warn(
        "⚠️ Karena domain S3 (sisnas-fasih-assignment.obj.bps.go.id) memblokir fetch lintas domain (CORS) dari browser, pindahkan file `rekap_foto_ubinan_6f581089-c787-4c0f-a307-0564f1e4e293.json` yang barusan terdownload ke folder d:\\BPS Garut\\KSA\\scraping-foto lalu beritahu aku agar kudownloadkan semua fotonya via script!"
      );
    }
  }
})();
