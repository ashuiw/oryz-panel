// Self-hosted installs may boot before the authentication backend is
// configured. The generated Supabase client throws on first property access
// when its URL/key are missing, which — inside a component or effect — kills
// hydration and leaves a blank white page after the SSR flash.
// Resolve the client defensively so the app degrades instead of disappearing.
import { supabase } from "@/integrations/supabase/client";

let resolved = false;
let client: typeof supabase | null = null;

export function getSupabaseOrNull(): typeof supabase | null {
  if (!resolved) {
    resolved = true;
    try {
      // Touching any property instantiates the underlying client.
      void supabase.auth;
      client = supabase;
    } catch {
      client = null;
    }
  }
  return client;
}

export function isBackendConfigured(): boolean {
  return getSupabaseOrNull() !== null;
}
