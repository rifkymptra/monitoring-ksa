import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quality Assurance Foto Ubinan KSA - BPS Kabupaten Garut",
  description:
    "Sistem Audit & Deteksi Duplikasi Foto Dokumentasi Ubinan FASIH-SM BPS Kabupaten Garut",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}

