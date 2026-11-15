-- ============================================================================
-- SCHEMA DATABASE SUPABASE UNTUK AUDIT FOTO UBINAN KSA (BPS KABUPATEN GARUT)
-- ============================================================================
-- Cara Pakai:
-- 1. Buka Dashboard Supabase Project kamu -> menu "SQL Editor"
-- 2. Klik "New Query", copy-paste seluruh isi file ini, lalu klik "Run".

-- 1. Tabel Ringkasan Eksekutif & Metadata Run
CREATE TABLE IF NOT EXISTS public.audit_summary (
    id TEXT PRIMARY KEY DEFAULT 'latest',
    total_photos INTEGER DEFAULT 0,
    total_assignments INTEGER DEFAULT 0,
    total_pairs INTEGER DEFAULT 0,
    total_clusters INTEGER DEFAULT 0,
    multi_photo_clusters INTEGER DEFAULT 0,
    cross_pcl_clusters INTEGER DEFAULT 0,
    exact_pairs INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabel Kelompok / Cluster Duplikasi (Multi-Foto 2 s.d. N Foto Sejajar)
CREATE TABLE IF NOT EXISTS public.duplicate_clusters (
    cluster_id TEXT PRIMARY KEY,
    jumlah_foto INTEGER NOT NULL,
    jumlah_petugas INTEGER NOT NULL,
    daftar_petugas TEXT,
    daftar_kecamatan TEXT,
    daftar_subround TEXT,
    daftar_jenis_foto TEXT,
    skenario_terlibat TEXT,
    kategori_terlibat TEXT,
    primary_tag TEXT,
    max_similarity NUMERIC,
    members JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabel Pasangan Duplikasi (1-on-1 Comparison)
CREATE TABLE IF NOT EXISTS public.duplicate_pairs (
    id SERIAL PRIMARY KEY,
    skenario_kode TEXT,
    skenario_deskripsi TEXT,
    kategori_temuan TEXT,
    skor_kemiripan_pct NUMERIC,
    metode_deteksi TEXT,
    orientasi TEXT,
    phash_dist INTEGER,
    dhash_dist INTEGER,
    pixel_corr NUMERIC,
    orb_ransac_inliers INTEGER,
    spatial_spread NUMERIC,
    -- Foto 1
    sr_1 TEXT,
    jenis_1 TEXT,
    pcl_1 TEXT,
    kec_1 TEXT,
    desa_1 TEXT,
    nks_1 TEXT,
    namakk_1 TEXT,
    berat_1 TEXT,
    rumpun_1 TEXT,
    status_1 TEXT,
    assign_1 TEXT,
    relpath_1 TEXT,
    image_url_1 TEXT,
    res_1 TEXT,
    -- Foto 2
    sr_2 TEXT,
    jenis_2 TEXT,
    pcl_2 TEXT,
    kec_2 TEXT,
    desa_2 TEXT,
    nks_2 TEXT,
    namakk_2 TEXT,
    berat_2 TEXT,
    rumpun_2 TEXT,
    status_2 TEXT,
    assign_2 TEXT,
    relpath_2 TEXT,
    image_url_2 TEXT,
    res_2 TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabel Antrean JSON Hasil Scrape dari Browser (untuk diproses GitHub Actions)
CREATE TABLE IF NOT EXISTS public.raw_scrape_uploads (
    id SERIAL PRIMARY KEY,
    subround TEXT NOT NULL,
    survey_period_id TEXT NOT NULL,
    total_assignments INTEGER NOT NULL,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'PENDING',
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabel Katalog Hash Foto (Incremental Cache agar tidak pernah download/proses ulang foto lama)
CREATE TABLE IF NOT EXISTS public.photo_catalog (
    orig_filename TEXT PRIMARY KEY,
    subround TEXT NOT NULL,
    assignment_id TEXT NOT NULL,
    jenis_foto TEXT NOT NULL,
    pcl TEXT,
    kecamatan TEXT,
    desa TEXT,
    nks TEXT,
    sls TEXT,
    subsls TEXT,
    namakk TEXT,
    komoditas TEXT,
    hasil_cacah TEXT,
    beratbersih TEXT,
    jmlhrumpun TEXT,
    status_assignment TEXT,
    relpath TEXT,
    width INTEGER,
    height INTEGER,
    file_size INTEGER,
    sha256 TEXT NOT NULL,
    phash_hex TEXT NOT NULL,
    dhash_hex TEXT NOT NULL,
    phash_full_hex TEXT,
    dhash_full_hex TEXT,
    phash_variants_hex JSONB DEFAULT '[]'::jsonb,
    image_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tabel Akun Pengguna & Hak Akses (Role: 'admin' atau 'user')
CREATE TABLE IF NOT EXISTS public.app_users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed 2 Akun Default:
-- 1) username: admin      | password default: ksa3205admin (Role: admin - akses penuh termasuk Tarik Data FASIH & Kelola User)
-- 2) username: pemeriksa  | password default: ksa3205      (Role: user  - akses seluruh hasil pemeriksaan kecuali Tarik Data FASIH)
INSERT INTO public.app_users (username, password_hash, full_name, role, is_active)
VALUES
    ('admin', '48f75826a8ba74f63cb666adcde90a86faabaa24b96cae86dda1f87665551e99', 'Administrator KSA BPS Garut', 'admin', true),
    ('pemeriksa', '66854a8a0f68c9d90650127eeb9bc9137630985956e70b257eb7329f9c15d514', 'Tim Pemeriksa KSA / Ubinan', 'user', true)
ON CONFLICT (username) DO NOTHING;

-- 7. Buat Storage Bucket Publik `ubinan-photos` untuk menyimpan foto WebP
INSERT INTO storage.buckets (id, name, public)
VALUES ('ubinan-photos', 'ubinan-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 8. Aktifkan Row Level Security (RLS)
ALTER TABLE public.audit_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicate_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicate_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_scrape_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access app_users" ON public.app_users;
CREATE POLICY "Public Access app_users" ON public.app_users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access photo_catalog" ON public.photo_catalog;
CREATE POLICY "Public Access photo_catalog" ON public.photo_catalog FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Read audit_summary" ON public.audit_summary;
CREATE POLICY "Public Read audit_summary" ON public.audit_summary FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Write audit_summary" ON public.audit_summary;
CREATE POLICY "Anon Write audit_summary" ON public.audit_summary FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Read duplicate_clusters" ON public.duplicate_clusters;
CREATE POLICY "Public Read duplicate_clusters" ON public.duplicate_clusters FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Write duplicate_clusters" ON public.duplicate_clusters;
CREATE POLICY "Anon Write duplicate_clusters" ON public.duplicate_clusters FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Read duplicate_pairs" ON public.duplicate_pairs;
CREATE POLICY "Public Read duplicate_pairs" ON public.duplicate_pairs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Write duplicate_pairs" ON public.duplicate_pairs;
CREATE POLICY "Anon Write duplicate_pairs" ON public.duplicate_pairs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access raw_scrape_uploads" ON public.raw_scrape_uploads;
CREATE POLICY "Public Access raw_scrape_uploads" ON public.raw_scrape_uploads FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access ubinan-photos" ON storage.objects;
CREATE POLICY "Public Access ubinan-photos" ON storage.objects
FOR ALL USING (bucket_id = 'ubinan-photos') WITH CHECK (bucket_id = 'ubinan-photos');
