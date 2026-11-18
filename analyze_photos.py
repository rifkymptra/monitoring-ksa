"""
===============================================================================
SISTEM DETEKSI DUPLIKASI & KUALITAS FOTO UBINAN FASIH-SM (BPS KABUPATEN GARUT)
===============================================================================
Penyempurnaan Domain-Specific KSA Ubinan (Eliminasi False Positive):
  1. CROP WATERMARK: Sebelum menghitung pHash, dHash, maupun titik fitur ORB,
     kita fokus pada AREA OBJEK UTAMA (memotong 26% bagian bawah tempat banner
     watermark FASIH 'F' / Timemark / Logo BPS berada).
  2. FILTER KEYPOINT SPASIAL (Spatial Dispersion):
     Titik fitur ORB yang cocok (RANSAC inliers) harus tersebar di area objek,
     bukan mengumpul di satu pojok logo/teks watermark.
  3. PENANGANAN KHUSUS `fotobidang` (Sketsa Kertas Putih):
     Karena `fotobidang` adalah foto sketsa gambar tangan di atas kertas putih,
     dHash/pHash alami akan mirip untuk semua kertas putih. Oleh karena itu,
     untuk `fotobidang` non-identik biner, wajib terverifikasi oleh kecocokan
     bentuk gambar/tulisan/serat kertas yang identik.
  4. CLUSTERING & MODERN DASHBOARD HTML:
     Mengelompokkan foto-foto yang berasal dari sumber yang sama ke dalam
     Grup/Cluster Duplikasi (2 s.d. N foto sejajar dalam satu grup), dilengkapi
     Dashboard HTML Modern, Minimalis, dan User-Friendly (3 Tab: Ringkasan
     Eksekutif, Tampilan Kelompok Multi-Foto, dan Tampilan Per Pasangan + Lightbox).
"""

import glob
import hashlib
import html
import json
import os
import re
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
import pandas as pd
from PIL import Image
from scipy.fftpack import dct

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SUBROUND_MAP = {
    "d74be6a7-567c-498b-ae2a-4ac7a163c7c5": {"sr": "SR1", "folder": "S1"},
    "d182137c-c614-48ca-be9b-1df41f906c0e": {"sr": "SR2", "folder": "S2"},
    "6f581089-c787-4c0f-a307-0564f1e4e293": {"sr": "SR3", "folder": "S3"},
}

PHOTO_KEYS = ["fotobidang", "foto_petak", "fotoplot", "fotoberat"]

# Pemetaan Standar Nama Petugas (Menyatukan Variasi Singkatan / Typo Ketikan di Kecamatan yang Sama)
PCL_CANONICAL_MAP = {
    # TAROGONG KALER
    "RIFQIE NOOR": "RIFQIE NOOR IQBALULLOH",
    "RIFQIE NOOR I": "RIFQIE NOOR IQBALULLOH",
    "RIFQIE NOOR I.": "RIFQIE NOOR IQBALULLOH",
    "RIFQIE NOOR IQBQLULLOH": "RIFQIE NOOR IQBALULLOH",
    "RIFQIE NOOR IQBALULLOH": "RIFQIE NOOR IQBALULLOH",
    # BANYURESMI
    "FITRIA FEBIAN": "FITRIA FEBRIAN AGUSTI",
    "FITRIA FEBRIAN": "FITRIA FEBRIAN AGUSTI",
    "FITRIA FREBIAN": "FITRIA FEBRIAN AGUSTI",
    "FITRIA FREBRIAN": "FITRIA FEBRIAN AGUSTI",
    "FITRIA FEBRIAN AGUSTI": "FITRIA FEBRIAN AGUSTI",
    "MASHAADI PUDJIANTO": "MASHADI PUDJIANTO",
    "MASHAI PUDJIANTO": "MASHADI PUDJIANTO",
    "MASHADI PUDJIANTO": "MASHADI PUDJIANTO",
    # SINGAJAYA
    "DUDUNG WAHYIDIN": "DUDUNG WAHYUDIN",
    "DUDUNG WAYUDIN": "DUDUNG WAHYUDIN",
    "DUDUNG WAHYUDIN": "DUDUNG WAHYUDIN",
    # WANARAJA
    "AGNAN": "AGNAN AHMAD KURNIAWAN",
    "AGNAN AHMAD": "AGNAN AHMAD KURNIAWAN",
    "AGNAN AHMAD K": "AGNAN AHMAD KURNIAWAN",
    "AGNAN AHMAD KURNIAWAN": "AGNAN AHMAD KURNIAWAN",
    # TAROGONG KIDUL
    "AJRUL MUMININ": "AJRUL MU'MININ",
    "AJRUL MU'MININ": "AJRUL MU'MININ",
    # KARANGTENGAH
    "DADI HARYADI": "DADI HERYADI",
    "DADI HERYADI": "DADI HERYADI",
    # CIBATU
    "INTAN RACHMANIA S": "INTAN RACHMANIA SUPRIATIN",
    "INTAN RACHMANIA SUPRIATIN": "INTAN RACHMANIA SUPRIATIN",
    # PANGATIKAN
    "YUSAN YUSABTI": "YUSAN YUSANTI",
    "YUSAN YUSANTI": "YUSAN YUSANTI",
    # MEKARMUKTI
    "DEDING JOHAN BASARAH, SP": "DEDING JOHAN BASARAH",
    "DEDNG JOHAN BASARAH": "DEDING JOHAN BASARAH",
    "DEDING JOHAN BASARAH": "DEDING JOHAN BASARAH",
    # CIHURIP
    "INDRA BJ": "INDRA BUDI JAYA",
    "INDRA BUDI JAYA": "INDRA BUDI JAYA",
    # CISURUPAN
    "CUCUSURAHMAN": "CUCU SURAHMAN",
    "CUCU SURAHMAN": "CUCU SURAHMAN",
    # TALEGONG
    "ALDI": "ALDI FIRMAN",
    "ALDI FIRMAN": "ALDI FIRMAN",
}


def normalize_pcl_name(raw_pcl: str, kecamatan: str = "") -> str:
    """Normalisasi nama petugas dari typo ketikan manual, gelar, atau singkatan."""
    name = re.sub(r"\s+", " ", str(raw_pcl or "").strip().upper())
    if not name:
        return ""
    if name in PCL_CANONICAL_MAP:
        return PCL_CANONICAL_MAP[name]
    # Bersihkan gelar di belakang koma (mis. ', SP', ', S.P', dll.) dan titik di ujung
    cleaned = re.sub(r",\s*[A-Z.\s]+$", "", name).rstrip(".")
    if cleaned in PCL_CANONICAL_MAP:
        return PCL_CANONICAL_MAP[cleaned]
    return cleaned



def crop_content_area_pil(img: Image.Image) -> Image.Image:
    w, h = img.size
    top = int(h * 0.05)
    bottom = int(h * 0.74)
    if bottom - top < 50:
        return img
    return img.crop((0, top, w, bottom))


def compute_phash_uint64(gray_32: np.ndarray) -> int:
    dct_rows = dct(gray_32.astype(np.float32), type=2, norm="ortho", axis=0)
    dct_2d = dct(dct_rows, type=2, norm="ortho", axis=1)
    low_freq = dct_2d[:8, :8].flatten()
    med = np.median(low_freq[1:])
    bits = (low_freq > med).astype(np.uint64)
    val = 0
    for b in bits:
        val = (val << 1) | int(b)
    return val


def compute_dhash_uint64(gray_9x8: np.ndarray) -> int:
    diff = (gray_9x8[:, 1:] > gray_9x8[:, :-1]).flatten()
    val = 0
    for b in diff:
        val = (val << 1) | int(b)
    return val


def hamming_distance(h1: int, h2: int) -> int:
    return (h1 ^ h2).bit_count()


def process_single_image(item: dict) -> dict:
    filepath = item["filepath"]
    try:
        with open(filepath, "rb") as f:
            raw_bytes = f.read()
        sha256 = hashlib.sha256(raw_bytes).hexdigest()
        file_size = len(raw_bytes)

        with Image.open(filepath) as img:
            width, height = img.size
            gray_full = img.convert("L")
            gray_crop = crop_content_area_pil(gray_full)

            g32_full = np.asarray(gray_full.resize((32, 32), Image.Resampling.LANCZOS), dtype=np.float32)
            g9x8_full = np.asarray(gray_full.resize((9, 8), Image.Resampling.LANCZOS), dtype=np.float32)
            phash_full = compute_phash_uint64(g32_full)
            dhash_full = compute_dhash_uint64(g9x8_full)

            orientations = [
                gray_crop,
                gray_crop.transpose(Image.ROTATE_90),
                gray_crop.transpose(Image.ROTATE_180),
                gray_crop.transpose(Image.ROTATE_270),
                gray_crop.transpose(Image.FLIP_LEFT_RIGHT),
            ]
            phashes_crop = []
            for im_ori in orientations:
                g32 = np.asarray(im_ori.resize((32, 32), Image.Resampling.LANCZOS), dtype=np.float32)
                phashes_crop.append(compute_phash_uint64(g32))

            g9x8_crop = np.asarray(gray_crop.resize((9, 8), Image.Resampling.LANCZOS), dtype=np.float32)
            dhash_crop = compute_dhash_uint64(g9x8_crop)

        item.update(
            {
                "valid": True,
                "sha256": sha256,
                "file_size": file_size,
                "width": width,
                "height": height,
                "phash_full": phash_full,
                "dhash_full": dhash_full,
                "phash": phashes_crop[0],
                "phash_variants": phashes_crop,
                "dhash": dhash_crop,
                "phash_hex": f"{phashes_crop[0]:016x}",
                "dhash_hex": f"{dhash_crop:016x}",
            }
        )
    except Exception as e:
        item.update({"valid": False, "error": str(e)})
    return item


def verify_content_orb_and_pixel(path1: str, path2: str, jenis1: str, jenis2: str) -> dict:
    res = {"good_matches": 0, "inliers": 0, "inlier_ratio": 0.0, "pixel_corr": 0.0, "spatial_spread": 0.0}
    try:
        img1_full = cv2.imdecode(np.fromfile(path1, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
        img2_full = cv2.imdecode(np.fromfile(path2, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
        if img1_full is None or img2_full is None:
            return res

        h1, w1 = img1_full.shape
        h2, w2 = img2_full.shape
        img1 = img1_full[int(h1 * 0.05) : int(h1 * 0.74), :]
        img2 = img2_full[int(h2 * 0.05) : int(h2 * 0.74), :]

        r1 = cv2.resize(img1, (128, 128)).astype(np.float32)
        r2 = cv2.resize(img2, (128, 128)).astype(np.float32)
        s1, s2 = r1.std(), r2.std()
        if s1 > 1.0 and s2 > 1.0:
            corr = float(np.mean(((r1 - r1.mean()) / s1) * ((r2 - r2.mean()) / s2)))
            res["pixel_corr"] = round(max(0.0, corr), 4)

        orb = cv2.ORB_create(nfeatures=1200)
        kp1, des1 = orb.detectAndCompute(img1, None)
        kp2, des2 = orb.detectAndCompute(img2, None)
        if des1 is None or des2 is None or len(kp1) < 12 or len(kp2) < 12:
            return res

        bf = cv2.BFMatcher(cv2.NORM_HAMMING)
        raw_matches = bf.knnMatch(des1, des2, k=2)

        good = []
        for m_n in raw_matches:
            if len(m_n) == 2:
                m, n = m_n
                if m.distance < 0.75 * n.distance:
                    good.append(m)

        res["good_matches"] = len(good)
        if len(good) < 10:
            return res

        src_pts = np.float32([kp1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)

        _, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
        if mask is None:
            return res

        mask_flat = mask.ravel().astype(bool)
        inliers = int(mask_flat.sum())
        res["inliers"] = inliers
        res["inlier_ratio"] = round(inliers / max(len(good), 1), 3)

        if inliers >= 8:
            inlier_pts = src_pts[mask_flat].reshape(-1, 2)
            ch, cw = img1.shape
            x_span = (inlier_pts[:, 0].max() - inlier_pts[:, 0].min()) / max(cw, 1)
            y_span = (inlier_pts[:, 1].max() - inlier_pts[:, 1].min()) / max(ch, 1)
            res["spatial_spread"] = round(float(max(x_span, y_span)), 3)

        return res
    except Exception:
        return res


def build_dataset() -> tuple[list[dict], list[dict]]:
    physical_files = {}
    for period_id, info in SUBROUND_MAP.items():
        sr = info["sr"]
        folder = info["folder"]
        if not os.path.exists(folder):
            continue
        for fname in os.listdir(folder):
            if not fname.lower().endswith((".jpg", ".jpeg", ".png")):
                continue
            full_path = os.path.abspath(os.path.join(folder, fname))
            m = re.search(
                r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}__.+\.jpg)$",
                fname,
            )
            if m:
                orig_name = m.group(1)
                physical_files[(sr, orig_name)] = full_path

    photo_records = []
    completeness_records = []

    for json_path in sorted(glob.glob("hasil_json/*.json")):
        fname = os.path.basename(json_path)
        matched_period = None
        for pid in SUBROUND_MAP:
            if pid in fname:
                matched_period = pid
                break
        if not matched_period:
            continue

        sr = SUBROUND_MAP[matched_period]["sr"]
        folder = SUBROUND_MAP[matched_period]["folder"]
        folder_exists = os.path.exists(folder)

        with open(json_path, "r", encoding="utf-8") as f:
            assignments = json.load(f)

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
            beratbersih = a.get("beratbersih")
            jmlhrumpun = a.get("jmlhrumpun")
            status_assign = a.get("status_assignment") or a.get("status") or ""
            photos_dict = a.get("photos") or {}

            present_keys = [k for k in PHOTO_KEYS if k in photos_dict and photos_dict[k].get("fileName")]
            missing_keys = [k for k in PHOTO_KEYS if k not in present_keys]

            completeness_records.append(
                {
                    "subround": sr,
                    "assignmentId": aid,
                    "pcl": pcl,
                    "kecamatan": kec,
                    "desa": desa,
                    "nks": nks,
                    "namakk": namakk,
                    "hasil_cacah": hasil_cacah,
                    "status_assignment": status_assign,
                    "jumlah_foto_metadata": len(present_keys),
                    "foto_kosong": ", ".join(missing_keys) if missing_keys else "LENGKAP (4 Foto)",
                }
            )

            if not folder_exists:
                continue

            for key in present_keys:
                orig_fn = photos_dict[key]["fileName"]
                fpath = physical_files.get((sr, orig_fn))
                if fpath and os.path.exists(fpath):
                    photo_records.append(
                        {
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
                            "orig_filename": orig_fn,
                            "filepath": fpath,
                            "relpath": os.path.relpath(fpath, start=os.getcwd()).replace("\\", "/"),
                        }
                    )

    return photo_records, completeness_records


def classify_scenario(r1: dict, r2: dict) -> tuple[str, str]:
    same_assign = r1["assignmentId"] == r2["assignmentId"] and r1["subround"] == r2["subround"]
    same_type = r1["jenis_foto"] == r2["jenis_foto"]
    same_pcl = r1["pcl"] == r2["pcl"] and r1["pcl"] != ""
    same_sr = r1["subround"] == r2["subround"]

    if same_assign:
        return "Skenario 5A", "Lintas Jenis Foto (Assignment Sama)"
    if not same_type:
        return "Skenario 5B", "Lintas Jenis Foto (Beda Assignment)"
    if not same_pcl and same_sr:
        return "Skenario 1", "Antar Petugas | Subround Sama"
    if same_pcl and not same_sr:
        return "Skenario 2", "Petugas Sama | Lintas Subround"
    if not same_pcl and not same_sr:
        return "Skenario 3", "Antar Petugas | Lintas Subround"
    return "Skenario 4", "Petugas Sama | Subround Sama (Beda Sampel)"


def build_clusters(findings: list[dict], valid_photos_by_path: dict) -> list[dict]:
    """Kelompokkan pasangan foto yang saling terhubung menjadi Cluster Duplikasi."""
    adj = defaultdict(set)
    edge_info = defaultdict(list)

    for f in findings:
        u = f["relpath_1"]
        v = f["relpath_2"]
        adj[u].add(v)
        adj[v].add(u)
        edge_info[u].append(f)
        edge_info[v].append(f)

    visited = set()
    clusters = []

    for node in adj:
        if node in visited:
            continue
        comp = []
        queue = [node]
        visited.add(node)
        while queue:
            curr = queue.pop(0)
            comp.append(curr)
            for nxt in adj[curr]:
                if nxt not in visited:
                    visited.add(nxt)
                    queue.append(nxt)

        members = [valid_photos_by_path[p] for p in comp if p in valid_photos_by_path]
        members.sort(key=lambda m: (m["subround"], m["pcl"], m["kecamatan"], m["desa"], m["namakk"]))

        # Kumpulkan semua skenario & kategori yang terlibat di cluster ini
        cluster_edges = []
        comp_set = set(comp)
        for f in findings:
            if f["relpath_1"] in comp_set and f["relpath_2"] in comp_set:
                cluster_edges.append(f)

        pcls = sorted(set(m["pcl"] for m in members if m["pcl"]))
        kecs = sorted(set(m["kecamatan"] for m in members if m["kecamatan"]))
        srs = sorted(set(m["subround"] for m in members))
        jenis_set = sorted(set(m["jenis_foto"] for m in members))
        scens = sorted(set(e["skenario_kode"] for e in cluster_edges))
        kats = sorted(set(e["kategori_temuan"] for e in cluster_edges))
        max_sim = max((e["skor_kemiripan_pct"] for e in cluster_edges), default=100.0)

        # Tentukan label prioritas cluster
        if len(pcls) > 1 and len(srs) > 1:
            primary_tag = "Lintas Petugas & Lintas Subround"
        elif len(pcls) > 1:
            primary_tag = "Antar Petugas Berbeda"
        elif len(srs) > 1:
            primary_tag = "Petugas Sama (Lintas Subround)"
        elif len(jenis_set) > 1 and len(set(m["assignmentId"] for m in members)) == 1:
            primary_tag = "Duplikat Dalam 1 Sampel (Lintas Jenis)"
        else:
            primary_tag = "Petugas Sama (Berulang Antar Sampel)"

        clusters.append(
            {
                "cluster_id": "",
                "jumlah_foto": len(members),
                "jumlah_petugas": len(pcls),
                "daftar_petugas": ", ".join(pcls),
                "daftar_kecamatan": ", ".join(kecs),
                "daftar_subround": ", ".join(srs),
                "daftar_jenis_foto": ", ".join(jenis_set),
                "skenario_terlibat": ", ".join(scens),
                "kategori_terlibat": ", ".join(kats),
                "primary_tag": primary_tag,
                "max_similarity": max_sim,
                "members": members,
                "edges": cluster_edges,
            }
        )

    # Urutkan cluster: utamakan yang jumlah fotonya paling banyak & melibatkan banyak petugas
    clusters.sort(key=lambda c: (-c["jumlah_foto"], -c["jumlah_petugas"], -c["max_similarity"]))
    for idx, c in enumerate(clusters, 1):
        c["cluster_id"] = f"GRP-{idx:03d}"
    return clusters


def generate_html_report(findings: list[dict], clusters: list[dict], completeness: list[dict], total_photos: int):
    """Buat Dashboard HTML Modern, Minimalis & Interaktif untuk Presentasi."""
    # Hitung statistik eksekutif
    multi_photo_clusters = sum(1 for c in clusters if c["jumlah_foto"] >= 3)
    cross_pcl_clusters = sum(1 for c in clusters if c["jumlah_petugas"] >= 2)
    exact_pairs = sum(1 for f in findings if "1." in f["kategori_temuan"])

    # Statistik per Skenario
    scen_summary = defaultdict(lambda: {"total": 0, "kat1": 0, "kat2": 0, "kat3": 0, "desc": ""})
    for f in findings:
        k = f["skenario_kode"]
        scen_summary[k]["desc"] = f["skenario_deskripsi"]
        scen_summary[k]["total"] += 1
        if f["kategori_temuan"].startswith("1."):
            scen_summary[k]["kat1"] += 1
        elif f["kategori_temuan"].startswith("2."):
            scen_summary[k]["kat2"] += 1
        else:
            scen_summary[k]["kat3"] += 1

    # Statistik per Kecamatan (berdasarkan keterlibatan di cluster)
    kec_stats = defaultdict(lambda: {"clusters": 0, "photos": 0, "pcls": set()})
    for c in clusters:
        seen_kecs = set()
        for m in c["members"]:
            kc = m["kecamatan"] or "TIDAK DIKETAHUI"
            kec_stats[kc]["photos"] += 1
            if m["pcl"]:
                kec_stats[kc]["pcls"].add(m["pcl"])
            seen_kecs.add(kc)
        for kc in seen_kecs:
            kec_stats[kc]["clusters"] += 1

    top_kecs = sorted(kec_stats.items(), key=lambda x: (-x[1]["photos"], -x[1]["clusters"]))[:12]

    # Render baris tabel skenario
    scen_rows_html = []
    for sc_code in sorted(scen_summary.keys()):
        st = scen_summary[sc_code]
        scen_rows_html.append(
            f"""
            <tr onclick="switchTabAndFilter('pairs', '{sc_code}')" style="cursor:pointer" title="Klik untuk melihat daftar foto skenario ini">
                <td><span class="pill pill-indigo">{html.escape(sc_code)}</span></td>
                <td style="font-weight:500">{html.escape(st['desc'])}</td>
                <td class="text-center">{st['kat1']}</td>
                <td class="text-center">{st['kat2']}</td>
                <td class="text-center">{st['kat3']}</td>
                <td class="text-center"><strong style="color:var(--primary)">{st['total']}</strong></td>
            </tr>
            """
        )

    # Render baris tabel kecamatan
    kec_rows_html = []
    for kc, st in top_kecs:
        kec_rows_html.append(
            f"""
            <tr onclick="switchTabAndSearch('clusters', '{html.escape(kc)}')" style="cursor:pointer" title="Klik untuk memfilter kecamatan ini">
                <td style="font-weight:600">{html.escape(kc)}</td>
                <td class="text-center">{st['clusters']} Grup</td>
                <td class="text-center">{st['photos']} Foto</td>
                <td class="text-center">{len(st['pcls'])} Petugas</td>
            </tr>
            """
        )

    # Render Kartu CLUSTER (Multi-Foto 2 s.d. N Foto Sejajar)
    cluster_cards_html = []
    for c in clusters:
        member_items_html = []
        for idx_m, m in enumerate(c["members"], 1):
            rel_img = "../" + m["relpath"]
            caption_js = html.escape(
                f"[{m['subround']} - {m['jenis_foto']}] Petugas: {m['pcl']} | {m['kecamatan']} - {m['desa']} | Sampel: {m['namakk']} (NKS: {m['nks']}) | Berat: {m['beratbersih']} kg"
            )
            member_items_html.append(
                f"""
                <div class="cluster-photo-item">
                    <div class="img-wrap" onclick="openLightbox('{html.escape(rel_img)}', '{caption_js}')">
                        <span class="img-num">#{idx_m}</span>
                        <span class="img-sr-tag">{html.escape(m['subround'])} · {html.escape(m['jenis_foto'])}</span>
                        <img src="{html.escape(rel_img)}" loading="lazy" alt="Foto Cluster">
                    </div>
                    <div class="item-meta">
                        <div class="meta-pcl" title="Petugas Pencacah">👮 {html.escape(m['pcl'] or '-')}</div>
                        <div class="meta-loc" title="Kecamatan & Desa">📍 {html.escape(m['kecamatan'])} - {html.escape(m['desa'])}</div>
                        <div class="meta-kk" title="Nama Kepala Keluarga & NKS">👤 <b>{html.escape(m['namakk'] or '-')}</b> <span class="muted">(NKS: {html.escape(m['nks'] or '-')})</span></div>
                        <div class="meta-val">⚖️ Berat: <b>{html.escape(str(m['beratbersih'] or '-'))} kg</b> · Rumpun: {html.escape(str(m['jmlhrumpun'] or '-'))}</div>
                        <div class="meta-id">{html.escape(m['assignmentId'][:18])}...</div>
                    </div>
                </div>
                """
            )

        tag_class = "pill-danger" if c["jumlah_petugas"] > 1 else ("pill-warning" if len(c["daftar_subround"]) > 3 else "pill-indigo")

        cluster_cards_html.append(
            f"""
            <div class="card cluster-card"
                 data-scens="{html.escape(c['skenario_terlibat'])}"
                 data-jenis="{html.escape(c['daftar_jenis_foto'])}"
                 data-size="{c['jumlah_foto']}"
                 data-pcls="{c['jumlah_petugas']}">
                <div class="card-header">
                    <div class="header-left">
                        <span class="cluster-id">{html.escape(c['cluster_id'])}</span>
                        <span class="pill {tag_class}">{c['jumlah_foto']} Foto Sama</span>
                        <span class="pill pill-outline">{html.escape(c['primary_tag'])}</span>
                        <span class="pill pill-outline">Subround: {html.escape(c['daftar_subround'])}</span>
                        <span class="pill pill-outline">Jenis: {html.escape(c['daftar_jenis_foto'])}</span>
                    </div>
                    <div class="header-right">
                        Kecamatan: <strong>{html.escape(c['daftar_kecamatan'])}</strong> ·
                        Petugas ({c['jumlah_petugas']}): <strong>{html.escape(c['daftar_petugas'])}</strong>
                    </div>
                </div>
                <div class="cluster-grid">
                    {''.join(member_items_html)}
                </div>
            </div>
            """
        )

    # Render Kartu PASANGAN (2 Foto Berdampingan + Detail Metrik)
    pair_cards_html = []
    for f in findings:
        kat = f["kategori_temuan"]
        kat_class = "pill-danger" if kat.startswith("1.") else ("pill-warning" if kat.startswith("2.") else "pill-info")
        rel1 = "../" + f["relpath_1"]
        rel2 = "../" + f["relpath_2"]
        cap1 = html.escape(f"[{f['sr_1']} - {f['jenis_1']}] {f['pcl_1']} | {f['kec_1']} - {f['desa_1']} | KK: {f['namakk_1']}")
        cap2 = html.escape(f"[{f['sr_2']} - {f['jenis_2']}] {f['pcl_2']} | {f['kec_2']} - {f['desa_2']} | KK: {f['namakk_2']}")

        pair_cards_html.append(
            f"""
            <div class="card pair-card"
                 data-scen="{html.escape(f['skenario_kode'])}"
                 data-kat="{html.escape(kat[:2])}"
                 data-jenis="{html.escape(f['jenis_1'])},{html.escape(f['jenis_2'])}">
                <div class="card-header">
                    <div class="header-left">
                        <span class="pill pill-indigo">{html.escape(f['skenario_kode'])}: {html.escape(f['skenario_deskripsi'])}</span>
                        <span class="pill {kat_class}">{html.escape(kat)}</span>
                    </div>
                    <div class="header-right">
                        Kemiripan: <strong>{f['skor_kemiripan_pct']}%</strong> · <span class="muted">{html.escape(f['metode_deteksi'])}</span>
                    </div>
                </div>
                <div class="pair-grid">
                    <div class="pair-item">
                        <div class="img-wrap pair-img" onclick="openLightbox('{html.escape(rel1)}', '{cap1}')">
                            <span class="img-sr-tag">{html.escape(f['sr_1'])} · {html.escape(f['jenis_1'])}</span>
                            <img src="{html.escape(rel1)}" loading="lazy" alt="Foto 1">
                        </div>
                        <div class="item-meta">
                            <div class="meta-pcl">👮 <b>{html.escape(str(f['pcl_1']))}</b></div>
                            <div class="meta-loc">📍 {html.escape(str(f['kec_1']))} - {html.escape(str(f['desa_1']))}</div>
                            <div class="meta-kk">👤 Sampel/KK: <b>{html.escape(str(f['namakk_1']))}</b> (NKS: {html.escape(str(f['nks_1']))})</div>
                            <div class="meta-val">⚖️ Berat: <b>{html.escape(str(f['berat_1']))} kg</b> · Rumpun: {html.escape(str(f['rumpun_1']))}</div>
                            <div class="meta-id">Resolusi: {html.escape(f['res_1'])} · ID: {html.escape(str(f['assign_1']))}</div>
                        </div>
                    </div>
                    <div class="pair-item">
                        <div class="img-wrap pair-img" onclick="openLightbox('{html.escape(rel2)}', '{cap2}')">
                            <span class="img-sr-tag">{html.escape(f['sr_2'])} · {html.escape(f['jenis_2'])}</span>
                            <img src="{html.escape(rel2)}" loading="lazy" alt="Foto 2">
                        </div>
                        <div class="item-meta">
                            <div class="meta-pcl">👮 <b>{html.escape(str(f['pcl_2']))}</b></div>
                            <div class="meta-loc">📍 {html.escape(str(f['kec_2']))} - {html.escape(str(f['desa_2']))}</div>
                            <div class="meta-kk">👤 Sampel/KK: <b>{html.escape(str(f['namakk_2']))}</b> (NKS: {html.escape(str(f['nks_2']))})</div>
                            <div class="meta-val">⚖️ Berat: <b>{html.escape(str(f['berat_2']))} kg</b> · Rumpun: {html.escape(str(f['rumpun_2']))}</div>
                            <div class="meta-id">Resolusi: {html.escape(f['res_2'])} · ID: {html.escape(str(f['assign_2']))}</div>
                        </div>
                    </div>
                </div>
            </div>
            """
        )

    html_content = f"""<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quality Assurance Foto Ubinan KSA - BPS Kabupaten Garut</title>
<style>
  :root {{
    --bg: #f8fafc;
    --surface: #ffffff;
    --border: #e2e8f0;
    --text: #0f172a;
    --muted: #64748b;
    --primary: #2563eb;
    --primary-dark: #1d4ed8;
    --indigo-bg: #eef2ff;
    --indigo-txt: #3730a3;
    --danger-bg: #fef2f2;
    --danger-txt: #b91c1c;
    --warn-bg: #fffbeb;
    --warn-txt: #b45309;
    --info-bg: #f0f9ff;
    --info-txt: #0369a1;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
    background: var(--bg);
    color: var(--text);
    margin: 0;
    padding: 0;
    line-height: 1.5;
  }}
  /* Top Navigation Bar */
  .topbar {{
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 16px 28px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    position: sticky;
    top: 0;
    z-index: 50;
  }}
  .brand {{
    display: flex;
    align-items: center;
    gap: 12px;
  }}
  .brand-logo {{
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: linear-gradient(135deg, #2563eb, #1e40af);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 16px;
  }}
  .brand-title h1 {{
    font-size: 17px;
    font-weight: 700;
    margin: 0;
    color: var(--text);
  }}
  .brand-title p {{
    font-size: 12px;
    color: var(--muted);
    margin: 0;
  }}
  .nav-tabs {{
    display: flex;
    gap: 6px;
    background: #f1f5f9;
    padding: 4px;
    border-radius: 10px;
  }}
  .tab-btn {{
    border: none;
    background: transparent;
    padding: 8px 16px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }}
  .tab-btn.active {{
    background: var(--surface);
    color: var(--primary);
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }}
  .container {{
    max-width: 1400px;
    margin: 0 auto;
    padding: 24px 28px;
  }}
  /* KPI Cards */
  .kpi-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }}
  .kpi-card {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 18px 20px;
  }}
  .kpi-label {{
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }}
  .kpi-value {{
    font-size: 28px;
    font-weight: 800;
    margin: 6px 0 2px;
    color: var(--text);
  }}
  .kpi-sub {{
    font-size: 12px;
    color: var(--muted);
  }}
  /* Filter Bar */
  .filter-bar {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px 18px;
    margin-bottom: 20px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }}
  .filter-group {{
    display: flex;
    flex-direction: column;
    gap: 4px;
  }}
  .filter-group label {{
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
  }}
  select, input[type="text"] {{
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid #cbd5e1;
    font-size: 13px;
    background: #fff;
    color: var(--text);
    min-width: 170px;
  }}
  input[type="text"] {{
    min-width: 240px;
  }}
  .btn-reset {{
    margin-top: 18px;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: #f8fafc;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    color: var(--muted);
  }}
  .btn-reset:hover {{
    background: #e2e8f0;
    color: var(--text);
  }}
  .result-counter {{
    margin-left: auto;
    font-size: 13px;
    font-weight: 600;
    color: var(--primary);
  }}
  /* Tables in Executive Summary */
  .exec-grid {{
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 20px;
    margin-bottom: 24px;
  }}
  @media (max-width: 1024px) {{
    .exec-grid {{ grid-template-columns: 1fr; }}
  }}
  .panel {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
  }}
  .panel h2 {{
    font-size: 15px;
    font-weight: 700;
    margin: 0 0 6px;
  }}
  .panel p.sub {{
    font-size: 12px;
    color: var(--muted);
    margin: 0 0 14px;
  }}
  table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }}
  th, td {{
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }}
  th {{
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--muted);
    background: #f8fafc;
  }}
  tr:hover td {{
    background: #f1f5f9;
  }}
  .text-center {{ text-align: center; }}
  /* Pills & Badges */
  .pill {{
    display: inline-block;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }}
  .pill-indigo {{ background: var(--indigo-bg); color: var(--indigo-txt); }}
  .pill-danger {{ background: var(--danger-bg); color: var(--danger-txt); }}
  .pill-warning {{ background: var(--warn-bg); color: var(--warn-txt); }}
  .pill-info {{ background: var(--info-bg); color: var(--info-txt); }}
  .pill-outline {{ background: #f8fafc; color: #334155; border: 1px solid #cbd5e1; }}
  /* Cards (Cluster & Pair) */
  .card {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    margin-bottom: 16px;
    overflow: hidden;
    transition: box-shadow 0.15s ease;
  }}
  .card:hover {{
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
  }}
  .card-header {{
    padding: 12px 18px;
    background: #f8fafc;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }}
  .header-left {{
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }}
  .cluster-id {{
    font-family: monospace;
    font-weight: 700;
    font-size: 13px;
    color: var(--text);
    background: #e2e8f0;
    padding: 3px 8px;
    border-radius: 6px;
  }}
  .header-right {{
    font-size: 12px;
    color: #334155;
  }}
  /* Multi-photo Cluster Grid */
  .cluster-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(235px, 1fr));
    gap: 14px;
    padding: 16px;
  }}
  .cluster-photo-item {{
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
    display: flex;
    flex-direction: column;
  }}
  .img-wrap {{
    position: relative;
    width: 100%;
    height: 210px;
    background: #0f172a;
    cursor: zoom-in;
    overflow: hidden;
  }}
  .img-wrap img {{
    width: 100%;
    height: 100%;
    object-fit: contain;
    transition: transform 0.2s ease;
  }}
  .img-wrap:hover img {{
    transform: scale(1.03);
  }}
  .img-num {{
    position: absolute;
    top: 8px;
    left: 8px;
    background: rgba(15, 23, 42, 0.78);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 5px;
    z-index: 2;
  }}
  .img-sr-tag {{
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(37, 99, 235, 0.88);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 5px;
    z-index: 2;
  }}
  .item-meta {{
    padding: 10px 12px;
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }}
  .meta-pcl {{ font-weight: 700; color: var(--text); }}
  .meta-loc {{ color: #334155; font-weight: 500; }}
  .meta-kk {{ color: #334155; }}
  .meta-val {{ color: #0f172a; margin-top: 2px; }}
  .meta-id {{ font-family: monospace; font-size: 10px; color: var(--muted); margin-top: 3px; }}
  .muted {{ color: var(--muted); }}
  /* Pair Grid */
  .pair-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    padding: 16px;
  }}
  @media (max-width: 768px) {{
    .pair-grid {{ grid-template-columns: 1fr; }}
  }}
  .pair-item {{
    display: flex;
    gap: 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px;
    background: #fcfcfd;
  }}
  .pair-img {{
    width: 200px;
    height: 210px;
    flex-shrink: 0;
    border-radius: 8px;
  }}
  /* Lightbox Modal */
  .lightbox {{
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.88);
    z-index: 1000;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }}
  .lightbox.open {{ display: flex; }}
  .lightbox img {{
    max-width: 92vw;
    max-height: 82vh;
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    background: #000;
  }}
  .lightbox-caption {{
    margin-top: 12px;
    color: #f8fafc;
    font-size: 14px;
    font-weight: 500;
    background: rgba(0,0,0,0.6);
    padding: 8px 16px;
    border-radius: 8px;
  }}
  .lightbox-close {{
    position: absolute;
    top: 20px;
    right: 28px;
    background: rgba(255,255,255,0.15);
    color: #fff;
    border: none;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    font-size: 20px;
    cursor: pointer;
  }}
  .tab-section {{ display: none; }}
  .tab-section.active {{ display: block; }}
</style>
</head>
<body>

  <!-- Topbar -->
  <div class="topbar">
    <div class="brand">
      <div class="brand-logo">KSA</div>
      <div class="brand-title">
        <h1>Audit & Deteksi Duplikasi Foto Ubinan</h1>
        <p>BPS Kabupaten Garut · Sistem Kendali Mutu Dokumentasi FASIH-SM</p>
      </div>
    </div>
    <div class="nav-tabs">
      <button class="tab-btn active" id="btnTabExec" onclick="showTab('exec')">📊 Ringkasan Eksekutif</button>
      <button class="tab-btn" id="btnTabClusters" onclick="showTab('clusters')">🗂️ Kelompok Foto Sama ({len(clusters)} Grup)</button>
      <button class="tab-btn" id="btnTabPairs" onclick="showTab('pairs')">🔍 Perbandingan Berpasangan ({len(findings)})</button>
    </div>
  </div>

  <div class="container">
    <!-- KPI Row -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Total Foto Diperiksa</div>
        <div class="kpi-value">{total_photos}</div>
        <div class="kpi-sub">Dari {len(completeness)} Assignment Ubinan</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Kelompok (Cluster) Duplikat</div>
        <div class="kpi-value" style="color:var(--primary)">{len(clusters)}</div>
        <div class="kpi-sub">{multi_photo_clusters} grup berisi ≥ 3 foto sekaligus</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Grup Lintas Petugas</div>
        <div class="kpi-value" style="color:var(--danger-txt)">{cross_pcl_clusters}</div>
        <div class="kpi-sub">Foto yang sama dipakai ≥ 2 petugas berbeda</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Pasangan File Identik 100%</div>
        <div class="kpi-value" style="color:var(--warn-txt)">{exact_pairs}</div>
        <div class="kpi-sub">Total keseluruhan: {len(findings)} pasangan</div>
      </div>
    </div>

    <!-- TAB 1: RINGKASAN EKSEKUTIF -->
    <div id="tab-exec" class="tab-section active">
      <div class="exec-grid">
        <div class="panel">
          <h2>Matriks Temuan Berdasarkan Skenario Pemeriksaan</h2>
          <p class="sub">Klik pada baris skenario untuk melihat langsung daftar foto yang terindikasi.</p>
          <table>
            <thead>
              <tr>
                <th>Kode</th>
                <th>Skenario Pemeriksaan</th>
                <th class="text-center">Identik Biner (SHA-256)</th>
                <th class="text-center">Kompresi / Resave</th>
                <th class="text-center">Objek Sama (Crop/Geser)</th>
                <th class="text-center">Total Pasangan</th>
              </tr>
            </thead>
            <tbody>
              {''.join(scen_rows_html)}
            </tbody>
          </table>
        </div>

        <div class="panel">
          <h2>Sebaran Kelompok Duplikasi per Kecamatan (Top 12)</h2>
          <p class="sub">Klik pada nama kecamatan untuk memfilter kelompok foto di kecamatan tersebut.</p>
          <table>
            <thead>
              <tr>
                <th>Kecamatan</th>
                <th class="text-center">Jumlah Grup</th>
                <th class="text-center">Foto Terlibat</th>
                <th class="text-center">Petugas Terlibat</th>
              </tr>
            </thead>
            <tbody>
              {''.join(kec_rows_html)}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <h2>Metodologi Pemeriksaan 3 Tahap (Bebas Bias Watermark)</h2>
        <p class="sub" style="margin-bottom:0">
          1. <strong>Pemotongan Area Watermark (Content-Area Cropping)</strong>: Memotong 26% bagian bawah gambar (tempat logo FASIH/Timemark dan koordinat GPS berada) agar algoritma fokus 100% pada objek sawah, petak, sketsa, atau layar timbangan.<br>
          2. <strong>Sidik Jari Biner (SHA-256) & Multi-Perceptual Hash (pHash/dHash + Rotasi)</strong>: Menangkap file yang identik 100% maupun yang telah dikompres ulang oleh aplikasi/WhatsApp atau diputar.<br>
          3. <strong>Pencocokan Titik Fitur Visual (OpenCV ORB + RANSAC Inliers)</strong>: Menangkap foto yang diambil di lokasi/timbangan yang sama secara beruntun, di-crop, atau diganti teks tanggal watermark-nya.
        </p>
      </div>
    </div>

    <!-- TAB 2: TAMPILAN KELOMPOK / CLUSTER (MULTI-FOTO) -->
    <div id="tab-clusters" class="tab-section">
      <div class="filter-bar">
        <div class="filter-group">
          <label>Skenario dalam Grup</label>
          <select id="cScen" onchange="filterClusters()">
            <option value="">Semua Grup ({len(clusters)})</option>
            <option value="Skenario 1">Skenario 1 - Antar Petugas (SR Sama)</option>
            <option value="Skenario 2">Skenario 2 - Petugas Sama (Lintas SR)</option>
            <option value="Skenario 3">Skenario 3 - Antar Petugas (Lintas SR)</option>
            <option value="Skenario 4">Skenario 4 - Petugas Sama (Beda Sampel)</option>
            <option value="Skenario 5A">Skenario 5A - Lintas Jenis (1 Sampel)</option>
            <option value="Skenario 5B">Skenario 5B - Lintas Jenis (Beda Sampel)</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Jumlah Foto dalam Grup</label>
          <select id="cSize" onchange="filterClusters()">
            <option value="0">Semua Ukuran (≥ 2 Foto)</option>
            <option value="3">Khusus Multi-Duplikat (≥ 3 Foto)</option>
            <option value="5">Duplikasi Masif (≥ 5 Foto)</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Keterlibatan Petugas</label>
          <select id="cPcl" onchange="filterClusters()">
            <option value="0">Semua</option>
            <option value="2">Lintas Petugas (≥ 2 Petugas Berbeda)</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Jenis Foto</label>
          <select id="cJenis" onchange="filterClusters()">
            <option value="">Semua Jenis</option>
            <option value="fotobidang">fotobidang (Sketsa)</option>
            <option value="foto_petak">foto_petak</option>
            <option value="fotoplot">fotoplot</option>
            <option value="fotoberat">fotoberat (Timbangan)</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Cari Petugas / Kecamatan / Desa / KK</label>
          <input type="text" id="cSearch" oninput="filterClusters()" placeholder="Ketik nama petugas, kecamatan, KK...">
        </div>
        <button class="btn-reset" onclick="resetClusterFilter()">Reset</button>
        <div class="result-counter" id="clusterCountLabel">Menampilkan {len(clusters)} grup</div>
      </div>

      <div id="clustersContainer">
        {''.join(cluster_cards_html)}
      </div>
    </div>

    <!-- TAB 3: TAMPILAN PER PASANGAN (2 FOTO) -->
    <div id="tab-pairs" class="tab-section">
      <div class="filter-bar">
        <div class="filter-group">
          <label>Filter Skenario</label>
          <select id="pScen" onchange="filterPairs()">
            <option value="">Semua Skenario ({len(findings)})</option>
            <option value="Skenario 1">Skenario 1 - Antar Petugas (SR Sama)</option>
            <option value="Skenario 2">Skenario 2 - Petugas Sama (Lintas SR)</option>
            <option value="Skenario 3">Skenario 3 - Antar Petugas (Lintas SR)</option>
            <option value="Skenario 4">Skenario 4 - Petugas Sama (Beda Sampel)</option>
            <option value="Skenario 5A">Skenario 5A - Lintas Jenis (1 Sampel)</option>
            <option value="Skenario 5B">Skenario 5B - Lintas Jenis (Beda Sampel)</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Tingkat Deteksi</label>
          <select id="pKat" onchange="filterPairs()">
            <option value="">Semua Tingkat</option>
            <option value="1.">1. Identik 100% (SHA-256)</option>
            <option value="2.">2. Foto Sama (Beda Kompresi)</option>
            <option value="3.">3. Objek Sama (Crop / Geser / Edit Watermark)</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Jenis Foto</label>
          <select id="pJenis" onchange="filterPairs()">
            <option value="">Semua Jenis</option>
            <option value="fotobidang">fotobidang</option>
            <option value="foto_petak">foto_petak</option>
            <option value="fotoplot">fotoplot</option>
            <option value="fotoberat">fotoberat</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Cari Petugas / Kecamatan / Desa / KK</label>
          <input type="text" id="pSearch" oninput="filterPairs()" placeholder="Ketik nama petugas, kecamatan, KK...">
        </div>
        <button class="btn-reset" onclick="resetPairFilter()">Reset</button>
        <div class="result-counter" id="pairCountLabel">Menampilkan {len(findings)} pasangan</div>
      </div>

      <div id="pairsContainer">
        {''.join(pair_cards_html)}
      </div>
    </div>
  </div>

  <!-- Lightbox Modal untuk Perbesar Foto -->
  <div class="lightbox" id="lightboxModal" onclick="closeLightbox()">
    <button class="lightbox-close" onclick="closeLightbox()">×</button>
    <img id="lightboxImg" src="" alt="Preview">
    <div class="lightbox-caption" id="lightboxCap"></div>
  </div>

<script>
function showTab(name) {{
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'exec') document.getElementById('btnTabExec').classList.add('active');
  if (name === 'clusters') document.getElementById('btnTabClusters').classList.add('active');
  if (name === 'pairs') document.getElementById('btnTabPairs').classList.add('active');
  window.scrollTo({{ top: 0, behavior: 'smooth' }});
}}

function switchTabAndFilter(tabName, scenCode) {{
  showTab(tabName);
  if (tabName === 'pairs') {{
    document.getElementById('pScen').value = scenCode;
    filterPairs();
  }}
}}

function switchTabAndSearch(tabName, query) {{
  showTab(tabName);
  if (tabName === 'clusters') {{
    document.getElementById('cSearch').value = query;
    filterClusters();
  }}
}}

function filterClusters() {{
  const scen = document.getElementById('cScen').value;
  const minSize = parseInt(document.getElementById('cSize').value || '0', 10);
  const minPcl = parseInt(document.getElementById('cPcl').value || '0', 10);
  const jenis = document.getElementById('cJenis').value;
  const q = document.getElementById('cSearch').value.toLowerCase();

  let shown = 0;
  document.querySelectorAll('.cluster-card').forEach(card => {{
    const okScen = !scen || card.dataset.scens.includes(scen);
    const okSize = parseInt(card.dataset.size, 10) >= minSize;
    const okPcl = parseInt(card.dataset.pcls, 10) >= minPcl;
    const okJenis = !jenis || card.dataset.jenis.includes(jenis);
    const okQ = !q || card.innerText.toLowerCase().includes(q);
    if (okScen && okSize && okPcl && okJenis && okQ) {{
      card.style.display = '';
      shown++;
    }} else {{
      card.style.display = 'none';
    }}
  }});
  document.getElementById('clusterCountLabel').innerText = 'Menampilkan ' + shown + ' grup';
}}

function resetClusterFilter() {{
  document.getElementById('cScen').value = '';
  document.getElementById('cSize').value = '0';
  document.getElementById('cPcl').value = '0';
  document.getElementById('cJenis').value = '';
  document.getElementById('cSearch').value = '';
  filterClusters();
}}

function filterPairs() {{
  const scen = document.getElementById('pScen').value;
  const kat = document.getElementById('pKat').value;
  const jenis = document.getElementById('pJenis').value;
  const q = document.getElementById('pSearch').value.toLowerCase();

  let shown = 0;
  document.querySelectorAll('.pair-card').forEach(card => {{
    const okScen = !scen || card.dataset.scen === scen;
    const okKat = !kat || card.dataset.kat === kat;
    const okJenis = !jenis || card.dataset.jenis.includes(jenis);
    const okQ = !q || card.innerText.toLowerCase().includes(q);
    if (okScen && okKat && okJenis && okQ) {{
      card.style.display = '';
      shown++;
    }} else {{
      card.style.display = 'none';
    }}
  }});
  document.getElementById('pairCountLabel').innerText = 'Menampilkan ' + shown + ' pasangan';
}}

function resetPairFilter() {{
  document.getElementById('pScen').value = '';
  document.getElementById('pKat').value = '';
  document.getElementById('pJenis').value = '';
  document.getElementById('pSearch').value = '';
  filterPairs();
}}

function openLightbox(src, caption) {{
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightboxCap').innerText = caption;
  document.getElementById('lightboxModal').classList.add('open');
}}

function closeLightbox() {{
  document.getElementById('lightboxModal').classList.remove('open');
  document.getElementById('lightboxImg').src = '';
}}

document.addEventListener('keydown', e => {{
  if (e.key === 'Escape') closeLightbox();
}});
</script>
</body>
</html>"""

    os.makedirs("hasil_analisis", exist_ok=True)
    with open("hasil_analisis/laporan_duplikasi_ubinan.html", "w", encoding="utf-8") as f:
        f.write(html_content)


def main():
    print("[1/4] Membaca metadata JSON dan memetakan file foto di S2 & S3 (serta S1 jika ada)...")
    photo_records, completeness_records = build_dataset()
    print(f"   -> Total assignment di JSON : {len(completeness_records)}")
    print(f"   -> Total file foto fisik    : {len(photo_records)}")

    print("[2/4] Menghitung SHA-256 & Content-Area Perceptual Hash (bebas watermark)...")
    with ThreadPoolExecutor(max_workers=8) as pool:
        photo_records = list(pool.map(process_single_image, photo_records))

    valid_photos = [p for p in photo_records if p.get("valid")]
    valid_by_path = {p["relpath"]: p for p in valid_photos}
    print(f"   -> Foto valid berhasil diproses: {len(valid_photos)} / {len(photo_records)}")

    os.makedirs("hasil_analisis", exist_ok=True)
    df_index = pd.DataFrame(
        [
            {
                **{k: v for k, v in p.items() if k not in ("phash", "dhash", "phash_variants", "phash_full", "dhash_full")},
                "phash_full_hex": f"{p['phash_full']:016x}",
                "dhash_full_hex": f"{p['dhash_full']:016x}",
                "phash_variants_hex": json.dumps([f"{v:016x}" for v in p["phash_variants"]]),
            }
            for p in valid_photos
        ]
    )
    df_index.to_csv("hasil_analisis/tabel_indeks_foto.csv", index=False)
    pd.DataFrame(completeness_records).to_csv("hasil_analisis/laporan_kelengkapan_foto.csv", index=False)

    print("[3/4] Menyaring kandidat & menjalankan verifikasi Content-Area ORB + Korelasi Piksel...")
    n = len(valid_photos)
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

    print(f"   -> Terjaring {len(candidates)} kandidat. Memverifikasi area objek (tanpa watermark)...")

    verified_findings = []
    for p1, p2, ctype, dist_p, dist_d, rot_label in candidates:
        if ctype == "EXACT_SHA256":
            kategori = "1. Duplikat Identik 100% (SHA-256)"
            metode = "EXACT_SHA256 (File Biner Sama Persis)"
            sim_pct = 100.0
            inliers = 999
            pixel_corr = 1.0
            spread = 1.0
        else:
            v = verify_content_orb_and_pixel(p1["filepath"], p2["filepath"], p1["jenis_foto"], p2["jenis_foto"])
            inliers = v["inliers"]
            ratio = v["inlier_ratio"]
            pixel_corr = v["pixel_corr"]
            spread = v["spatial_spread"]

            is_sketsa = p1["jenis_foto"] == "fotobidang" or p2["jenis_foto"] == "fotobidang"

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
                # Foto 1
                "sr_1": p1["subround"],
                "jenis_1": p1["jenis_foto"],
                "pcl_1": p1["pcl"],
                "kec_1": p1["kecamatan"],
                "desa_1": p1["desa"],
                "nks_1": p1["nks"],
                "namakk_1": p1["namakk"],
                "berat_1": p1["beratbersih"],
                "rumpun_1": p1["jmlhrumpun"],
                "status_1": p1["status_assignment"],
                "assign_1": p1["assignmentId"],
                "relpath_1": p1["relpath"],
                "res_1": f"{p1['width']}x{p1['height']}",
                # Foto 2
                "sr_2": p2["subround"],
                "jenis_2": p2["jenis_foto"],
                "pcl_2": p2["pcl"],
                "kec_2": p2["kecamatan"],
                "desa_2": p2["desa"],
                "nks_2": p2["nks"],
                "namakk_2": p2["namakk"],
                "berat_2": p2["beratbersih"],
                "rumpun_2": p2["jmlhrumpun"],
                "status_2": p2["status_assignment"],
                "assign_2": p2["assignmentId"],
                "relpath_2": p2["relpath"],
                "res_2": f"{p2['width']}x{p2['height']}",
            }
        )

    verified_findings.sort(
        key=lambda x: (
            x["kategori_temuan"],
            x["skenario_kode"],
            -x["skor_kemiripan_pct"],
            -x["orb_ransac_inliers"],
        )
    )

    df_findings = pd.DataFrame(verified_findings)
    df_findings.to_csv("hasil_analisis/temuan_duplikasi_foto.csv", index=False)

    clusters = build_clusters(verified_findings, valid_by_path)
    df_clusters = pd.DataFrame(
        [
            {
                "cluster_id": c["cluster_id"],
                "jumlah_foto": c["jumlah_foto"],
                "jumlah_petugas": c["jumlah_petugas"],
                "daftar_petugas": c["daftar_petugas"],
                "daftar_kecamatan": c["daftar_kecamatan"],
                "daftar_subround": c["daftar_subround"],
                "daftar_jenis_foto": c["daftar_jenis_foto"],
                "skenario_terlibat": c["skenario_terlibat"],
                "detail_assignment": " | ".join(
                    f"[{m['subround']}-{m['jenis_foto']}] {m['pcl']} ({m['desa']} - KK:{m['namakk']})"
                    for m in c["members"]
                ),
            }
            for c in clusters
        ]
    )
    df_clusters.to_csv("hasil_analisis/kelompok_cluster_duplikasi.csv", index=False)

    # Simpan juga payload JSON lengkap untuk aplikasi Next.js & sinkronisasi Supabase
    web_payload = {
        "summary": {
            "id": "latest",
            "total_photos": len(valid_photos),
            "total_assignments": len(completeness_records),
            "total_pairs": len(verified_findings),
            "total_clusters": len(clusters),
            "multi_photo_clusters": sum(1 for c in clusters if c["jumlah_foto"] >= 3),
            "cross_pcl_clusters": sum(1 for c in clusters if c["jumlah_petugas"] >= 2),
            "exact_pairs": sum(1 for f in verified_findings if f["kategori_temuan"].startswith("1.")),
        },
        "clusters": [
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
                        "image_url": f"/api/local-image?path={m['relpath']}",
                    }
                    for m in c["members"]
                ],
            }
            for c in clusters
        ],
        "pairs": [
            {
                **f,
                "image_url_1": f"/api/local-image?path={f['relpath_1']}",
                "image_url_2": f"/api/local-image?path={f['relpath_2']}",
            }
            for f in verified_findings
        ],
    }
    with open("hasil_analisis/web_data.json", "w", encoding="utf-8") as fw:
        json.dump(web_payload, fw, ensure_ascii=False, indent=2)

    generate_html_report(verified_findings, clusters, completeness_records, len(valid_photos))
    print(f"\n[4/4] Dashboard HTML Modern berhasil diperbarui di hasil_analisis/laporan_duplikasi_ubinan.html!")


if __name__ == "__main__":
    main()
