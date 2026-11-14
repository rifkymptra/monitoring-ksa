"""
Script Pendamping: Download Foto dari File Rekap JSON Hasil Console Browser
---------------------------------------------------------------------------
Jika browser memblokir download langsung dari sisnas-fasih-assignment.obj.bps.go.id
karena CORS, jalankan script ini untuk mendownload semua foto dari file
`rekap_foto_ubinan_6f581089-c787-4c0f-a307-0564f1e4e293.json`.

Catatan: Server Object Storage S3/MinIO (`sisnas-fasih-assignment.obj.bps.go.id`)
menggunakan autentikasi AWS Signature di URL (Presigned URL) dan TIDAK menggunakan
proteksi sesi/bot halaman web FASIH-SM, sehingga 100% aman didownload dari sini.
"""

import json
import os
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

JSON_FILE = "rekap_foto_ubinan_6f581089-c787-4c0f-a307-0564f1e4e293.json"
OUTPUT_DIR = "hasil_foto_ubinan"
PHOTO_KEYS = ["fotobidang", "foto_petak", "fotoplot", "fotoberat"]


def safe_name(val: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', "_", str(val or "")).strip()


def download_one(task):
    url, filepath = task
    if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
        return True, filepath, "Sudah ada (skip)"
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36"
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, "wb") as f:
            f.write(data)
        return True, filepath, "Berhasil"
    except Exception as e:
        return False, filepath, str(e)


def main():
    if not os.path.exists(JSON_FILE):
        print(f"❌ File {JSON_FILE} tidak ditemukan di folder ini: {os.getcwd()}")
        print("Silakan pindahkan file JSON hasil download dari Console Browser ke folder ini.")
        return

    with open(JSON_FILE, "r", encoding="utf-8") as f:
        records = json.load(f)

    tasks = []
    for d in records:
        kec = safe_name(d.get("kecamatan")) or "TANPA_KEC"
        desa = safe_name(d.get("desa")) or "TANPA_DESA"
        nks = safe_name(d.get("nks"))
        namakk = safe_name(d.get("namakk"))

        folder = os.path.join(OUTPUT_DIR, kec)
        photos = d.get("photos") or {}

        for key in PHOTO_KEYS:
            p = photos.get(key)
            if p and p.get("presignedUrl"):
                fname = f"{desa}_{nks}_{namakk}__{key}__{p['fileName']}"
                filepath = os.path.join(folder, fname)
                tasks.append((p["presignedUrl"], filepath))

    print(f"🚀 Total foto yang akan didownload: {len(tasks)} foto")
    success = 0
    failed = 0

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(download_one, t) for t in tasks]
        for idx, fut in enumerate(as_completed(futures), 1):
            ok, path, msg = fut.result()
            if ok:
                success += 1
            else:
                failed += 1
                print(f"⚠️ Gagal [{path}]: {msg}")
            if idx % 20 == 0 or idx == len(tasks):
                print(f"   Progress: {idx}/{len(tasks)} (Berhasil: {success}, Gagal: {failed})")

    print(f"\n🎉 Selesai! {success} foto tersimpan di dalam folder '{OUTPUT_DIR}'.")


if __name__ == "__main__":
    main()

