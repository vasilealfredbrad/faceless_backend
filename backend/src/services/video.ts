import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

const VIDEOS_DIR = path.resolve(process.cwd(), "videos");
const GENERATED_DIR = path.resolve(process.cwd(), "generated");

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

export async function assembleVideo(
  options: AssembleOptions
): Promise<string> {
  const { audioPath, assPath, background, duration, jobId } = options;
  const bgPath = pickRandomBackground(background, duration);
  const outputFilename = `${jobId}.mp4`;
  const outputPath = path.join(GENERATED_DIR, outputFilename);

  const escapedAssPath = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(bgPath)
      .input(audioPath)
      .complexFilter([
        `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,ass='${escapedAssPath}'[v]`,
      ])
      .outputOptions([
        "-map",
        "[v]",
        "-map",
        "1:a",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-t",
        String(duration),
        "-movflags",
        "+faststart",
      ])
      .output(outputPath)
      .on("end", () => resolve(outputFilename))
      .on("error", (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
      .run();
  });
}
