import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Agent } from "https";
import fs from "fs";
import path from "path";
import { uploadSizeBytes, uploadDurationSeconds } from "./metrics.js";

const B2_KEY_ID = process.env.B2_KEY_ID || "";
const B2_APP_KEY = process.env.B2_APP_KEY || "";
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || "";
const B2_REGION = process.env.B2_REGION || "eu-central-003";
const B2_ENDPOINT = process.env.B2_ENDPOINT || `https://s3.${B2_REGION}.backblazeb2.com`;

if (!B2_KEY_ID || !B2_APP_KEY || !B2_BUCKET_NAME) {
  console.warn("WARNING: Backblaze B2 credentials not fully configured. Uploads will fail.");
}

const s3 = new S3Client({
  endpoint: B2_ENDPOINT,
  region: B2_REGION,
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APP_KEY,
  },
  forcePathStyle: true,
  requestHandler: new NodeHttpHandler({
    httpsAgent: new Agent({
      keepAlive: true,
      maxSockets: 50,
    }),
    connectionTimeout: 5_000,
    socketTimeout: 30_000,
  }),
});

const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ass": "text/plain",
  ".json": "application/json",
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const SIGNED_URL_EXPIRY = 3600; // 1 hour

export async function uploadFile(
  localPath: string,
  remotePath: string
): Promise<string> {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Upload failed: file not found at ${localPath}`);
  }

  const stat = fs.statSync(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const sizeMB = (stat.size / 1024 / 1024).toFixed(1);

  const fileType = ext.replace(".", "");
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const uploadStart = Date.now();
      const upload = new Upload({
        client: s3,
        params: {
          Bucket: B2_BUCKET_NAME,
          Key: remotePath,
          Body: fs.createReadStream(localPath, { highWaterMark: 1024 * 1024 }),
          ContentType: contentType,
        },
        queueSize: 8,
        partSize: 5 * 1024 * 1024,
        leavePartsOnError: false,
      });

      await upload.done();

      const elapsed = ((Date.now() - uploadStart) / 1000).toFixed(1);
      uploadSizeBytes.observe({ file_type: fileType }, stat.size);
      uploadDurationSeconds.observe({ file_type: fileType }, parseFloat(elapsed));

      const signedUrl = await generateSignedUrl(remotePath);
      console.log(`Uploaded ${path.basename(localPath)} (${sizeMB}MB) in ${elapsed}s → ${remotePath}`);
      return signedUrl;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`Upload attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw new Error(`Upload failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

export async function generateSignedUrl(remotePath: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: B2_BUCKET_NAME,
    Key: remotePath,
  });
  return getSignedUrl(s3, command, { expiresIn: SIGNED_URL_EXPIRY });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
