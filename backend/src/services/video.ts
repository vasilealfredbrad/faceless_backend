import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

const VIDEOS_DIR = path.resolve(process.cwd(), "videos");
const GENERATED_DIR = path.resolve(process.cwd(), "generated");
const VAAPI_DEVICE = "/dev/dri/renderD128";

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

function hasVaapi(): boolean {
  try {
    return fs.existsSync(VAAPI_DEVICE);
  } catch {
    return false;
  }
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

  const inputOpts = useVaapi
    ? ["-vaapi_device", VAAPI_DEVICE]
    : [];

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg();

    if (inputOpts.length > 0) {
      cmd = cmd.inputOptions(inputOpts);
    }

    cmd
      .input(bgPath)
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
