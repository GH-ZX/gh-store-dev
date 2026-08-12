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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
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
      categories: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name_ar: string
          name_en: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name_ar: string
          name_en: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name_ar?: string
          name_en?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      game_input_fields: {
        Row: {
          created_at: string
          field_key: string
          field_type: string
          game_id: string
          id: string
          is_required: boolean
          label_ar: string
          label_en: string
          options: Json
          placeholder_ar: string | null
          placeholder_en: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_key: string
          field_type?: string
          game_id: string
          id?: string
          is_required?: boolean
          label_ar: string
          label_en: string
          options?: Json
          placeholder_ar?: string | null
          placeholder_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_key?: string
          field_type?: string
          game_id?: string
          id?: string
          is_required?: boolean
          label_ar?: string
          label_en?: string
          options?: Json
          placeholder_ar?: string | null
          placeholder_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_input_fields_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_regions: {
        Row: {
          code: string
          created_at: string
          game_id: string
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          game_id: string
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          game_id?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_regions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          carousel_badge_ar: string | null
          carousel_badge_en: string | null
          carousel_focus_x: number
          carousel_focus_y: number
          carousel_order: number | null
          category_id: string | null
          created_at: string
          description_ar: string | null
          description_en: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          logo_url: string | null
          name_ar: string
          name_en: string
          points_name_ar: string | null
          points_name_en: string | null
          show_in_carousel: boolean
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          carousel_badge_ar?: string | null
          carousel_badge_en?: string | null
          carousel_focus_x?: number
          carousel_focus_y?: number
          carousel_order?: number | null
          category_id?: string | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          logo_url?: string | null
          name_ar: string
          name_en: string
          points_name_ar?: string | null
          points_name_en?: string | null
          show_in_carousel?: boolean
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          carousel_badge_ar?: string | null
          carousel_badge_en?: string | null
          carousel_focus_x?: number
          carousel_focus_y?: number
          carousel_order?: number | null
          category_id?: string | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          logo_url?: string | null
          name_ar?: string
          name_en?: string
          points_name_ar?: string | null
          points_name_en?: string | null
          show_in_carousel?: boolean
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          created_at: string
          currency: string
          description_ar: string | null
          description_en: string | null
          game_id: string
          id: string
          is_active: boolean
          is_sale: boolean
          name_ar: string
          name_en: string
          offer_type: string
          original_price: number | null
          price: number
          region_code: string | null
          sale_image_url: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description_ar?: string | null
          description_en?: string | null
          game_id: string
          id?: string
          is_active?: boolean
          is_sale?: boolean
          name_ar: string
          name_en: string
          offer_type?: string
          original_price?: number | null
          price: number
          region_code?: string | null
          sale_image_url?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description_ar?: string | null
          description_en?: string | null
          game_id?: string
          id?: string
          is_active?: boolean
          is_sale?: boolean
          name_ar?: string
          name_en?: string
          offer_type?: string
          original_price?: number | null
          price?: number
          region_code?: string | null
          sale_image_url?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          role: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          role?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      provider_game_mappings: {
        Row: {
          created_at: string
          external_game_code: string
          game_id: string
          id: string
          metadata: Json
          provider_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_game_code: string
          game_id: string
          id?: string
          metadata?: Json
          provider_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_game_code?: string
          game_id?: string
          id?: string
          metadata?: Json
          provider_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_game_mappings_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_offer_mappings: {
        Row: {
          created_at: string
          external_catalogue_name: string | null
          external_product_id: string | null
          id: string
          markup_percent: number | null
          metadata: Json
          offer_id: string
          pricing_mode: string
          provider_name: string
          supplier_cost_usd: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_catalogue_name?: string | null
          external_product_id?: string | null
          id?: string
          markup_percent?: number | null
          metadata?: Json
          offer_id: string
          pricing_mode?: string
          provider_name: string
          supplier_cost_usd?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_catalogue_name?: string | null
          external_product_id?: string | null
          id?: string
          markup_percent?: number | null
          metadata?: Json
          offer_id?: string
          pricing_mode?: string
          provider_name?: string
          supplier_cost_usd?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_offer_mappings_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: { p_user_id?: string }; Returns: boolean }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
