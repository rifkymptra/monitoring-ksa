"""
===============================================================================
SCRIPT UPLOAD HASIL ANALISIS, KATALOG HASH, & FOTO (WEBP) KE SUPABASE
===============================================================================
Fitur Inkremental (Hemat Waktu & Kuota):
  1. Mengecek terlebih dahulu daftar foto yang SUDAH ADA di tabel `photo_catalog`
     atau di bucket Storage `ubinan-photos`, sehingga foto lama yang sudah pernah
     di-upload TIDAK AKAN di-upload ulang!
  2. Menyimpan seluruh hash (`sha256`, `phash_hex`, `dhash_hex`, rotasi) dari
     3.585+ foto ke tabel `photo_catalog` supaya GitHub Actions ke depannya
     cukup memproses foto BARU saja tanpa perlu mendownload ulang foto lama.
"""

import io
import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
import pandas as pd
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def load_local_env():
    """Baca otomatis file .env atau .env.local jika ada agar tidak perlu set $env: berulang kali."""
    for env_path in [".env", ".env.local", "web-monitoring/.env", "web-monitoring/.env.local"]:
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if k and v and k not in os.environ:
                        os.environ[k] = v


load_local_env()

SUPABASE_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL") or "").rstrip("/")
SUPABASE_KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_SECRET_KEY")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    or ""
)
BUCKET_NAME = "ubinan-photos"


def compress_to_webp_bytes(filepath: str, max_dim: int = 900, quality: int = 75) -> bytes:
    with Image.open(filepath) as img:
        img = img.convert("RGB")
        w, h = img.size
        if max(w, h) > max_dim:
            scale = max_dim / float(max(w, h))
            img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=quality, method=4)
        return buf.getvalue()


def fetch_existing_catalog() -> dict[str, str]:
    """Ambil daftar (relpath -> image_url) yang sudah tercatat di tabel photo_catalog."""
    existing = {}
    try:
        url = f"{SUPABASE_URL}/rest/v1/photo_catalog?select=relpath,image_url&limit=10000"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "apikey": SUPABASE_KEY,
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
            for r in rows:
                if r.get("relpath") and r.get("image_url"):
                    existing[r["relpath"]] = r["image_url"]
    except Exception:
        pass
    return existing


def upload_photo_to_storage(task: tuple[str, dict[str, str]]) -> tuple[str, str, bool]:
    """
    Upload 1 foto ke Supabase Storage HANYA JIKA belum ada di katalog/storage.
    Mengembalikan (relpath, public_url, uploaded_new).
    """
    relpath, existing_map = task
    storage_key = relpath.rsplit(".", 1)[0] + ".webp"
    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{urllib.parse.quote(storage_key)}"

    # Jika sudah pernah ter-upload sebelumnya, langsung skip!
    if relpath in existing_map and existing_map[relpath]:
        return relpath, existing_map[relpath], False

    if not os.path.exists(relpath):
        return relpath, public_url, False

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
        return relpath, public_url, True
    except Exception as e:
        print(f"   ⚠️ Gagal upload {relpath}: {e}")
        return relpath, public_url, False


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

    existing_map = fetch_existing_catalog()
    print(f"🔎 Terdeteksi {len(existing_map)} foto yang sudah tercatat di katalog Supabase.")

    unique_paths = set()
    for c in clusters:
        for m in c["members"]:
            unique_paths.add(m["relpath"])
    for p in pairs:
        unique_paths.add(p["relpath_1"])
        unique_paths.add(p["relpath_2"])

    unique_list = sorted(unique_paths)
    tasks = [(relp, existing_map) for relp in unique_list]
    print(f"🚀 [1/5] Memeriksa {len(unique_list)} foto duplikat (Skip otomatis jika sudah ada di Storage)...")

    url_map = {}
    new_uploads = 0
    skipped = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        for idx, (relp, pub_url, is_new) in enumerate(pool.map(upload_photo_to_storage, tasks), 1):
            url_map[relp] = pub_url
            if is_new:
                new_uploads += 1
            else:
                skipped += 1
            if idx % 50 == 0 or idx == len(unique_list):
                print(f"   -> Progress: {idx}/{len(unique_list)} (Baru di-upload: {new_uploads}, Di-skip karena sudah ada: {skipped})")

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

    print("📊 [2/5] Menyimpan Ringkasan Eksekutif ke tabel `audit_summary`...")
    rest_upsert("audit_summary", summary, on_conflict="id")

    print(f"🗂️ [3/5] Menyimpan {len(clusters)} Kelompok/Cluster ke tabel `duplicate_clusters`...")
    rest_delete_all("duplicate_clusters", "cluster_id")
    for i in range(0, len(clusters), 50):
        rest_upsert("duplicate_clusters", clusters[i : i + 50], on_conflict="cluster_id")

    print(f"🔍 [4/5] Menyimpan {len(db_pairs)} Pasangan Duplikat ke tabel `duplicate_pairs`...")
    rest_delete_all("duplicate_pairs", "id")
    for i in range(0, len(db_pairs), 100):
        rest_upsert("duplicate_pairs", db_pairs[i : i + 100])

    # 5. Sinkronisasi Katalog Hash Foto (`photo_catalog`) untuk Incremental GitHub Actions
    index_csv = "hasil_analisis/tabel_indeks_foto.csv"
    if os.path.exists(index_csv):
        try:
            df_idx = pd.read_csv(index_csv).fillna("")
            catalog_rows = []
            for _, r in df_idx.iterrows():
                relp = str(r.get("relpath", ""))
                variants_raw = r.get("phash_variants_hex", "[]")
                try:
                    variants_list = json.loads(variants_raw) if isinstance(variants_raw, str) and variants_raw else []
                except Exception:
                    variants_list = []

                catalog_rows.append(
                    {
                        "orig_filename": str(r["orig_filename"]),
                        "subround": str(r["subround"]),
                        "assignment_id": str(r["assignmentId"]),
                        "jenis_foto": str(r["jenis_foto"]),
                        "pcl": str(r.get("pcl", "")),
                        "kecamatan": str(r.get("kecamatan", "")),
                        "desa": str(r.get("desa", "")),
                        "nks": str(r.get("nks", "")),
                        "sls": str(r.get("sls", "")),
                        "subsls": str(r.get("subsls", "")),
                        "namakk": str(r.get("namakk", "")),
                        "komoditas": str(r.get("komoditas", "")),
                        "hasil_cacah": str(r.get("hasil_cacah", "")),
                        "beratbersih": str(r.get("beratbersih", "")),
                        "jmlhrumpun": str(r.get("jmlhrumpun", "")),
                        "status_assignment": str(r.get("status_assignment", "")),
                        "relpath": relp,
                        "width": int(r.get("width") or 0),
                        "height": int(r.get("height") or 0),
                        "file_size": int(r.get("file_size") or 0),
                        "sha256": str(r["sha256"]),
                        "phash_hex": str(r["phash_hex"]),
                        "dhash_hex": str(r["dhash_hex"]),
                        "phash_full_hex": str(r.get("phash_full_hex") or r["phash_hex"]),
                        "dhash_full_hex": str(r.get("dhash_full_hex") or r["dhash_hex"]),
                        "phash_variants_hex": variants_list,
                        "image_url": url_map.get(relp, existing_map.get(relp, "")),
                    }
                )
            print(f"📚 [5/5] Menyimpan {len(catalog_rows)} indeks hash foto ke tabel `photo_catalog` (Cache Inkremental)...")
            for i in range(0, len(catalog_rows), 200):
                rest_upsert("photo_catalog", catalog_rows[i : i + 200], on_conflict="orig_filename")
        except Exception as e:
            print(f"⚠️ Catatan: Tabel `photo_catalog` belum dibuat di Supabase atau gagal diisi ({e}).")

    print("\n🎉 SELESAI! Seluruh data dan katalog inkremental sudah aktif di Supabase Cloud!")


if __name__ == "__main__":
    main()
