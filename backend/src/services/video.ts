import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

const VIDEOS_DIR = path.resolve(process.cwd(), "videos");
const GENERATED_DIR = path.resolve(process.cwd(), "generated");
const VAAPI_DEVICE = "/dev/dri/renderD128";

let _vaapiChecked = false;
let _vaapiAvailable = false;

function hasVaapi(): boolean {
  if (_vaapiChecked) return _vaapiAvailable;
  _vaapiChecked = true;
  if (!fs.existsSync(VAAPI_DEVICE)) {
    console.warn("[video] VAAPI device not found:", VAAPI_DEVICE);
    _vaapiAvailable = false;
    return false;
  }
  try {
    execSync(
      `ffmpeg -hide_banner -init_hw_device vaapi=va:${VAAPI_DEVICE} ` +
      `-f lavfi -i nullsrc=s=64x64:d=0.1 ` +
      `-vf "format=nv12,hwupload" -c:v h264_vaapi -frames:v 1 -f null -`,
      { stdio: "ignore", timeout: 10_000 },
    );
    console.log("[video] VAAPI encode test passed — GPU available");
    _vaapiAvailable = true;
  } catch {
    console.warn("[video] VAAPI encode test failed — will use CPU fallback");
    _vaapiAvailable = false;
  }
  return _vaapiAvailable;
}

export interface AssembleOptions {
  audioPath: string;
  assPath: string;
  background: string;
  duration: 30 | 60;
  jobId: string;
}

function isClipReadable(filePath: string): boolean {
  try {
    execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_type -of csv=p=0 "${filePath}"`,
      { stdio: "pipe", timeout: 10_000 },
    );
    return true;
  } catch {
    return false;
  }
}

function pickRandomBackground(category: string, duration: 30 | 60): string {
  const dir = path.join(VIDEOS_DIR, category, String(duration));
  if (!fs.existsSync(dir)) {
    throw new Error(`Background directory not found: ${dir}`);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(mp4|mov|webm|avi|mkv)$/i.test(f));

  if (files.length === 0) {
    throw new Error(
      `No background videos found in ${dir}. Please add .mp4 files to videos/${category}/${duration}/`
    );
  }

  // Shuffle and try each clip until we find one that's readable
  const shuffled = [...files].sort(() => Math.random() - 0.5);
  for (const file of shuffled) {
    const filePath = path.join(dir, file);
    if (isClipReadable(filePath)) {
      return filePath;
    }
    console.warn(`[video] Skipping corrupt clip: ${file} (moov atom missing or unreadable)`);
  }

  throw new Error(
    `All background clips in ${dir} are corrupt or unreadable. Re-download or replace them.`
  );
}

function spawnEncode(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("close", (code) => resolve({ code: code ?? 1, stderr }));
    proc.on("error", (err) => reject(new Error(`FFmpeg spawn: ${err.message}`)));
  });
}

function vaapiArgs(
  bgPath: string, audioPath: string, assPath: string, duration: number, outputPath: string,
): string[] {
  const filterComplex = [
    `[0:v]scale_vaapi=w=1080:h=1920:force_original_aspect_ratio=increase:force_divisible_by=2`,
    `hwdownload,format=nv12`,
    `crop=1080:1920`,
    `ass='${assPath}'`,
    `format=nv12,hwupload[v]`,
  ].join(",");

  return [
    "-y", "-hide_banner", "-loglevel", "error",
    "-init_hw_device", `vaapi=va:${VAAPI_DEVICE}`,
    "-filter_hw_device", "va",
    "-hwaccel", "vaapi",
    "-hwaccel_output_format", "vaapi",
    "-hwaccel_device", VAAPI_DEVICE,
    "-extra_hw_frames", "16",
    "-i", bgPath,
    "-i", audioPath,
    "-filter_complex", filterComplex,
    "-map", "[v]",
    "-map", "1:a",
    "-c:v", "h264_vaapi",
    "-b:v", "8M",
    "-maxrate", "10M",
    "-bf", "0",
    "-async_depth", "8",
    "-compression_level", "0",
    "-profile:v", "high",
    "-level", "4.2",
    "-r", "60",
    "-c:a", "aac", "-b:a", "192k",
    "-threads", "10",
    "-filter_threads", "10",
    "-t", String(duration),
    "-movflags", "+faststart",
    outputPath,
  ];
}

function softwareArgs(
  bgPath: string, audioPath: string, assPath: string, duration: number, outputPath: string,
): string[] {
  const filterComplex = [
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase`,
    `crop=1080:1920`,
    `ass='${assPath}'[v]`,
  ].join(",");

  return [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", bgPath,
    "-i", audioPath,
    "-filter_complex", filterComplex,
    "-map", "[v]",
    "-map", "1:a",
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "fast",
    "-profile:v", "high",
    "-level", "4.2",
    "-pix_fmt", "yuv420p",
    "-r", "60",
    "-c:a", "aac", "-b:a", "192k",
    "-threads", "0",
    "-t", String(duration),
    "-movflags", "+faststart",
    outputPath,
  ];
}

async function runEncode(
  bgPath: string,
  audioPath: string,
  assPath: string,
  duration: number,
  outputPath: string,
): Promise<string> {
  const outputFilename = path.basename(outputPath);
  const useVaapi = hasVaapi();

  if (useVaapi) {
    const args = vaapiArgs(bgPath, audioPath, assPath, duration, outputPath);
    const result = await spawnEncode(args);
    if (result.code === 0) {
      console.log("[video] Encoded with VAAPI (GPU)");
      return outputFilename;
    }
    console.warn("[video] VAAPI encode failed, falling back to CPU:", result.stderr.slice(-300));
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }

  console.log("[video] Encoding with libx264 (CPU)...");
  const args = softwareArgs(bgPath, audioPath, assPath, duration, outputPath);
  const result = await spawnEncode(args);
  if (result.code === 0) {
    console.log("[video] Encoded with libx264 (CPU)");
    return outputFilename;
  }

  throw new Error(`FFmpeg exited ${result.code}: ${result.stderr.slice(-500)}`);
}

export async function assembleVideo(
  options: AssembleOptions
): Promise<string> {
  const { audioPath, assPath, background, duration, jobId } = options;
  const bgPath = pickRandomBackground(background, duration);
  const outputFilename = `${jobId}.mp4`;
  const outputPath = path.join(GENERATED_DIR, outputFilename);

  const escapedAssPath = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");

  return runEncode(bgPath, audioPath, escapedAssPath, duration, outputPath);
}
