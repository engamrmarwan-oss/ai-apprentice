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
    PostgrestVersion: "14.18"
  }
  evaluation: {
    Tables: {
      evaluation_items: {
        Row: {
          created_at: string
          id: string
          kind: string | null
          set_id: string
          statement: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string | null
          set_id: string
          statement: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string | null
          set_id?: string
          statement?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_items_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "evaluation_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_results: {
        Row: {
          created_at: string
          id: string
          item_id: string | null
          provenance: string | null
          rule_id: string | null
          set_id: string
          verdict: string
          work_map_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id?: string | null
          provenance?: string | null
          rule_id?: string | null
          set_id: string
          verdict: string
          work_map_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string | null
          provenance?: string | null
          rule_id?: string | null
          set_id?: string
          verdict?: string
          work_map_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_results_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "evaluation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_results_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "evaluation_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_sets: {
        Row: {
          created_at: string
          id: string
          title: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          workflow_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      auth_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      baseline_statements: {
        Row: {
          created_at: string
          id: string
          source: string
          source_detail: string | null
          status: string
          text: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source: string
          source_detail?: string | null
          status?: string
          text: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source?: string
          source_detail?: string | null
          status?: string
          text?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseline_statements_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      clips: {
        Row: {
          created_at: string
          end_ms: number
          id: string
          key_frame_id: string | null
          session_id: string
          start_ms: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          end_ms: number
          id?: string
          key_frame_id?: string | null
          session_id: string
          start_ms: number
          storage_path: string
        }
        Update: {
          created_at?: string
          end_ms?: number
          id?: string
          key_frame_id?: string | null
          session_id?: string
          start_ms?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "clips_key_frame_id_fkey"
            columns: ["key_frame_id"]
            isOneToOne: false
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      crawl_jobs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          started_at: string | null
          stats: Json
          status: string
          tool_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string | null
          stats?: Json
          status?: string
          tool_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string | null
          stats?: Json
          status?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crawl_jobs_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          confidence: number
          created_at: string
          element_id: string | null
          frame_id: string
          id: string
          payload: Json
          screen_id: string | null
          session_id: string
          t_ms: number
          type: string
          verified: boolean
        }
        Insert: {
          confidence: number
          created_at?: string
          element_id?: string | null
          frame_id: string
          id?: string
          payload: Json
          screen_id?: string | null
          session_id: string
          t_ms: number
          type: string
          verified?: boolean
        }
        Update: {
          confidence?: number
          created_at?: string
          element_id?: string | null
          frame_id?: string
          id?: string
          payload?: Json
          screen_id?: string | null
          session_id?: string
          t_ms?: number
          type?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "events_element_id_fkey"
            columns: ["element_id"]
            isOneToOne: false
            referencedRelation: "tool_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "tool_screens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      frames: {
        Row: {
          changed_region: Json | null
          created_at: string
          height: number | null
          id: string
          is_key: boolean
          reading: Json | null
          redacted: boolean
          session_id: string
          storage_path: string
          t_ms: number
          width: number | null
        }
        Insert: {
          changed_region?: Json | null
          created_at?: string
          height?: number | null
          id?: string
          is_key?: boolean
          reading?: Json | null
          redacted?: boolean
          session_id: string
          storage_path: string
          t_ms: number
          width?: number | null
        }
        Update: {
          changed_region?: Json | null
          created_at?: string
          height?: number | null
          id?: string
          is_key?: boolean
          reading?: Json | null
          redacted?: boolean
          session_id?: string
          storage_path?: string
          t_ms?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "frames_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          answer_utterance_id: string | null
          baseline_statement_id: string | null
          channel: string
          created_at: string
          id: string
          kind: string
          score: number
          session_id: string
          status: string
          text: string
          trigger_event_id: string | null
        }
        Insert: {
          answer_utterance_id?: string | null
          baseline_statement_id?: string | null
          channel: string
          created_at?: string
          id?: string
          kind: string
          score: number
          session_id: string
          status?: string
          text: string
          trigger_event_id?: string | null
        }
        Update: {
          answer_utterance_id?: string | null
          baseline_statement_id?: string | null
          channel?: string
          created_at?: string
          id?: string
          kind?: string
          score?: number
          session_id?: string
          status?: string
          text?: string
          trigger_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_answer_utterance_id_fkey"
            columns: ["answer_utterance_id"]
            isOneToOne: false
            referencedRelation: "utterances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_baseline_statement_id_fkey"
            columns: ["baseline_statement_id"]
            isOneToOne: false
            referencedRelation: "baseline_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_trigger_event_id_fkey"
            columns: ["trigger_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      redactions: {
        Row: {
          created_at: string
          end_ms: number
          id: string
          session_id: string
          start_ms: number
        }
        Insert: {
          created_at?: string
          end_ms: number
          id?: string
          session_id: string
          start_ms: number
        }
        Update: {
          created_at?: string
          end_ms?: number
          id?: string
          session_id?: string
          start_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "redactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_kinds: {
        Row: {
          created_at: string
          is_guardrail: boolean
          key: string
          label: string
          workflow_id: string | null
        }
        Insert: {
          created_at?: string
          is_guardrail?: boolean
          key: string
          label: string
          workflow_id?: string | null
        }
        Update: {
          created_at?: string
          is_guardrail?: boolean
          key?: string
          label?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rule_kinds_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_links: {
        Row: {
          rule_id: string
          step_id: string
        }
        Insert: {
          rule_id: string
          step_id: string
        }
        Update: {
          rule_id?: string
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_links_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_links_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["id"]
          },
        ]
      }
      rules: {
        Row: {
          action: Json
          check_type: string
          condition: Json | null
          created_at: string
          documented: boolean
          expert_quote_utterance_id: string
          id: string
          judge_spec: Json | null
          kind: string
          lineage_id: string
          moment_event_id: string
          moment_frame_id: string
          moment_link: string
          provenance: string
          statement: string
          status: string
          version: number
          work_map_id: string
        }
        Insert: {
          action: Json
          check_type: string
          condition?: Json | null
          created_at?: string
          documented?: boolean
          expert_quote_utterance_id: string
          id?: string
          judge_spec?: Json | null
          kind: string
          lineage_id: string
          moment_event_id: string
          moment_frame_id: string
          moment_link: string
          provenance: string
          statement: string
          status?: string
          version: number
          work_map_id: string
        }
        Update: {
          action?: Json
          check_type?: string
          condition?: Json | null
          created_at?: string
          documented?: boolean
          expert_quote_utterance_id?: string
          id?: string
          judge_spec?: Json | null
          kind?: string
          lineage_id?: string
          moment_event_id?: string
          moment_frame_id?: string
          moment_link?: string
          provenance?: string
          statement?: string
          status?: string
          version?: number
          work_map_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rules_expert_quote_utterance_id_fkey"
            columns: ["expert_quote_utterance_id"]
            isOneToOne: false
            referencedRelation: "utterances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rules_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "rule_kinds"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "rules_moment_event_id_fkey"
            columns: ["moment_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rules_moment_frame_id_fkey"
            columns: ["moment_frame_id"]
            isOneToOne: false
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rules_work_map_id_fkey"
            columns: ["work_map_id"]
            isOneToOne: false
            referencedRelation: "work_maps"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          conversation_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          kind: string
          language: string
          phase: string
          started_at: string | null
          user_id: string | null
          workflow_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          kind: string
          language?: string
          phase?: string
          started_at?: string | null
          user_id?: string | null
          workflow_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          kind?: string
          language?: string
          phase?: string
          started_at?: string | null
          user_id?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          label: string | null
          revoked_at: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          label?: string | null
          revoked_at?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          label?: string | null
          revoked_at?: string | null
        }
        Relationships: []
      }
      steps: {
        Row: {
          created_at: string
          decision: string | null
          event_id: string | null
          frame_id: string | null
          id: string
          is_judgment: boolean
          position: number
          reason_utterance_id: string | null
          title: string
          work_map_id: string
        }
        Insert: {
          created_at?: string
          decision?: string | null
          event_id?: string | null
          frame_id?: string | null
          id?: string
          is_judgment?: boolean
          position: number
          reason_utterance_id?: string | null
          title: string
          work_map_id: string
        }
        Update: {
          created_at?: string
          decision?: string | null
          event_id?: string | null
          frame_id?: string | null
          id?: string
          is_judgment?: boolean
          position?: number
          reason_utterance_id?: string | null
          title?: string
          work_map_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "steps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steps_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steps_reason_utterance_id_fkey"
            columns: ["reason_utterance_id"]
            isOneToOne: false
            referencedRelation: "utterances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steps_work_map_id_fkey"
            columns: ["work_map_id"]
            isOneToOne: false
            referencedRelation: "work_maps"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_elements: {
        Row: {
          allowed_values: Json | null
          created_at: string
          id: string
          kind: string
          label: string
          origin: string
          personal: boolean
          region: Json | null
          screen_id: string
        }
        Insert: {
          allowed_values?: Json | null
          created_at?: string
          id?: string
          kind: string
          label: string
          origin: string
          personal?: boolean
          region?: Json | null
          screen_id: string
        }
        Update: {
          allowed_values?: Json | null
          created_at?: string
          id?: string
          kind?: string
          label?: string
          origin?: string
          personal?: boolean
          region?: Json | null
          screen_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_elements_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "tool_screens"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_screens: {
        Row: {
          created_at: string
          hidden: boolean
          id: string
          name: string
          origin: string
          tool_id: string
          url_pattern: string | null
        }
        Insert: {
          created_at?: string
          hidden?: boolean
          id?: string
          name: string
          origin: string
          tool_id: string
          url_pattern?: string | null
        }
        Update: {
          created_at?: string
          hidden?: boolean
          id?: string
          name?: string
          origin?: string
          tool_id?: string
          url_pattern?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_screens_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          base_url: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          base_url?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      tutor_checks: {
        Row: {
          caught_before_commit: boolean | null
          created_at: string
          id: string
          outcome: string
          prediction: string | null
          rule_id: string
          tutor_run_id: string
        }
        Insert: {
          caught_before_commit?: boolean | null
          created_at?: string
          id?: string
          outcome: string
          prediction?: string | null
          rule_id: string
          tutor_run_id: string
        }
        Update: {
          caught_before_commit?: boolean | null
          created_at?: string
          id?: string
          outcome?: string
          prediction?: string | null
          rule_id?: string
          tutor_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutor_checks_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_checks_tutor_run_id_fkey"
            columns: ["tutor_run_id"]
            isOneToOne: false
            referencedRelation: "tutor_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tutor_runs: {
        Row: {
          case_label: string | null
          created_at: string
          id: string
          session_id: string
          work_map_id: string
        }
        Insert: {
          case_label?: string | null
          created_at?: string
          id?: string
          session_id: string
          work_map_id: string
        }
        Update: {
          case_label?: string | null
          created_at?: string
          id?: string
          session_id?: string
          work_map_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutor_runs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_runs_work_map_id_fkey"
            columns: ["work_map_id"]
            isOneToOne: false
            referencedRelation: "work_maps"
            referencedColumns: ["id"]
          },
        ]
      }
      utterances: {
        Row: {
          created_at: string
          end_ms: number
          id: string
          language: string | null
          session_id: string
          speaker: string
          start_ms: number
          text_english: string | null
          text_original: string
        }
        Insert: {
          created_at?: string
          end_ms: number
          id?: string
          language?: string | null
          session_id: string
          speaker: string
          start_ms: number
          text_english?: string | null
          text_original: string
        }
        Update: {
          created_at?: string
          end_ms?: number
          id?: string
          language?: string | null
          session_id?: string
          speaker?: string
          start_ms?: number
          text_english?: string | null
          text_original?: string
        }
        Relationships: [
          {
            foreignKeyName: "utterances_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_maps: {
        Row: {
          confirmed_at: string | null
          created_at: string
          id: string
          session_id: string
          status: string
          version: number
          workflow_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          session_id: string
          status?: string
          version: number
          workflow_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          session_id?: string
          status?: string
          version?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_maps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_maps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_invitations: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          role?: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_invitations_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_members_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          config: Json
          created_at: string
          id: string
          role: string | null
          task: string
          tool_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          role?: string | null
          task: string
          tool_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          role?: string | null
          task?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  evaluation: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
