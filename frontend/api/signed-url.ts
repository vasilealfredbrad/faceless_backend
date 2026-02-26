import type { VercelRequest, VercelResponse } from "@vercel/node";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

const B2_KEY_ID = process.env.B2_KEY_ID || "";
const B2_APP_KEY = process.env.B2_APP_KEY || "";
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || "";
const B2_REGION = process.env.B2_REGION || "eu-central-003";
const B2_ENDPOINT = process.env.B2_ENDPOINT || `https://s3.${B2_REGION}.backblazeb2.com`;

const s3 = new S3Client({
  endpoint: B2_ENDPOINT,
  region: B2_REGION,
  credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APP_KEY },
  forcePathStyle: true,
});

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const ALLOWED_FILES = ["video.mp4", "audio.mp3", "subtitles.ass"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { jobId, file } = req.query;

  if (typeof jobId !== "string" || !UUID_RE.test(jobId)) {
    return res.status(400).json({ error: "Invalid job ID" });
  }
  if (typeof file !== "string" || !ALLOWED_FILES.includes(file)) {
    return res.status(400).json({ error: "Invalid file type" });
  }

  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (!authErr && user) {
        const { data: job } = await supabase
          .from("jobs")
          .select("user_id, status")
          .eq("id", jobId)
          .single();

        if (job?.user_id === user.id || job?.status === "completed") {
          const url = await makeSignedUrl(jobId, file);
          return res.status(200).json({ url });
        }
      }
    }

    const { data: job } = await supabase
      .from("jobs")
      .select("status")
      .eq("id", jobId)
      .single();

    if (job?.status !== "completed") {
      return res.status(403).json({ error: "Access denied" });
    }

    const url = await makeSignedUrl(jobId, file);
    return res.status(200).json({ url });
  } catch {
    return res.status(500).json({ error: "Failed to generate URL" });
  }
}

async function makeSignedUrl(jobId: string, file: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: B2_BUCKET_NAME,
    Key: `jobs/${jobId}/${file}`,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}
