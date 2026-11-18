"""
===============================================================================
WORKER GITHUB ACTIONS: INCREMENTAL PHOTO DOWNLOAD, ANALYSIS & SUPABASE SYNC
===============================================================================
Alur Kerja Cerdas (Hanya Proses Foto Baru):
  1. Mengambil katalog seluruh foto lama (`photo_catalog`) yang sudah pernah
     dihitung hash-nya dari Supabase Database -> TIDAK PERLU didownload ulang!
  2. Mengambil antrean upload JSON terbaru (`raw_scrape_uploads`) yang berstatus
     `PENDING` dari Supabase Database.
  3. Membandingkan daftar foto di JSON baru dengan `photo_catalog`:
     - Jika `orig_filename` SUDAH ADA di `photo_catalog`, langsung gunakan hash lama!
     - Jika `orig_filename` BELUM ADA (foto baru), download dari `presignedUrl` S3
       FASIH, hitung SHA-256 + Content-Area pHash/dHash, lalu tambahkan ke katalog.
  4. Menjalankan pencocokan duplikasi (3.585+ foto lama + foto baru) dan langsung
     meng-upload HANYA foto duplikat yang belum ada di Supabase Storage (`ubinan-photos`),
     serta memperbarui tabel `audit_summary`, `duplicate_clusters`, dan `duplicate_pairs`.
"""

import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from analyze_photos import (
    PHOTO_KEYS,
    SUBROUND_MAP,
    build_clusters,
    classify_scenario,
    hamming_distance,
    normalize_pcl_name,
    process_single_image,
    verify_content_orb_and_pixel,
)
from sync_to_supabase import (
    BUCKET_NAME,
    SUPABASE_KEY,
    SUPABASE_URL,
    compress_to_webp_bytes,
    rest_delete_all,
    rest_upsert,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def safe_name(val: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', "_", str(val or "")).strip()


def supabase_get(endpoint: str):
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "apikey": SUPABASE_KEY,
        },
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))


def supabase_patch(endpoint: str, payload: dict):
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="PATCH",
        headers={
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "apikey": SUPABASE_KEY,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status


def load_full_catalog() -> dict[str, dict]:
    """Ambil semua baris photo_catalog dari Supabase (handle pagination per 1000)."""
    catalog = {}
    offset = 0
    limit = 1000
    while True:
        rows = supabase_get(f"photo_catalog?select=*&order=orig_filename.asc&offset={offset}&limit={limit}")
        if not rows:
            break
        for r in rows:
            phash_hex = r.get("phash_hex") or "0"
            dhash_hex = r.get("dhash_hex") or "0"
            pf_hex = r.get("phash_full_hex") or phash_hex
            df_hex = r.get("dhash_full_hex") or dhash_hex
            variants_hex = r.get("phash_variants_hex") or [phash_hex]

            catalog[r["orig_filename"]] = {
                "orig_filename": r["orig_filename"],
                "subround": r["subround"],
                "assignmentId": r["assignment_id"],
                "jenis_foto": r["jenis_foto"],
                "pcl": normalize_pcl_name(r.get("pcl") or "", r.get("kecamatan") or ""),
                "kecamatan": r.get("kecamatan") or "",
                "desa": r.get("desa") or "",
                "nks": r.get("nks") or "",
                "sls": r.get("sls") or "",
                "subsls": r.get("subsls") or "",
                "namakk": r.get("namakk") or "",
                "komoditas": r.get("komoditas") or "",
                "hasil_cacah": r.get("hasil_cacah") or "",
                "beratbersih": r.get("beratbersih") or "",
                "jmlhrumpun": r.get("jmlhrumpun") or "",
                "status_assignment": r.get("status_assignment") or "",
                "relpath": r.get("relpath") or "",
                "filepath": r.get("relpath") or "",
                "width": int(r.get("width") or 0),
                "height": int(r.get("height") or 0),
                "file_size": int(r.get("file_size") or 0),
                "sha256": r["sha256"],
                "phash_hex": phash_hex,
                "dhash_hex": dhash_hex,
                "phash": int(phash_hex, 16),
                "dhash": int(dhash_hex, 16),
                "phash_full": int(pf_hex, 16),
                "dhash_full": int(df_hex, 16),
                "phash_variants": [int(x, 16) for x in variants_hex],
                "image_url": r.get("image_url") or "",
                "valid": True,
                "is_new": False,
            }
        if len(rows) < limit:
            break
        offset += limit
    return catalog


def download_and_hash_new_photo(item: dict) -> dict | None:
    """Download 1 foto baru (Prioritas 1: Relay Supabase Storage, Prioritas 2: Presigned URL S3 FASIH) lalu hitung hash-nya."""
    filepath = item["filepath"]
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    urls_to_try = []
    if item.get("temp_storage_url"):
        urls_to_try.append(("Supabase Relay", item["temp_storage_url"]))
    if item.get("presigned_url"):
        urls_to_try.append(("S3 FASIH", item["presigned_url"]))

    for source_name, url in urls_to_try:
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
            with open(filepath, "wb") as f:
                f.write(data)

            processed = process_single_image(item)
            if processed.get("valid"):
                # Pengaman 1: Gunakan SHA-256 & dimensi asli dari file JPEG mentah jika tersedia dari browser
                if item.get("orig_sha256"):
                    processed["sha256"] = item["orig_sha256"]
                if item.get("orig_width"):
                    processed["width"] = int(item["orig_width"])
                if item.get("orig_height"):
                    processed["height"] = int(item["orig_height"])
                if item.get("orig_size"):
                    processed["file_size"] = int(item["orig_size"])
                processed["is_new"] = True
                return processed
        except Exception as e:
            print(f"   ⚠️ Gagal download foto baru ({source_name}) {item['orig_filename']}: {e}")
    return None


def cleanup_temp_storage_files(temp_keys: list[str]):
    """Pengaman 2: Hapus foto sementara di `temp_new/` dari Supabase Storage agar kuota tetap hemat."""
    cleaned = 0
    for tk in temp_keys:
        if not tk:
            continue
        try:
            del_url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{urllib.parse.quote(tk)}"
            req = urllib.request.Request(
                del_url,
                method="DELETE",
                headers={
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "apikey": SUPABASE_KEY,
                },
            )
            urllib.request.urlopen(req, timeout=20)
            cleaned += 1
        except Exception:
            pass
    if cleaned > 0:
        print(f"🧹 [Cleanup] Berhasil menghapus {cleaned} file relay sementara dari `temp_new/` di Supabase Storage.")


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ SUPABASE_URL / SUPABASE_KEY belum dikonfigurasi di GitHub Secrets!")
        sys.exit(1)

    print("📚 [1/5] Mengambil katalog foto lama dari Supabase (`photo_catalog`)...")
    catalog = load_full_catalog()
    print(f"   -> Ditemukan {len(catalog)} foto yang sudah tersimpan di katalog Supabase.")

    print("📥 [2/5] Memeriksa antrean JSON baru di `raw_scrape_uploads`...")
    pending_uploads = supabase_get("raw_scrape_uploads?status=eq.PENDING&order=id.asc")
    if not pending_uploads:
        print("ℹ️ Tidak ada antrean upload berstatus PENDING. Mengambil upload terakhir untuk diverifikasi...")
        pending_uploads = supabase_get("raw_scrape_uploads?order=id.desc&limit=1")

    new_tasks = []
    processed_upload_ids = []

    for upl in pending_uploads:
        processed_upload_ids.append(upl["id"])
        sr = upl.get("subround") or "SR3"
        folder = {"SR1": "S1", "SR2": "S2", "SR3": "S3"}.get(sr, "S3")
        assignments = upl.get("payload") or []

        for a in assignments:
            aid = a.get("assignmentId", "")
            kec = (a.get("kecamatan") or "").strip().upper()
            pcl = normalize_pcl_name(a.get("pcl") or "", kec)
            desa = (a.get("desa") or "").strip().upper()
            nks = str(a.get("nks") or "").strip()
            sls = str(a.get("sls") or "").strip()
            subsls = str(a.get("subsls") or "").strip()
            namakk = (a.get("namakk") or "").strip().upper()
            komoditas = (a.get("komoditas") or "").strip()
            hasil_cacah = (a.get("hasil_cacah") or "").strip()
            beratbersih = str(a.get("beratbersih") or "")
            jmlhrumpun = str(a.get("jmlhrumpun") or "")
            status_assign = a.get("status_assignment") or a.get("status") or ""
            photos_dict = a.get("photos") or {}

            for key in PHOTO_KEYS:
                p_info = photos_dict.get(key)
                if not p_info or not p_info.get("fileName"):
                    continue
                orig_fn = p_info["fileName"]
                presigned_url = p_info.get("presignedUrl")
                temp_storage_url = p_info.get("tempStorageUrl")
                temp_storage_key = p_info.get("tempStorageKey")

                # JIKA SUDAH ADA DI KATALOG LAMA -> SKIP DOWNLOAD!
                if orig_fn in catalog:
                    # Update metadata terbaru jika ada perubahan status/berat
                    catalog[orig_fn]["status_assignment"] = status_assign or catalog[orig_fn]["status_assignment"]
                    continue

                if not presigned_url and not temp_storage_url:
                    continue

                custom_fname = f"{safe_name(kec)}_{safe_name(desa)}_{safe_name(nks)}_{safe_name(namakk)}__{key}__{orig_fn}"
                relpath = f"{folder}/{custom_fname}"
                new_tasks.append(
                    {
                        "orig_filename": orig_fn,
                        "subround": sr,
                        "assignmentId": aid,
                        "jenis_foto": key,
                        "pcl": pcl,
                        "kecamatan": kec,
                        "desa": desa,
                        "nks": nks,
                        "sls": sls,
                        "subsls": subsls,
                        "namakk": namakk,
                        "komoditas": komoditas,
                        "hasil_cacah": hasil_cacah,
                        "beratbersih": beratbersih,
                        "jmlhrumpun": jmlhrumpun,
                        "status_assignment": status_assign,
                        "relpath": relpath,
                        "filepath": relpath,
                        "presigned_url": presigned_url,
                        "temp_storage_url": temp_storage_url,
                        "temp_storage_key": temp_storage_key,
                        "orig_sha256": p_info.get("origSha256"),
                        "orig_width": p_info.get("origWidth"),
                        "orig_height": p_info.get("origHeight"),
                        "orig_size": p_info.get("origSize"),
                        "image_url": "",
                    }
                )

    print(f"🚀 [3/5] Foto BARU yang belum pernah dianalisis: {len(new_tasks)} foto (Foto lama di-skip!).")
    new_catalog_rows = []
    if new_tasks:
        with ThreadPoolExecutor(max_workers=6) as pool:
            for res in pool.map(download_and_hash_new_photo, new_tasks):
                if res:
                    catalog[res["orig_filename"]] = res
                    new_catalog_rows.append(res)
        print(f"   -> Berhasil mendownload & menghitung hash {len(new_catalog_rows)} foto baru.")

    # Gabungkan semua foto di katalog untuk pencocokan duplikasi lintas SR1 + SR2 + SR3
    valid_photos = list(catalog.values())
    valid_by_path = {p["relpath"]: p for p in valid_photos}
    n = len(valid_photos)
    print(f"🔍 [4/5] Menjalankan deteksi duplikasi pada total {n} foto...")

    candidates = []
    for i in range(n):
        p1 = valid_photos[i]
        sha1 = p1["sha256"]
        h1_p = p1["phash"]
        h1_d = p1["dhash"]
        h1_pf = p1["phash_full"]
        h1_df = p1["dhash_full"]

        for j in range(i + 1, n):
            p2 = valid_photos[j]
            if sha1 == p2["sha256"]:
                candidates.append((p1, p2, "EXACT_SHA256", 0, 0, "Normal"))
                continue

            same_type = p1["jenis_foto"] == p2["jenis_foto"]
            same_assign = p1["assignmentId"] == p2["assignmentId"] and p1["subround"] == p2["subround"]

            dist_pf = hamming_distance(h1_pf, p2["phash_full"])
            dist_df = hamming_distance(h1_df, p2["dhash_full"])
            dist_p = hamming_distance(h1_p, p2["phash"])
            dist_d = hamming_distance(h1_d, p2["dhash"])

            min_rot_p = dist_p
            rot_label = "Normal"
            if dist_p > 6:
                rot_names = ["Normal", "Rotasi 90°", "Rotasi 180°", "Rotasi 270°", "Flip Horizontal"]
                for idx_r, h2_rot in enumerate(p2["phash_variants"]):
                    d_r = hamming_distance(h1_p, h2_rot)
                    if d_r < min_rot_p:
                        min_rot_p = d_r
                        rot_label = rot_names[idx_r]

            best_p = min(min_rot_p, dist_pf)
            best_d = min(dist_d, dist_df)

            if same_type:
                if best_p <= 12 or (best_p <= 16 and best_d <= 10):
                    candidates.append((p1, p2, "CANDIDATE", best_p, best_d, rot_label))
            else:
                if (best_p <= 10 and best_d <= 10) or (same_assign and best_p <= 12):
                    candidates.append((p1, p2, "CANDIDATE", best_p, best_d, rot_label))

    verified_findings = []
    for p1, p2, ctype, dist_p, dist_d, rot_label in candidates:
        is_sketsa = p1["jenis_foto"] == "fotobidang" or p2["jenis_foto"] == "fotobidang"

        if ctype == "EXACT_SHA256":
            kategori = "1. Duplikat Identik 100% (SHA-256)"
            metode = "EXACT_SHA256 (File Biner Sama Persis)"
            sim_pct = 100.0
            inliers = 999
            pixel_corr = 1.0
            spread = 1.0
        elif os.path.exists(p1["filepath"]) and os.path.exists(p2["filepath"]):
            # Jika kedua file fisik tersedia lokal, jalankan verifikasi ORB + Pixel Correlation penuh
            v = verify_content_orb_and_pixel(p1["filepath"], p2["filepath"], p1["jenis_foto"], p2["jenis_foto"])
            inliers = v["inliers"]
            ratio = v["inlier_ratio"]
            pixel_corr = v["pixel_corr"]
            spread = v["spatial_spread"]

            if dist_p <= 2 and dist_d <= 2 and pixel_corr >= 0.96 and (inliers >= 80 or not is_sketsa):
                kategori = "2. Foto Sama Persis (Beda Kompresi/Resave)"
                metode = f"pHash({dist_p}) + Corr({pixel_corr:.2f}) + ORB({inliers} titik)"
                sim_pct = 99.0
            elif inliers >= 40 and ratio >= 0.35 and spread >= 0.25:
                if is_sketsa and inliers < 90 and pixel_corr < 0.85:
                    continue
                kategori = "3. Objek/Gambar Sama (Crop / Sudut Geser / Potret Ulang)"
                metode = f"ORB RANSAC ({inliers} titik identik, rasio {ratio:.2f}) + pHash({dist_p})"
                sim_pct = round(min(98.0, 75.0 + min(inliers, 200) * 0.11), 1)
            elif not is_sketsa and dist_p <= 4 and dist_d <= 4 and pixel_corr >= 0.92 and inliers >= 20:
                kategori = "2. Foto Sama Persis (Beda Kompresi/Resave)"
                metode = f"pHash({dist_p})/dHash({dist_d}) + Corr({pixel_corr:.2f}) + ORB({inliers})"
                sim_pct = 96.0
            else:
                continue
        else:
            # Jika salah satu foto adalah foto lama di cloud (hanya mengandalkan hash ketat)
            if not is_sketsa and dist_p <= 2 and dist_d <= 2:
                kategori = "2. Foto Sama Persis (Beda Kompresi/Resave)"
                metode = f"pHash({dist_p})/dHash({dist_d}) (Cloud Catalog Match)"
                sim_pct = 98.0
                inliers = 100
                pixel_corr = 0.98
                spread = 0.8
            else:
                continue

        scen_code, scen_desc = classify_scenario(p1, p2)
        verified_findings.append(
            {
                "skenario_kode": scen_code,
                "skenario_deskripsi": scen_desc,
                "kategori_temuan": kategori,
                "skor_kemiripan_pct": sim_pct,
                "metode_deteksi": metode,
                "orientasi": rot_label,
                "phash_dist": dist_p,
                "dhash_dist": dist_d,
                "pixel_corr": pixel_corr,
                "orb_ransac_inliers": inliers,
                "spatial_spread": spread,
                "sr_1": p1["subround"],
                "jenis_1": p1["jenis_foto"],
                "pcl_1": p1["pcl"],
                "kec_1": p1["kecamatan"],
                "desa_1": p1["desa"],
                "nks_1": p1["nks"],
                "namakk_1": p1["namakk"],
                "berat_1": str(p1["beratbersih"] or ""),
                "rumpun_1": str(p1["jmlhrumpun"] or ""),
                "status_1": p1["status_assignment"],
                "assign_1": p1["assignmentId"],
                "relpath_1": p1["relpath"],
                "res_1": f"{p1['width']}x{p1['height']}",
                "sr_2": p2["subround"],
                "jenis_2": p2["jenis_foto"],
                "pcl_2": p2["pcl"],
                "kec_2": p2["kecamatan"],
                "desa_2": p2["desa"],
                "nks_2": p2["nks"],
                "namakk_2": p2["namakk"],
                "berat_2": str(p2["beratbersih"] or ""),
                "rumpun_2": str(p2["jmlhrumpun"] or ""),
                "status_2": p2["status_assignment"],
                "assign_2": p2["assignmentId"],
                "relpath_2": p2["relpath"],
                "res_2": f"{p2['width']}x{p2['height']}",
            }
        )

    clusters = build_clusters(verified_findings, valid_by_path)

    # Upload HANYA foto duplikat baru yang belum memiliki image_url di Supabase Storage
    print("☁️ [5/5] Mengunggah foto duplikat baru ke Supabase Storage & memperbarui database...")
    needed_relpaths = set()
    for c in clusters:
        for m in c["members"]:
            needed_relpaths.add(m["relpath"])
    for p in verified_findings:
        needed_relpaths.add(p["relpath_1"])
        needed_relpaths.add(p["relpath_2"])

    url_map = {}
    uploaded_count = 0
    for relp in sorted(needed_relpaths):
        p_obj = valid_by_path.get(relp)
        storage_key = relp.rsplit(".", 1)[0] + ".webp"
        pub_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{urllib.parse.quote(storage_key)}"

        if p_obj and p_obj.get("image_url"):
            url_map[relp] = p_obj["image_url"]
            continue

        if os.path.exists(relp):
            try:
                webp_bytes = compress_to_webp_bytes(relp)
                upload_endpoint = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{urllib.parse.quote(storage_key)}"
                req = urllib.request.Request(
                    upload_endpoint,
                    data=webp_bytes,
                    method="POST",
                    headers={
                        "Authorization": f"Bearer {SUPABASE_KEY}",
                        "apikey": SUPABASE_KEY,
                        "Content-Type": "image/webp",
                        "x-upsert": "true",
                    },
                )
                urllib.request.urlopen(req, timeout=30)
                uploaded_count += 1
            except Exception as e:
                print(f"   ⚠️ Gagal upload {relp}: {e}")
        url_map[relp] = pub_url
        if p_obj:
            p_obj["image_url"] = pub_url

    print(f"   -> Foto baru yang di-upload ke Storage: {uploaded_count} foto (sisanya sudah ada di Storage).")

    # Simpan foto baru ke photo_catalog
    if new_catalog_rows:
        db_cat = [
            {
                "orig_filename": r["orig_filename"],
                "subround": r["subround"],
                "assignment_id": r["assignmentId"],
                "jenis_foto": r["jenis_foto"],
                "pcl": r["pcl"],
                "kecamatan": r["kecamatan"],
                "desa": r["desa"],
                "nks": r["nks"],
                "sls": r["sls"],
                "subsls": r["subsls"],
                "namakk": r["namakk"],
                "komoditas": r["komoditas"],
                "hasil_cacah": r["hasil_cacah"],
                "beratbersih": str(r["beratbersih"] or ""),
                "jmlhrumpun": str(r["jmlhrumpun"] or ""),
                "status_assignment": r["status_assignment"],
                "relpath": r["relpath"],
                "width": r["width"],
                "height": r["height"],
                "file_size": r["file_size"],
                "sha256": r["sha256"],
                "phash_hex": r["phash_hex"],
                "dhash_hex": r["dhash_hex"],
                "phash_full_hex": f"{r['phash_full']:016x}",
                "dhash_full_hex": f"{r['dhash_full']:016x}",
                "phash_variants_hex": [f"{v:016x}" for v in r["phash_variants"]],
                "image_url": url_map.get(r["relpath"], ""),
            }
            for r in new_catalog_rows
        ]
        for i in range(0, len(db_cat), 200):
            rest_upsert("photo_catalog", db_cat[i : i + 200], on_conflict="orig_filename")

    # Format clusters & pairs untuk Supabase
    db_clusters = [
        {
            "cluster_id": c["cluster_id"],
            "jumlah_foto": c["jumlah_foto"],
            "jumlah_petugas": c["jumlah_petugas"],
            "daftar_petugas": c["daftar_petugas"],
            "daftar_kecamatan": c["daftar_kecamatan"],
            "daftar_subround": c["daftar_subround"],
            "daftar_jenis_foto": c["daftar_jenis_foto"],
            "skenario_terlibat": c["skenario_terlibat"],
            "kategori_terlibat": c["kategori_terlibat"],
            "primary_tag": c["primary_tag"],
            "max_similarity": c["max_similarity"],
            "members": [
                {
                    "subround": m["subround"],
                    "assignmentId": m["assignmentId"],
                    "jenis_foto": m["jenis_foto"],
                    "pcl": m["pcl"],
                    "kecamatan": m["kecamatan"],
                    "desa": m["desa"],
                    "nks": m["nks"],
                    "namakk": m["namakk"],
                    "beratbersih": m["beratbersih"],
                    "jmlhrumpun": m["jmlhrumpun"],
                    "relpath": m["relpath"],
                    "image_url": url_map.get(m["relpath"], ""),
                }
                for m in c["members"]
            ],
        }
        for c in clusters
    ]

    for p in verified_findings:
        p["image_url_1"] = url_map.get(p["relpath_1"], "")
        p["image_url_2"] = url_map.get(p["relpath_2"], "")

    unique_assignments = len(set((p["subround"], p["assignmentId"]) for p in valid_photos))
    summary = {
        "id": "latest",
        "total_photos": len(valid_photos),
        "total_assignments": unique_assignments,
        "total_pairs": len(verified_findings),
        "total_clusters": len(db_clusters),
        "multi_photo_clusters": sum(1 for c in db_clusters if c["jumlah_foto"] >= 3),
        "cross_pcl_clusters": sum(1 for c in db_clusters if c["jumlah_petugas"] >= 2),
        "exact_pairs": sum(1 for f in verified_findings if f["kategori_temuan"].startswith("1.")),
    }

    rest_upsert("audit_summary", summary, on_conflict="id")
    rest_delete_all("duplicate_clusters", "cluster_id")
    for i in range(0, len(db_clusters), 50):
        rest_upsert("duplicate_clusters", db_clusters[i : i + 50], on_conflict="cluster_id")

    rest_delete_all("duplicate_pairs", "id")
    for i in range(0, len(verified_findings), 100):
        rest_upsert("duplicate_pairs", verified_findings[i : i + 100])

    # Tandai antrean upload di raw_scrape_uploads menjadi DONE
    for uid in processed_upload_ids:
        supabase_patch(f"raw_scrape_uploads?id=eq.{uid}", {"status": "DONE"})

    # Bersihkan file sementara di temp_new/ Supabase Storage
    temp_keys_to_clean = [t.get("temp_storage_key") for t in new_tasks if t.get("temp_storage_key")]
    if temp_keys_to_clean:
        cleanup_temp_storage_files(temp_keys_to_clean)

    print(f"🎉 Incremental Job Selesai! Total Foto: {len(valid_photos)}, Cluster: {len(db_clusters)}, Pasangan: {len(verified_findings)}.")


if __name__ == "__main__":
    main()

