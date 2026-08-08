import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";

/**
 * Loads one server by its public identifier along with the egg and node it
 * belongs to. Every server sub-page shares this query so the record is fetched
 * once and stays consistent across tabs.
 */
export function useServerRecord(identifier: string) {
  return useQuery({
    queryKey: queryKeys.servers.detail(identifier),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servers")
        .select(
          "id, identifier, name, description, status, suspended, owner_id, node_id, egg_id, docker_image, startup_command, memory_mb, swap_mb, disk_mb, cpu_percent, io_weight, oom_killer, database_limit, allocation_limit, backup_limit, installed_at, created_at",
        )
        .eq("identifier", identifier)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
