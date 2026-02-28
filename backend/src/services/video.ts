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

function spawnFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
    proc.on("error", (err) => reject(new Error(`FFmpeg spawn: ${err.message}`)));
  });
}

function preRenderSubtitles(
  assPath: string,
  duration: number,
  outputPath: string,
): Promise<void> {
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `color=c=black@0:s=1080x1920:d=${duration}:r=60,format=yuva420p`,
    "-vf", `ass='${assPath}'`,
    "-c:v", "rawvideo", "-pix_fmt", "yuva420p",
    "-threads", "10",
    "-t", String(duration),
    outputPath,
  ];
  return spawnFFmpeg(args);
}

async function runEncode(
  bgPath: string,
  audioPath: string,
  assPath: string,
  duration: number,
  outputPath: string,
): Promise<string> {
  if (!hasVaapi()) {
    throw new Error(
      `VAAPI device ${VAAPI_DEVICE} not available. GPU encoding is required.`
    );
  }

  const outputFilename = path.basename(outputPath);
  const subsVideoPath = outputPath.replace(/\.mp4$/, "_subs.nut");

  try {
    // Step 1: Pre-render subtitles to raw video with alpha (CPU — text only, very fast)
    console.log("[video] Pre-rendering subtitles...");
    const t0 = Date.now();
    await preRenderSubtitles(assPath, duration, subsVideoPath);
    console.log(`[video] Subtitles pre-rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    // Step 2: Full GPU pipeline — decode bg, scale+crop, overlay subs, encode
    // overlay_vaapi composites subtitle video on top of background entirely on GPU
    const filterComplex = [
      `[0:v]scale_vaapi=w=1080:h=1920:force_original_aspect_ratio=increase:force_divisible_by=2,scale_vaapi=w=1080:h=1920[bg]`,
      `[1:v]format=nv12,hwupload[subs]`,
      `[bg][subs]overlay_vaapi=x=0:y=0[v]`,
    ].join(";");

    const args = [
      "-y", "-hide_banner", "-loglevel", "error",
      "-init_hw_device", `vaapi=va:${VAAPI_DEVICE}`,
      "-filter_hw_device", "va",
      "-hwaccel", "vaapi",
      "-hwaccel_output_format", "vaapi",
      "-hwaccel_device", VAAPI_DEVICE,
      "-extra_hw_frames", "64",
      "-i", bgPath,
      "-i", subsVideoPath,
      "-i", audioPath,
      "-filter_complex", filterComplex,
      "-map", "[v]",
      "-map", "2:a",
      "-c:v", "h264_vaapi",
      "-qp", "18",
      "-bf", "0",
      "-async_depth", "64",
      "-compression_level", "0",
      "-profile:v", "high",
      "-level", "4.2",
      "-r", "60",
      "-c:a", "aac", "-b:a", "192k",
      "-t", String(duration),
      "-movflags", "+faststart",
      outputPath,
    ];

    const t1 = Date.now();
    await spawnFFmpeg(args);
    console.log(`[video] GPU encode finished in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
    console.log("[video] Encoded with VAAPI (GPU) — full GPU pipeline");

    return outputFilename;
  } finally {
    if (fs.existsSync(subsVideoPath)) fs.unlinkSync(subsVideoPath);
  }
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
