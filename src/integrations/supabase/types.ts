export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" }
  public: {
    Tables: {
      calibrations: {
        Row: {
          ai_readings: Json | null
          ambient_humidity: number | null
          ambient_temperature: number | null
          article_number: string | null
          calibration_date: string
          certificate_no: string
          comments: string | null
          created_at: string
          customer_id: string
          id: string
          instruments: Json
          machine_category: string | null
          machine_id: string | null
          machine_model: string
          measurements: Json
          next_calibration_date: string | null
          order_number: string | null
          photo_paths: Json
          rated_power: string | null
          rated_voltage: string | null
          result: string
          safety_ground_conductor: string | null
          safety_high_voltage: string | null
          serial_number: string | null
          signature_data: string | null
          technician: string | null
          updated_at: string
        }
        Insert: {
          ai_readings?: Json | null
          ambient_humidity?: number | null
          ambient_temperature?: number | null
          article_number?: string | null
          calibration_date?: string
          certificate_no?: string
          comments?: string | null
          created_at?: string
          customer_id: string
          id?: string
          instruments?: Json
          machine_category?: string | null
          machine_id?: string | null
          machine_model: string
          measurements?: Json
          next_calibration_date?: string | null
          order_number?: string | null
          photo_paths?: Json
          rated_power?: string | null
          rated_voltage?: string | null
          result?: string
          safety_ground_conductor?: string | null
          safety_high_voltage?: string | null
          serial_number?: string | null
          signature_data?: string | null
          technician?: string | null
          updated_at?: string
        }
        Update: {
          ai_readings?: Json | null
          ambient_humidity?: number | null
          ambient_temperature?: number | null
          article_number?: string | null
          calibration_date?: string
          certificate_no?: string
          comments?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          instruments?: Json
          machine_category?: string | null
          machine_id?: string | null
          machine_model?: string
          measurements?: Json
          next_calibration_date?: string | null
          order_number?: string | null
          photo_paths?: Json
          rated_power?: string | null
          rated_voltage?: string | null
          result?: string
          safety_ground_conductor?: string | null
          safety_high_voltage?: string | null
          serial_number?: string | null
          signature_data?: string | null
          technician?: string | null
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "calibrations_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
          { foreignKeyName: "calibrations_machine_id_fkey"; columns: ["machine_id"]; isOneToOne: false; referencedRelation: "machines"; referencedColumns: ["id"] },
        ]
      }
      customers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
        ]
      }
      instruments: {
        Row: {
          active: boolean
          certificate_no: string | null
          certificate_valid_until: string | null
          created_at: string
          device_id: string | null
          id: string
          measure: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          certificate_no?: string | null
          certificate_valid_until?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          measure: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          certificate_no?: string | null
          certificate_valid_until?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          measure?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      machine_models: {
        Row: {
          active: boolean
          article_numbers: string[]
          category: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          article_numbers?: string[]
          category: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          article_numbers?: string[]
          category?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
        ]
      }
      machines: {
        Row: {
          article_number: string | null
          created_at: string
          customer_id: string
          id: string
          machine_category: string
          machine_model: string
          serial_number: string | null
          service_interval_months: number
          updated_at: string
        }
        Insert: {
          article_number?: string | null
          created_at?: string
          customer_id: string
          id?: string
          machine_category: string
          machine_model: string
          serial_number?: string | null
          service_interval_months?: number
          updated_at?: string
        }
        Update: {
          article_number?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          machine_category?: string
          machine_model?: string
          serial_number?: string | null
          service_interval_months?: number
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "machines_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
        ]
      }
      service_protocols: {
        Row: {
          actions_performed: string | null
          air_intake_filter_comment: string | null
          air_intake_filter_status: string | null
          brass_nozzle_comment: string | null
          brass_nozzle_status: string | null
          cable_contact_comment: string | null
          cable_contact_status: string | null
          calibration_items: Json | null
          comments: string | null
          created_at: string
          customer_id: string
          drive_motor_hours: string | null
          fan_motor_hours: string | null
          final_assessment: string | null
          heating_element_comment: string | null
          heating_element_status: string | null
          hot_air_diff: string | null
          hot_air_measured: string | null
          hot_air_status: string | null
          hv_test: string | null
          id: string
          inspection_items: Json | null
          machine_category: string
          machine_id: string | null
          machine_model: string
          material_calculated: string | null
          material_item: Json | null
          material_measured_mass: string | null
          material_status: string | null
          material_type: string | null
          motor_comment: string | null
          motor_status: string | null
          next_calibration_date: string | null
          operation_hours: string | null
          order_number: string | null
          photo_paths: string[] | null
          plastic_mass_diff: string | null
          plastic_mass_measured: string | null
          plastic_mass_status: string | null
          protective_earth: string | null
          protocol_date: string
          reminder_sent_at: string | null
          right_left_feed_comment: string | null
          right_left_feed_status: string | null
          screw_extruder_comment: string | null
          screw_extruder_status: string | null
          serial_number: string | null
          signature_data: string | null
          technician: string | null
          time_spent: string | null
          updated_at: string
        }
        Insert: {
          actions_performed?: string | null
          air_intake_filter_comment?: string | null
          air_intake_filter_status?: string | null
          brass_nozzle_comment?: string | null
          brass_nozzle_status?: string | null
          cable_contact_comment?: string | null
          cable_contact_status?: string | null
          calibration_items?: Json | null
          comments?: string | null
          created_at?: string
          customer_id: string
          drive_motor_hours?: string | null
          fan_motor_hours?: string | null
          final_assessment?: string | null
          heating_element_comment?: string | null
          heating_element_status?: string | null
          hot_air_diff?: string | null
          hot_air_measured?: string | null
          hot_air_status?: string | null
          hv_test?: string | null
          id?: string
          inspection_items?: Json | null
          machine_category: string
          machine_id?: string | null
          machine_model: string
          material_calculated?: string | null
          material_item?: Json | null
          material_measured_mass?: string | null
          material_status?: string | null
          material_type?: string | null
          motor_comment?: string | null
          motor_status?: string | null
          next_calibration_date?: string | null
          operation_hours?: string | null
          order_number?: string | null
          photo_paths?: string[] | null
          plastic_mass_diff?: string | null
          plastic_mass_measured?: string | null
          plastic_mass_status?: string | null
          protective_earth?: string | null
          protocol_date?: string
          reminder_sent_at?: string | null
          right_left_feed_comment?: string | null
          right_left_feed_status?: string | null
          screw_extruder_comment?: string | null
          screw_extruder_status?: string | null
          serial_number?: string | null
          signature_data?: string | null
          technician?: string | null
          time_spent?: string | null
          updated_at?: string
        }
        Update: {
          actions_performed?: string | null
          air_intake_filter_comment?: string | null
          air_intake_filter_status?: string | null
          brass_nozzle_comment?: string | null
          brass_nozzle_status?: string | null
          cable_contact_comment?: string | null
          cable_contact_status?: string | null
          calibration_items?: Json | null
          comments?: string | null
          created_at?: string
          customer_id?: string
          drive_motor_hours?: string | null
          fan_motor_hours?: string | null
          final_assessment?: string | null
          heating_element_comment?: string | null
          heating_element_status?: string | null
          hot_air_diff?: string | null
          hot_air_measured?: string | null
          hot_air_status?: string | null
          hv_test?: string | null
          id?: string
          inspection_items?: Json | null
          machine_category?: string
          machine_id?: string | null
          machine_model?: string
          material_calculated?: string | null
          material_item?: Json | null
          material_measured_mass?: string | null
          material_status?: string | null
          material_type?: string | null
          motor_comment?: string | null
          motor_status?: string | null
          next_calibration_date?: string | null
          operation_hours?: string | null
          order_number?: string | null
          photo_paths?: string[] | null
          plastic_mass_diff?: string | null
          plastic_mass_measured?: string | null
          plastic_mass_status?: string | null
          protective_earth?: string | null
          protocol_date?: string
          reminder_sent_at?: string | null
          right_left_feed_comment?: string | null
          right_left_feed_status?: string | null
          screw_extruder_comment?: string | null
          screw_extruder_status?: string | null
          serial_number?: string | null
          signature_data?: string | null
          technician?: string | null
          time_spent?: string | null
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "service_protocols_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
          { foreignKeyName: "service_protocols_machine_id_fkey"; columns: ["machine_id"]; isOneToOne: false; referencedRelation: "machines"; referencedColumns: ["id"] },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicSchema = Database["public"]
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
