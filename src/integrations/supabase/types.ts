export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      allocations: {
        Row: {
          created_at: string
          id: string
          ip: string
          ip_alias: string | null
          is_primary: boolean
          node_id: string
          notes: string | null
          port: number
          server_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip: string
          ip_alias?: string | null
          is_primary?: boolean
          node_id: string
          notes?: string | null
          port: number
          server_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string
          ip_alias?: string | null
          is_primary?: boolean
          node_id?: string
          notes?: string | null
          port?: number
          server_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allocations_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          allowed_ips: string[] | null
          created_at: string
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scope: Database["public"]["Enums"]["api_key_scope"]
          user_id: string
        }
        Insert: {
          allowed_ips?: string[] | null
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scope?: Database["public"]["Enums"]["api_key_scope"]
          user_id: string
        }
        Update: {
          allowed_ips?: string[] | null
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scope?: Database["public"]["Enums"]["api_key_scope"]
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string | null
          created_at: string
          id: number
          ip_address: string | null
          metadata: Json
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          id?: number
          ip_address?: string | null
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          id?: number
          ip_address?: string | null
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      backups: {
        Row: {
          bytes: number
          checksum: string | null
          completed_at: string | null
          created_at: string
          encrypted: boolean
          error_message: string | null
          id: string
          ignored_files: string | null
          is_locked: boolean
          name: string
          progress: number
          server_id: string
          status: Database["public"]["Enums"]["backup_status"]
          storage_driver: string
        }
        Insert: {
          bytes?: number
          checksum?: string | null
          completed_at?: string | null
          created_at?: string
          encrypted?: boolean
          error_message?: string | null
          id?: string
          ignored_files?: string | null
          is_locked?: boolean
          name: string
          progress?: number
          server_id: string
          status?: Database["public"]["Enums"]["backup_status"]
          storage_driver?: string
        }
        Update: {
          bytes?: number
          checksum?: string | null
          completed_at?: string | null
          created_at?: string
          encrypted?: boolean
          error_message?: string | null
          id?: string
          ignored_files?: string | null
          is_locked?: boolean
          name?: string
          progress?: number
          server_id?: string
          status?: Database["public"]["Enums"]["backup_status"]
          storage_driver?: string
        }
        Relationships: [
          {
            foreignKeyName: "backups_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      egg_variables: {
        Row: {
          default_value: string | null
          description: string | null
          egg_id: string
          env_variable: string
          id: string
          name: string
          rules: string
          sort_order: number
          user_editable: boolean
          user_viewable: boolean
        }
        Insert: {
          default_value?: string | null
          description?: string | null
          egg_id: string
          env_variable: string
          id?: string
          name: string
          rules?: string
          sort_order?: number
          user_editable?: boolean
          user_viewable?: boolean
        }
        Update: {
          default_value?: string | null
          description?: string | null
          egg_id?: string
          env_variable?: string
          id?: string
          name?: string
          rules?: string
          sort_order?: number
          user_editable?: boolean
          user_viewable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "egg_variables_egg_id_fkey"
            columns: ["egg_id"]
            isOneToOne: false
            referencedRelation: "eggs"
            referencedColumns: ["id"]
          },
        ]
      }
      eggs: {
        Row: {
          config_files: Json
          config_startup: Json
          created_at: string
          description: string | null
          docker_images: Json
          id: string
          install_script: string | null
          name: string
          nest_id: string
          script_container: string | null
          script_entry: string | null
          slug: string
          startup: string
          stop_command: string
          updated_at: string
        }
        Insert: {
          config_files?: Json
          config_startup?: Json
          created_at?: string
          description?: string | null
          docker_images?: Json
          id?: string
          install_script?: string | null
          name: string
          nest_id: string
          script_container?: string | null
          script_entry?: string | null
          slug: string
          startup?: string
          stop_command?: string
          updated_at?: string
        }
        Update: {
          config_files?: Json
          config_startup?: Json
          created_at?: string
          description?: string | null
          docker_images?: Json
          id?: string
          install_script?: string | null
          name?: string
          nest_id?: string
          script_container?: string | null
          script_entry?: string | null
          slug?: string
          startup?: string
          stop_command?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eggs_nest_id_fkey"
            columns: ["nest_id"]
            isOneToOne: false
            referencedRelation: "nests"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          country: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          short_code: string
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          short_code: string
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          short_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      nests: {
        Row: {
          author: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      node_metrics: {
        Row: {
          container_count: number
          cpu_percent: number
          disk_used_mb: number
          id: number
          memory_used_mb: number
          network_rx_bytes: number
          network_tx_bytes: number
          node_id: string
          recorded_at: string
        }
        Insert: {
          container_count?: number
          cpu_percent?: number
          disk_used_mb?: number
          id?: number
          memory_used_mb?: number
          network_rx_bytes?: number
          network_tx_bytes?: number
          node_id: string
          recorded_at?: string
        }
        Update: {
          container_count?: number
          cpu_percent?: number
          disk_used_mb?: number
          id?: number
          memory_used_mb?: number
          network_rx_bytes?: number
          network_tx_bytes?: number
          node_id?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "node_metrics_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      nodes: {
        Row: {
          behind_proxy: boolean
          cpu_cores: number
          created_at: string
          daemon_port: number
          daemon_sftp_port: number
          daemon_token: string
          daemon_token_id: string | null
          description: string | null
          disk_mb: number
          disk_overallocate: number
          docker_version: string | null
          fqdn: string
          id: string
          kernel: string | null
          last_heartbeat_at: string | null
          location_id: string | null
          maintenance_mode: boolean
          memory_mb: number
          memory_overallocate: number
          name: string
          os_info: string | null
          public_node: boolean
          scheme: string
          status: Database["public"]["Enums"]["node_status"]
          updated_at: string
          upload_limit_mb: number
        }
        Insert: {
          behind_proxy?: boolean
          cpu_cores?: number
          created_at?: string
          daemon_port?: number
          daemon_sftp_port?: number
          daemon_token?: string
          daemon_token_id?: string | null
          description?: string | null
          disk_mb?: number
          disk_overallocate?: number
          docker_version?: string | null
          fqdn: string
          id?: string
          kernel?: string | null
          last_heartbeat_at?: string | null
          location_id?: string | null
          maintenance_mode?: boolean
          memory_mb?: number
          memory_overallocate?: number
          name: string
          os_info?: string | null
          public_node?: boolean
          scheme?: string
          status?: Database["public"]["Enums"]["node_status"]
          updated_at?: string
          upload_limit_mb?: number
        }
        Update: {
          behind_proxy?: boolean
          cpu_cores?: number
          created_at?: string
          daemon_port?: number
          daemon_sftp_port?: number
          daemon_token?: string
          daemon_token_id?: string | null
          description?: string | null
          disk_mb?: number
          disk_overallocate?: number
          docker_version?: string | null
          fqdn?: string
          id?: string
          kernel?: string | null
          last_heartbeat_at?: string | null
          location_id?: string | null
          maintenance_mode?: boolean
          memory_mb?: number
          memory_overallocate?: number
          name?: string
          os_info?: string | null
          public_node?: boolean
          scheme?: string
          status?: Database["public"]["Enums"]["node_status"]
          updated_at?: string
          upload_limit_mb?: number
        }
        Relationships: [
          {
            foreignKeyName: "nodes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          level: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          level?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          level?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          category: string
          description: string | null
          key: string
          label: string
        }
        Insert: {
          category: string
          description?: string | null
          key: string
          label: string
        }
        Update: {
          category?: string
          description?: string | null
          key?: string
          label?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          language: string
          last_login_at: string | null
          last_login_ip: string | null
          suspended: boolean
          timezone: string
          two_factor_enabled: boolean
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          language?: string
          last_login_at?: string | null
          last_login_ip?: string | null
          suspended?: boolean
          timezone?: string
          two_factor_enabled?: boolean
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          language?: string
          last_login_at?: string | null
          last_login_ip?: string | null
          suspended?: boolean
          timezone?: string
          two_factor_enabled?: boolean
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          id: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          id?: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          id?: string
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      schedule_runs: {
        Row: {
          finished_at: string | null
          id: number
          output: string | null
          schedule_id: string
          started_at: string
          success: boolean | null
        }
        Insert: {
          finished_at?: string | null
          id?: number
          output?: string | null
          schedule_id: string
          started_at?: string
          success?: boolean | null
        }
        Update: {
          finished_at?: string | null
          id?: number
          output?: string | null
          schedule_id?: string
          started_at?: string
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_runs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_tasks: {
        Row: {
          action: Database["public"]["Enums"]["schedule_task_action"]
          continue_on_failure: boolean
          id: string
          max_retries: number
          payload: string | null
          schedule_id: string
          sort_order: number
          time_offset: number
        }
        Insert: {
          action: Database["public"]["Enums"]["schedule_task_action"]
          continue_on_failure?: boolean
          id?: string
          max_retries?: number
          payload?: string | null
          schedule_id: string
          sort_order?: number
          time_offset?: number
        }
        Update: {
          action?: Database["public"]["Enums"]["schedule_task_action"]
          continue_on_failure?: boolean
          id?: string
          max_retries?: number
          payload?: string | null
          schedule_id?: string
          sort_order?: number
          time_offset?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_tasks_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          cron_expression: string
          id: string
          is_active: boolean
          last_run_at: string | null
          name: string
          next_run_at: string | null
          only_when_online: boolean
          server_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cron_expression?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          only_when_online?: boolean
          server_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cron_expression?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          only_when_online?: boolean
          server_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      server_databases: {
        Row: {
          created_at: string
          engine: string
          host: string
          id: string
          max_connections: number
          name: string
          port: number
          remote_access: string
          server_id: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          engine?: string
          host?: string
          id?: string
          max_connections?: number
          name: string
          port?: number
          remote_access?: string
          server_id: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          engine?: string
          host?: string
          id?: string
          max_connections?: number
          name?: string
          port?: number
          remote_access?: string
          server_id?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_databases_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      server_variables: {
        Row: {
          env_variable: string
          id: string
          server_id: string
          value: string | null
        }
        Insert: {
          env_variable: string
          id?: string
          server_id: string
          value?: string | null
        }
        Update: {
          env_variable?: string
          id?: string
          server_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "server_variables_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      servers: {
        Row: {
          allocation_limit: number
          backup_limit: number
          cpu_percent: number
          created_at: string
          database_limit: number
          description: string | null
          disk_mb: number
          docker_image: string | null
          egg_id: string | null
          id: string
          identifier: string
          installed_at: string | null
          io_weight: number
          memory_mb: number
          name: string
          node_id: string | null
          oom_killer: boolean
          owner_id: string
          startup_command: string | null
          status: Database["public"]["Enums"]["server_status"]
          suspended: boolean
          swap_mb: number
          updated_at: string
        }
        Insert: {
          allocation_limit?: number
          backup_limit?: number
          cpu_percent?: number
          created_at?: string
          database_limit?: number
          description?: string | null
          disk_mb?: number
          docker_image?: string | null
          egg_id?: string | null
          id?: string
          identifier?: string
          installed_at?: string | null
          io_weight?: number
          memory_mb?: number
          name: string
          node_id?: string | null
          oom_killer?: boolean
          owner_id: string
          startup_command?: string | null
          status?: Database["public"]["Enums"]["server_status"]
          suspended?: boolean
          swap_mb?: number
          updated_at?: string
        }
        Update: {
          allocation_limit?: number
          backup_limit?: number
          cpu_percent?: number
          created_at?: string
          database_limit?: number
          description?: string | null
          disk_mb?: number
          docker_image?: string | null
          egg_id?: string | null
          id?: string
          identifier?: string
          installed_at?: string | null
          io_weight?: number
          memory_mb?: number
          name?: string
          node_id?: string | null
          oom_killer?: boolean
          owner_id?: string
          startup_command?: string | null
          status?: Database["public"]["Enums"]["server_status"]
          suspended?: boolean
          swap_mb?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "servers_egg_id_fkey"
            columns: ["egg_id"]
            isOneToOne: false
            referencedRelation: "eggs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servers_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          category: string
          description: string | null
          is_public: boolean
          key: string
          label: string | null
          updated_at: string
          value: Json
        }
        Insert: {
          category?: string
          description?: string | null
          is_public?: boolean
          key: string
          label?: string | null
          updated_at?: string
          value?: Json
        }
        Update: {
          category?: string
          description?: string | null
          is_public?: boolean
          key?: string
          label?: string | null
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          device_label: string | null
          id: string
          ip_address: string | null
          is_current: boolean
          last_active_at: string
          location: string | null
          revoked_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean
          last_active_at?: string
          location?: string | null
          revoked_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean
          last_active_at?: string
          location?: string | null
          revoked_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      webhooks: {
        Row: {
          created_at: string
          created_by: string | null
          events: string[]
          id: string
          is_active: boolean
          last_delivery_at: string | null
          last_status: number | null
          name: string
          secret_hint: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          events?: string[]
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          last_status?: number | null
          name: string
          secret_hint?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          events?: string[]
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          last_status?: number | null
          name?: string
          secret_hint?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_server: {
        Args: { _server_id: string; _user_id: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      api_key_scope: "read" | "write" | "admin"
      app_role:
        | "owner"
        | "super_admin"
        | "admin"
        | "moderator"
        | "support"
        | "user"
        | "guest"
      backup_status: "pending" | "running" | "completed" | "failed" | "deleted"
      node_status: "online" | "offline" | "maintenance" | "degraded" | "unknown"
      notification_channel:
        | "in_app"
        | "email"
        | "discord"
        | "slack"
        | "telegram"
        | "push"
      schedule_task_action: "power" | "command" | "backup" | "http" | "webhook"
      server_status:
        | "installing"
        | "install_failed"
        | "suspended"
        | "running"
        | "starting"
        | "stopping"
        | "offline"
        | "restoring"
        | "transferring"
        | "error"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      api_key_scope: ["read", "write", "admin"],
      app_role: [
        "owner",
        "super_admin",
        "admin",
        "moderator",
        "support",
        "user",
        "guest",
      ],
      backup_status: ["pending", "running", "completed", "failed", "deleted"],
      node_status: ["online", "offline", "maintenance", "degraded", "unknown"],
      notification_channel: [
        "in_app",
        "email",
        "discord",
        "slack",
        "telegram",
        "push",
      ],
      schedule_task_action: ["power", "command", "backup", "http", "webhook"],
      server_status: [
        "installing",
        "install_failed",
        "suspended",
        "running",
        "starting",
        "stopping",
        "offline",
        "restoring",
        "transferring",
        "error",
      ],
    },
  },
} as const
