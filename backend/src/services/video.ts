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
    console.log("[video] VAAPI device not found, using CPU");
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
    console.log("[video] VAAPI encode test failed — using CPU");
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
  useVaapi: boolean,
): Promise<string> {
  const outputFilename = path.basename(outputPath);

  const filter = useVaapi
    ? `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,ass='${escapedAssPath}',format=nv12,hwupload[v]`
    : `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,ass='${escapedAssPath}'[v]`;

  const videoOpts = useVaapi
    ? ["-c:v", "h264_vaapi", "-qp", "18"]
    : ["-c:v", "libx264", "-preset", "fast", "-crf", "23"];

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg().input(bgPath);

    if (useVaapi) {
      cmd = cmd.inputOptions(["-vaapi_device", VAAPI_DEVICE]);
    }

    cmd
      .input(audioPath)
      .complexFilter([filter])
      .outputOptions([
        "-map", "[v]",
        "-map", "1:a",
        ...videoOpts,
        "-c:a", "aac",
        "-b:a", "192k",
        "-t", String(duration),
        "-movflags", "+faststart",
      ])
      .output(outputPath)
      .on("end", () => {
        console.log(`[video] Encoded with ${useVaapi ? "VAAPI (GPU)" : "libx264 (CPU)"}`);
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

  if (hasVaapi()) {
    try {
      return await runEncode(bgPath, audioPath, escapedAssPath, duration, outputPath, true);
    } catch (err) {
      console.warn(`[video] VAAPI failed, falling back to CPU: ${(err as Error).message}`);
    }
  }

  return runEncode(bgPath, audioPath, escapedAssPath, duration, outputPath, false);
}
