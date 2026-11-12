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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      marketplace_listings: {
        Row: {
          attributes: Json
          category: string | null
          compare_at_price: number | null
          description: string | null
          id: string
          images: string[]
          marketing_angles: Json
          price: number
          product_id: string
          published_at: string
          seller_id: string
          sku: string | null
          specifications: Json
          status: string
          stock: number
          title: string
          updated_at: string
          variant_images: Json
        }
        Insert: {
          attributes?: Json
          category?: string | null
          compare_at_price?: number | null
          description?: string | null
          id?: string
          images?: string[]
          marketing_angles?: Json
          price?: number
          product_id: string
          published_at?: string
          seller_id: string
          sku?: string | null
          specifications?: Json
          status?: string
          stock?: number
          title: string
          updated_at?: string
          variant_images?: Json
        }
        Update: {
          attributes?: Json
          category?: string | null
          compare_at_price?: number | null
          description?: string | null
          id?: string
          images?: string[]
          marketing_angles?: Json
          price?: number
          product_id?: string
          published_at?: string
          seller_id?: string
          sku?: string | null
          specifications?: Json
          status?: string
          stock?: number
          title?: string
          updated_at?: string
          variant_images?: Json
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_orders: {
        Row: {
          amount: number
          created_at: string
          customer_contact: string
          customer_name: string
          delivery_address: string
          id: string
          listing_id: string
          order_number: string
          paid: boolean
          payment_method: string
          product_id: string
          quantity: number
          seller_id: string
          status: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_contact: string
          customer_name: string
          delivery_address: string
          id?: string
          listing_id: string
          order_number: string
          paid?: boolean
          payment_method?: string
          product_id: string
          quantity: number
          seller_id: string
          status?: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_contact?: string
          customer_name?: string
          delivery_address?: string
          id?: string
          listing_id?: string
          order_number?: string
          paid?: boolean
          payment_method?: string
          product_id?: string
          quantity?: number
          seller_id?: string
          status?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reports: {
        Row: {
          created_at: string
          id: string
          message: string | null
          product_id: string
          reason: string
          reporter_contact: string | null
          reporter_id: string | null
          reporter_name: string | null
          seller_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          product_id: string
          reason: string
          reporter_contact?: string | null
          reporter_id?: string | null
          reporter_name?: string | null
          seller_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          product_id?: string
          reason?: string
          reporter_contact?: string | null
          reporter_id?: string | null
          reporter_name?: string | null
          seller_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reports_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          attributes: Json | null
          bundle_items: Json | null
          category: string | null
          compare_at_price: number | null
          created_at: string
          description: string | null
          id: string
          images: string[] | null
          name: string
          price: number
          product_type: string | null
          purchase_price: number | null
          sku: string | null
          specifications: Json | null
          status: string
          stock: number
          updated_at: string
          user_id: string
          variant_images: Json | null
          virtual_files: Json | null
        }
        Insert: {
          attributes?: Json | null
          bundle_items?: Json | null
          category?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          images?: string[] | null
          name: string
          price?: number
          product_type?: string | null
          purchase_price?: number | null
          sku?: string | null
          specifications?: Json | null
          status?: string
          stock?: number
          updated_at?: string
          user_id: string
          variant_images?: Json | null
          virtual_files?: Json | null
        }
        Update: {
          attributes?: Json | null
          bundle_items?: Json | null
          category?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          images?: string[] | null
          name?: string
          price?: number
          product_type?: string | null
          purchase_price?: number | null
          sku?: string | null
          specifications?: Json | null
          status?: string
          stock?: number
          updated_at?: string
          user_id?: string
          variant_images?: Json | null
          virtual_files?: Json | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: string
          birth_date: string | null
          categories: string[] | null
          category: string | null
          city: string | null
          country: string | null
          created_at: string
          first_name: string | null
          gender: string | null
          id: string
          language: string | null
          last_name: string | null
          neighborhood: string | null
          niu: string | null
          payment_method: string | null
          phone: string | null
          region: string | null
          share_location: boolean | null
          shop_address: string | null
          shop_banner_url: string | null
          shop_description: string | null
          shop_email: string | null
          shop_logo_url: string | null
          shop_name: string | null
          updated_at: string
        }
        Insert: {
          account_type?: string
          birth_date?: string | null
          categories?: string[] | null
          category?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          first_name?: string | null
          gender?: string | null
          id: string
          language?: string | null
          last_name?: string | null
          neighborhood?: string | null
          niu?: string | null
          payment_method?: string | null
          phone?: string | null
          region?: string | null
          share_location?: boolean | null
          shop_address?: string | null
          shop_banner_url?: string | null
          shop_description?: string | null
          shop_email?: string | null
          shop_logo_url?: string | null
          shop_name?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          birth_date?: string | null
          categories?: string[] | null
          category?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          first_name?: string | null
          gender?: string | null
          id?: string
          language?: string | null
          last_name?: string | null
          neighborhood?: string | null
          niu?: string | null
          payment_method?: string | null
          phone?: string | null
          region?: string | null
          share_location?: boolean | null
          shop_address?: string | null
          shop_banner_url?: string | null
          shop_description?: string | null
          shop_email?: string | null
          shop_logo_url?: string | null
          shop_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      seller_documents: {
        Row: {
          created_at: string
          doc_type: string
          file_url: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          doc_type: string
          file_url: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_url?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      place_marketplace_order: {
        Args: {
          _customer_contact: string
          _customer_name: string
          _delivery_address: string
          _payment_method: string
          _product_id: string
          _quantity: number
        }
        Returns: {
          amount: number
          order_number: string
        }[]
      }
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
  public: {
    Enums: {},
  },
} as const
