"""
===============================================================================
SCRIPT UPLOAD HASIL ANALISIS & FOTO TERKOMPRESI (WEBP) KE SUPABASE
===============================================================================
Script ini mengunggah:
  1. Foto-foto yang terlibat duplikasi di S1/, S2/, S3/ -> dikompres otomatis ke
     format WebP (~35-50 KB per foto) lalu di-upload ke Supabase Storage bucket
     `ubinan-photos` agar sangat hemat kuota 1 GB gratis Supabase!
  2. Ringkasan Eksekutif -> tabel `audit_summary`
  3. Kelompok Duplikasi (Cluster) -> tabel `duplicate_clusters`
  4. Pasangan Duplikasi -> tabel `duplicate_pairs`

Cara Pakai:
  1. Jalankan dulu `supabase_schema.sql` di SQL Editor Supabase.
  2. Set variabel SUPABASE_URL dan SUPABASE_KEY di bawah (atau lewat environment variable),
     lalu jalankan:
       python sync_to_supabase.py
"""

import io
import json
import os
import sys
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Masukkan URL dan Anon/Service Role Key Supabase kamu di sini (atau via env)
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
BUCKET_NAME = "ubinan-photos"


def compress_to_webp_bytes(filepath: str, max_dim: int = 900, quality: int = 75) -> bytes:
    """Kompres foto JPG menjadi WebP (~40KB) agar 1GB Supabase muat puluhan ribu foto."""
    with Image.open(filepath) as img:
        img = img.convert("RGB")
        w, h = img.size
        if max(w, h) > max_dim:
            scale = max_dim / float(max(w, h))
            img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=quality, method=4)
        return buf.getvalue()


def upload_photo_to_storage(relpath: str) -> tuple[str, str]:
    """Upload 1 foto ke Supabase Storage dan kembalikan (relpath, public_url)."""
    storage_key = relpath.rsplit(".", 1)[0] + ".webp"
    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{urllib.parse.quote(storage_key)}"

    if not os.path.exists(relpath):
        return relpath, public_url

    try:
        webp_bytes = compress_to_webp_bytes(relpath)
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
    except Exception as e:
        print(f"   ⚠️ Gagal upload {relpath}: {e}")

    return relpath, public_url


def rest_upsert(table: str, payload, on_conflict: str = ""):
    q = f"?on_conflict={on_conflict}" if on_conflict else ""
    url = f"{SUPABASE_URL}/rest/v1/{table}{q}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "apikey": SUPABASE_KEY,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.status


def rest_delete_all(table: str, pk_col: str):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{pk_col}=not.is.null"
    req = urllib.request.Request(
        url,
        method="DELETE",
        headers={
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "apikey": SUPABASE_KEY,
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ SUPABASE_URL dan SUPABASE_KEY belum diisi!")
        print("Silakan jalankan dengan perintah:")
        print('  $env:NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"')
        print('  $env:NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbG..."')
        print("  python sync_to_supabase.py")
        return

    web_data_path = "hasil_analisis/web_data.json"
    if not os.path.exists(web_data_path):
        print("❌ File hasil_analisis/web_data.json belum ada. Jalankan `python analyze_photos.py` terlebih dahulu.")
        return

    with open(web_data_path, "r", encoding="utf-8") as f:
        web_data = json.load(f)

    clusters = web_data["clusters"]
    pairs = web_data["pairs"]
    summary = web_data["summary"]

    # Kumpulkan semua foto unik yang terlibat dalam duplikasi
    unique_paths = set()
    for c in clusters:
        for m in c["members"]:
            unique_paths.add(m["relpath"])
    for p in pairs:
        unique_paths.add(p["relpath_1"])
        unique_paths.add(p["relpath_2"])

    unique_list = sorted(unique_paths)
    print(f"🚀 [1/4] Mengompresi ke WebP & Mengunggah {len(unique_list)} foto unik ke Supabase Storage...")

    url_map = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for idx, (relp, pub_url) in enumerate(pool.map(upload_photo_to_storage, unique_list), 1):
            url_map[relp] = pub_url
            if idx % 25 == 0 or idx == len(unique_list):
                print(f"   -> Terunggah: {idx}/{len(unique_list)} foto")

    # Ganti image_url lokal dengan Public URL Supabase Storage
    for c in clusters:
        for m in c["members"]:
            m["image_url"] = url_map.get(m["relpath"], m["image_url"])

    db_pairs = []
    for p in pairs:
        row = {k: v for k, v in p.items()}
        row["image_url_1"] = url_map.get(p["relpath_1"], "")
        row["image_url_2"] = url_map.get(p["relpath_2"], "")
        row["berat_1"] = str(row.get("berat_1") or "")
        row["rumpun_1"] = str(row.get("rumpun_1") or "")
        row["berat_2"] = str(row.get("berat_2") or "")
        row["rumpun_2"] = str(row.get("rumpun_2") or "")
        db_pairs.append(row)

    print("📊 [2/4] Menyimpan Ringkasan Eksekutif ke tabel `audit_summary`...")
    rest_upsert("audit_summary", summary, on_conflict="id")

    print(f"🗂️ [3/4] Menyimpan {len(clusters)} Kelompok/Cluster ke tabel `duplicate_clusters`...")
    rest_delete_all("duplicate_clusters", "cluster_id")
    for i in range(0, len(clusters), 50):
        rest_upsert("duplicate_clusters", clusters[i : i + 50], on_conflict="cluster_id")

    print(f"🔍 [4/4] Menyimpan {len(db_pairs)} Pasangan Duplikat ke tabel `duplicate_pairs`...")
    rest_delete_all("duplicate_pairs", "id")
    for i in range(0, len(db_pairs), 100):
        rest_upsert("duplicate_pairs", db_pairs[i : i + 100])

    print("\n🎉 SELESAI! Seluruh foto dan data hasil analisis sudah aktif di Supabase Cloud!")


if __name__ == "__main__":
    main()

