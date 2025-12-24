// Supabase 数据库类型定义
// 可以使用 Supabase CLI 自动生成: npx supabase gen types typescript --local

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          phone: string | null
          credits: number
          total_credits_purchased: number
          role: 'user' | 'admin' | 'vip'
          is_active: boolean
          metadata: Json
          created_at: string
          updated_at: string
          last_login_at: string | null
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          phone?: string | null
          credits?: number
          total_credits_purchased?: number
          role?: 'user' | 'admin' | 'vip'
          is_active?: boolean
          metadata?: Json
          created_at?: string
          updated_at?: string
          last_login_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          phone?: string | null
          credits?: number
          total_credits_purchased?: number
          role?: 'user' | 'admin' | 'vip'
          is_active?: boolean
          metadata?: Json
          created_at?: string
          updated_at?: string
          last_login_at?: string | null
        }
      }
      credit_transactions: {
        Row: {
          id: string
          user_id: string
          transaction_type: 'purchase' | 'consume' | 'admin_grant' | 'refund'
          amount: number
          balance_before: number
          balance_after: number
          description: string | null
          operation_type: string | null
          metadata: Json
          admin_id: string | null
          admin_note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          transaction_type: 'purchase' | 'consume' | 'admin_grant' | 'refund'
          amount: number
          balance_before: number
          balance_after: number
          description?: string | null
          operation_type?: string | null
          metadata?: Json
          admin_id?: string | null
          admin_note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          transaction_type?: 'purchase' | 'consume' | 'admin_grant' | 'refund'
          amount?: number
          balance_before?: number
          balance_after?: number
          description?: string | null
          operation_type?: string | null
          metadata?: Json
          admin_id?: string | null
          admin_note?: string | null
          created_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          art_style: string | null
          settings: Json
          metadata: Json
          scene_count: number
          shot_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          art_style?: string | null
          settings?: Json
          metadata?: Json
          scene_count?: number
          shot_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          art_style?: string | null
          settings?: Json
          metadata?: Json
          scene_count?: number
          shot_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      scenes: {
        Row: {
          id: string
          project_id: string
          name: string
          description: string | null
          order_index: number
          grid_history: Json
          saved_grid_slices: Json
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          description?: string | null
          order_index?: number
          grid_history?: Json
          saved_grid_slices?: Json
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          description?: string | null
          order_index?: number
          grid_history?: Json
          saved_grid_slices?: Json
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      shots: {
        Row: {
          id: string
          scene_id: string
          order_index: number
          shot_size: string | null
          camera_movement: string | null
          duration: number | null
          description: string | null
          dialogue: string | null
          narration: string | null
          reference_image: string | null
          video_clip: string | null
          grid_images: Json
          generation_history: Json
          status: 'draft' | 'generating' | 'done' | 'failed'
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          scene_id: string
          order_index?: number
          shot_size?: string | null
          camera_movement?: string | null
          duration?: number | null
          description?: string | null
          dialogue?: string | null
          narration?: string | null
          reference_image?: string | null
          video_clip?: string | null
          grid_images?: Json
          generation_history?: Json
          status?: 'draft' | 'generating' | 'done' | 'failed'
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          scene_id?: string
          order_index?: number
          shot_size?: string | null
          camera_movement?: string | null
          duration?: number | null
          description?: string | null
          dialogue?: string | null
          narration?: string | null
          reference_image?: string | null
          video_clip?: string | null
          grid_images?: Json
          generation_history?: Json
          status?: 'draft' | 'generating' | 'done' | 'failed'
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      characters: {
        Row: {
          id: string
          project_id: string
          name: string
          description: string | null
          appearance: string | null
          personality: string | null
          turnaround_image: string | null
          reference_images: Json
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          description?: string | null
          appearance?: string | null
          personality?: string | null
          turnaround_image?: string | null
          reference_images?: Json
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          description?: string | null
          appearance?: string | null
          personality?: string | null
          turnaround_image?: string | null
          reference_images?: Json
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      audio_assets: {
        Row: {
          id: string
          project_id: string
          name: string
          category: 'music' | 'voice' | 'sfx'
          file_url: string
          file_size: number | null
          duration: number | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          category: 'music' | 'voice' | 'sfx'
          file_url: string
          file_size?: number | null
          duration?: number | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          category?: 'music' | 'voice' | 'sfx'
          file_url?: string
          file_size?: number | null
          duration?: number | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      admin_logs: {
        Row: {
          id: string
          admin_id: string
          action: string
          target_user_id: string | null
          details: Json
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          admin_id: string
          action: string
          target_user_id?: string | null
          details?: Json
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          admin_id?: string
          action?: string
          target_user_id?: string | null
          details?: Json
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
      }
      sora_tasks: {
        Row: {
          id: string
          user_id: string
          project_id: string
          scene_id: string | null
          shot_id: string | null
          shot_ids: string[] | null
          shot_ranges: Json | null
          character_id: string | null
          status: 'queued' | 'processing' | 'completed' | 'failed'
          progress: number
          model: string
          prompt: string | null
          target_duration: number | null
          target_size: string | null
          kaponai_url: string | null
          r2_url: string | null
          point_cost: number
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          user_id: string
          project_id: string
          scene_id?: string | null
          shot_id?: string | null
          shot_ids?: string[] | null
          shot_ranges?: Json | null
          character_id?: string | null
          status?: 'queued' | 'processing' | 'completed' | 'failed'
          progress?: number
          model?: string
          prompt?: string | null
          target_duration?: number | null
          target_size?: string | null
          kaponai_url?: string | null
          r2_url?: string | null
          point_cost?: number
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          project_id?: string
          scene_id?: string | null
          shot_id?: string | null
          shot_ids?: string[] | null
          shot_ranges?: Json | null
          character_id?: string | null
          status?: 'queued' | 'processing' | 'completed' | 'failed'
          progress?: number
          model?: string
          prompt?: string | null
          target_duration?: number | null
          target_size?: string | null
          kaponai_url?: string | null
          r2_url?: string | null
          point_cost?: number
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Functions: {
      consume_credits: {
        Args: {
          p_user_id: string
          p_amount: number
          p_operation_type: string
          p_description?: string | null
        }
        Returns: Json
      }
      grant_credits: {
        Args: {
          p_user_id: string
          p_amount: number
          p_admin_id: string
          p_admin_note?: string | null
        }
        Returns: Json
      }
      get_user_credits: {
        Args: {
          p_user_id: string
        }
        Returns: number
      }
      refund_credits: {
        Args: {
          p_user_id: string
          p_amount: number
          p_description?: string | null
        }
        Returns: Json
      }
    }
  }
}
