import { Router, Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: "Authentication check failed" });
  }
}

export const adminSettingsRoute = Router();

adminSettingsRoute.get("/admin/settings", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("*");

    if (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
      return;
    }

    const settings: Record<string, string> = {};
    for (const row of data || []) {
      settings[row.key] = row.value;
    }

    res.json({ settings });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

adminSettingsRoute.put("/admin/settings", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== "object") {
      res.status(400).json({ error: "Settings object required" });
      return;
    }

    const allowedKeys = ["free_tier_enabled", "free_tier_daily_limit"];
    const entries = Object.entries(settings).filter(([key]) => allowedKeys.includes(key));

    if (entries.length === 0) {
      res.status(400).json({ error: "No valid settings provided" });
      return;
    }

    for (const [key, value] of entries) {
      await supabase
        .from("app_settings")
        .upsert({ key, value: String(value) }, { onConflict: "key" });
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});
