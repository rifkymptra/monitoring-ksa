import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  const relPath = req.nextUrl.searchParams.get("path");
  if (!relPath) {
    return new NextResponse("Missing path parameter", { status: 400 });
  }

  // Pastikan path aman (hanya dari folder S1, S2, S3 di parent directory)
  const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const rootDir = path.resolve(process.cwd(), "..");
  const fullPath = path.join(rootDir, normalized);

  if (!fullPath.startsWith(rootDir) || !fs.existsSync(fullPath)) {
    return new NextResponse("Image not found", { status: 404 });
  }

  const buffer = fs.readFileSync(fullPath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

