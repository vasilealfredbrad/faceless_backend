import { supabase } from "./supabase";

let cachedIsAdmin: boolean | null = null;
let cachedUserId: string | null = null;

export async function checkIsAdmin(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    cachedIsAdmin = null;
    cachedUserId = null;
    return false;
  }

  if (cachedUserId === user.id && cachedIsAdmin !== null) {
    return cachedIsAdmin;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    cachedIsAdmin = false;
    cachedUserId = user.id;
    return false;
  }

  cachedIsAdmin = data.is_admin === true;
  cachedUserId = user.id;
  return cachedIsAdmin;
}

export function clearAdminCache(): void {
  cachedIsAdmin = null;
  cachedUserId = null;
}
