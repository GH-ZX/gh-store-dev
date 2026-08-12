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
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      fulfillment_attempts: {
        Row: {
          attempt_number: number
          completed_at: string | null
          created_at: string
          delivered_payload: Json | null
          error_code: string | null
          error_message: string | null
          external_order_id: string | null
          id: string
          idempotency_key: string | null
          last_checked_at: string | null
          order_item_id: string
          provider: string
          request_payload: Json
          response_payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          delivered_payload?: Json | null
          error_code?: string | null
          error_message?: string | null
          external_order_id?: string | null
          id?: string
          idempotency_key?: string | null
          last_checked_at?: string | null
          order_item_id: string
          provider: string
          request_payload?: Json
          response_payload?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          delivered_payload?: Json | null
          error_code?: string | null
          error_message?: string | null
          external_order_id?: string | null
          id?: string
          idempotency_key?: string | null
          last_checked_at?: string | null
          order_item_id?: string
          provider?: string
          request_payload?: Json
          response_payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_attempts_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_events: {
        Row: {
          external_event_id: string
          fulfillment_attempt_id: string | null
          id: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          provider: string
          received_at: string
          status: string | null
        }
        Insert: {
          external_event_id: string
          fulfillment_attempt_id?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          provider: string
          received_at?: string
          status?: string | null
        }
        Update: {
          external_event_id?: string
          fulfillment_attempt_id?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          received_at?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_events_fulfillment_attempt_id_fkey"
            columns: ["fulfillment_attempt_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_attempts"
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
      idempotency_keys: {
        Row: {
          created_at: string
          expires_at: string
          key: string
          operation: string
          response_body: Json | null
          response_status: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          key: string
          operation: string
          response_body?: Json | null
          response_status?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          key?: string
          operation?: string
          response_body?: Json | null
          response_status?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          currency: string
          document_data: Json
          entity_id: string
          entity_type: string
          id: string
          invoice_number: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          document_data?: Json
          entity_id: string
          entity_type: string
          id?: string
          invoice_number?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          document_data?: Json
          entity_id?: string
          entity_type?: string
          id?: string
          invoice_number?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body_ar: string
          body_en: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          href: string | null
          id: string
          is_read: boolean
          is_visible: boolean
          notification_type: string
          title_ar: string
          title_en: string
          user_id: string
        }
        Insert: {
          body_ar: string
          body_en: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          href?: string | null
          id?: string
          is_read?: boolean
          is_visible?: boolean
          notification_type: string
          title_ar: string
          title_en: string
          user_id: string
        }
        Update: {
          body_ar?: string
          body_en?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          href?: string | null
          id?: string
          is_read?: boolean
          is_visible?: boolean
          notification_type?: string
          title_ar?: string
          title_en?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      order_items: {
        Row: {
          created_at: string
          dynamic_fields: Json
          id: string
          metadata: Json
          name_ar_snapshot: string
          name_en_snapshot: string
          offer_id: string | null
          order_id: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          dynamic_fields?: Json
          id?: string
          metadata?: Json
          name_ar_snapshot: string
          name_en_snapshot: string
          offer_id?: string | null
          order_id: string
          quantity?: number
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          dynamic_fields?: Json
          id?: string
          metadata?: Json
          name_ar_snapshot?: string
          name_en_snapshot?: string
          offer_id?: string | null
          order_id?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          completed_at: string | null
          created_at: string
          currency: string
          customer_note: string | null
          discount: number
          id: string
          metadata: Json
          order_number: string
          payment_attempt_id: string | null
          payment_method: string | null
          payment_status: string
          status: string
          subtotal: number
          total: number
          updated_at: string
          user_id: string
          wallet_transaction_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          currency?: string
          customer_note?: string | null
          discount?: number
          id?: string
          metadata?: Json
          order_number?: string
          payment_attempt_id?: string | null
          payment_method?: string | null
          payment_status?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id: string
          wallet_transaction_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          currency?: string
          customer_note?: string | null
          discount?: number
          id?: string
          metadata?: Json
          order_number?: string
          payment_attempt_id?: string | null
          payment_method?: string | null
          payment_status?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string
          wallet_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          entity_id: string
          entity_type: string
          expires_at: string | null
          external_payment_id: string | null
          id: string
          idempotency_key: string | null
          paid_at: string | null
          payment_url: string | null
          provider: string
          provider_payload: Json
          status: string
          transaction_reference: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          entity_id: string
          entity_type: string
          expires_at?: string | null
          external_payment_id?: string | null
          id?: string
          idempotency_key?: string | null
          paid_at?: string | null
          payment_url?: string | null
          provider: string
          provider_payload?: Json
          status?: string
          transaction_reference?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          entity_id?: string
          entity_type?: string
          expires_at?: string | null
          external_payment_id?: string | null
          id?: string
          idempotency_key?: string | null
          paid_at?: string | null
          payment_url?: string | null
          provider?: string
          provider_payload?: Json
          status?: string
          transaction_reference?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount: number | null
          currency: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string
          external_event_id: string
          id: string
          payload: Json
          payment_attempt_id: string | null
          processed_at: string | null
          processing_error: string | null
          provider: string
          received_at: string
        }
        Insert: {
          amount?: number | null
          currency?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          external_event_id: string
          id?: string
          payload?: Json
          payment_attempt_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          provider: string
          received_at?: string
        }
        Update: {
          amount?: number | null
          currency?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          external_event_id?: string
          id?: string
          payload?: Json
          payment_attempt_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
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
      recharge_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          exchange_rate: number | null
          id: string
          payment_method: string
          reference: string
          requested_amount: number
          requested_currency: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
          wallet_credit_amount: number | null
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          exchange_rate?: number | null
          id?: string
          payment_method: string
          reference: string
          requested_amount: number
          requested_currency?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
          wallet_credit_amount?: number | null
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          exchange_rate?: number | null
          id?: string
          payment_method?: string
          reference?: string
          requested_amount?: number
          requested_currency?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          wallet_credit_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recharge_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recharge_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          admin_note: string | null
          body: string
          created_at: string
          display_name: string
          id: string
          is_featured: boolean
          locale: string
          order_id: string | null
          rating: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_note?: string | null
          body: string
          created_at?: string
          display_name: string
          id?: string
          is_featured?: boolean
          locale?: string
          order_id?: string | null
          rating: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_note?: string | null
          body?: string
          created_at?: string
          display_name?: string
          id?: string
          is_featured?: boolean
          locale?: string
          order_id?: string | null
          rating?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          contact: Json
          created_at: string
          home_layout: Json
          id: string
          maintenance_message_ar: string | null
          maintenance_message_en: string | null
          maintenance_mode: boolean
          payments: Json
          providers: Json
          seo: Json
          social_links: Json
          theme: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contact?: Json
          created_at?: string
          home_layout?: Json
          id?: string
          maintenance_message_ar?: string | null
          maintenance_message_en?: string | null
          maintenance_mode?: boolean
          payments?: Json
          providers?: Json
          seo?: Json
          social_links?: Json
          theme?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contact?: Json
          created_at?: string
          home_layout?: Json
          id?: string
          maintenance_message_ar?: string | null
          maintenance_message_en?: string | null
          maintenance_mode?: boolean
          payments?: Json
          providers?: Json
          seo?: Json
          social_links?: Json
          theme?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string | null
          sender_role: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_role: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_threads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          description: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          payment_method: string | null
          reference_id: string | null
          reference_type: string | null
          type: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          description?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          payment_method?: string | null
          reference_id?: string | null
          reference_type?: string | null
          type: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          description?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          payment_method?: string | null
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      credit_wallet: {
        Args: {
          p_amount: number
          p_description?: string
          p_idempotency_key?: string
          p_reference_id?: string
          p_reference_type?: string
          p_user_id: string
        }
        Returns: {
          balance: number
          idempotent: boolean
          transaction_id: string
          wallet_id: string
        }[]
      }
      debit_wallet: {
        Args: {
          p_amount: number
          p_description?: string
          p_idempotency_key?: string
          p_reference_id?: string
          p_reference_type?: string
          p_user_id: string
        }
        Returns: {
          balance: number
          idempotent: boolean
          transaction_id: string
          wallet_id: string
        }[]
      }
      get_home_layout: { Args: never; Returns: Json }
      get_public_store_settings: { Args: never; Returns: Json }
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
