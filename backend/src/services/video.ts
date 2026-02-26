import { execSync } from "child_process";
import ffmpeg from "fluent-ffmpeg";
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
    console.error("[video] VAAPI device not found:", VAAPI_DEVICE);
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
    console.error("[video] VAAPI encode test failed — GPU not functional");
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

  const pick = files[Math.floor(Math.random() * files.length)];
  return path.join(dir, pick);
}

function runEncode(
  bgPath: string,
  audioPath: string,
  escapedAssPath: string,
  duration: number,
  outputPath: string,
): Promise<string> {
  if (!hasVaapi()) {
    throw new Error(
      `VAAPI device ${VAAPI_DEVICE} not available. GPU encoding is required.`
    );
  }

  const outputFilename = path.basename(outputPath);

  const filter =
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,ass='${escapedAssPath}',format=nv12,hwupload[v]`;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(bgPath)
      .inputOptions(["-vaapi_device", VAAPI_DEVICE])
      .input(audioPath)
      .complexFilter([filter])
      .outputOptions([
        "-map", "[v]",
        "-map", "1:a",
        "-c:v", "h264_vaapi", "-qp", "18",
        "-c:a", "aac",
        "-b:a", "192k",
        "-t", String(duration),
        "-movflags", "+faststart",
      ])
      .output(outputPath)
      .on("end", () => {
        console.log("[video] Encoded with VAAPI (GPU)");
        resolve(outputFilename);
      })
      .on("error", (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
      .run();
  });
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
