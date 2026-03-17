import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const GENERATED_DIR = path.resolve(process.cwd(), "generated");

export async function generateThumbnail(
  videoPath: string,
  jobId: string,
): Promise<string | null> {
  const outPath = path.join(GENERATED_DIR, `${jobId}_thumb.jpg`);
  try {
    execSync(
      `ffmpeg -y -hide_banner -loglevel error -ss 0.5 -i "${videoPath}" -frames:v 1 -q:v 3 "${outPath}"`,
      { timeout: 15_000 },
    );
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
      console.log(`[${jobId}] Thumbnail generated`);
      return outPath;
    }
    return null;
  } catch (err) {
    console.warn(`[${jobId}] Thumbnail generation failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
