import type { CoordinatePrecision, EntryType, MediaPeriod, Scope } from "./atlas";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type GeoJsonPoint = {
  type: "Point";
  coordinates: [number, number];
};

export type RpcCoordinates = {
  latitude: number;
  longitude: number;
};

export type RpcHistoricalEntry = {
  id: string;
  title: string;
  slug: string;
  scope: Scope;
  entryType: EntryType;
  era: string | null;
  startYear: number | null;
  endYear: number | null;
  dateIsApproximate: boolean;
  locationName: string | null;
  summary: string;
  significance: string | null;
  origin: RpcCoordinates | null;
  current: RpcCoordinates | null;
  originPrecision: CoordinatePrecision;
  currentPrecision: CoordinatePrecision | null;
  originSource: string | null;
  currentSource: string | null;
  reviewed: boolean;
};

export type SearchViewportResult = {
  entries: RpcHistoricalEntry[];
  hasMore: boolean;
  nextOffset: number | null;
};

export type SearchEntriesResult = {
  entries: RpcHistoricalEntry[];
  hasMore: boolean;
  nextOffset: number | null;
  totalMatched: number;
};

export type SetEntryReviewedResult = {
  id: string;
  reviewed: boolean;
};

export type Database = {
  public: {
    Tables: {
      entries: {
        Row: {
          id: string;
          title: string;
          slug: string;
          scope: Scope;
          entry_type: EntryType;
          era: string | null;
          start_year: number | null;
          end_year: number | null;
          date_is_approximate: boolean;
          location_name: string | null;
          summary: string;
          significance: string | null;
          origin_location: GeoJsonPoint | string | null;
          current_location: GeoJsonPoint | string | null;
          origin_coordinate_precision: CoordinatePrecision;
          current_coordinate_precision: CoordinatePrecision | null;
          origin_coordinate_source: string | null;
          current_coordinate_source: string | null;
          reviewed: boolean;
          created_at: string;
          updated_at: string;
          search_document: unknown | null;
        };
        Insert: {
          id?: string;
          title: string;
          slug: string;
          scope: Scope;
          entry_type: EntryType;
          era?: string | null;
          start_year?: number | null;
          end_year?: number | null;
          date_is_approximate?: boolean;
          location_name?: string | null;
          summary: string;
          significance?: string | null;
          origin_location?: GeoJsonPoint | string | null;
          current_location?: GeoJsonPoint | string | null;
          origin_coordinate_precision?: CoordinatePrecision;
          current_coordinate_precision?: CoordinatePrecision | null;
          origin_coordinate_source?: string | null;
          current_coordinate_source?: string | null;
          reviewed?: boolean;
          created_at?: string;
          updated_at?: string;
          search_document?: never;
        };
        Update: {
          id?: string;
          title?: string;
          slug?: string;
          scope?: Scope;
          entry_type?: EntryType;
          era?: string | null;
          start_year?: number | null;
          end_year?: number | null;
          date_is_approximate?: boolean;
          location_name?: string | null;
          summary?: string;
          significance?: string | null;
          origin_location?: GeoJsonPoint | string | null;
          current_location?: GeoJsonPoint | string | null;
          origin_coordinate_precision?: CoordinatePrecision;
          current_coordinate_precision?: CoordinatePrecision | null;
          origin_coordinate_source?: string | null;
          current_coordinate_source?: string | null;
          reviewed?: boolean;
          created_at?: string;
          updated_at?: string;
          search_document?: never;
        };
        Relationships: [];
      };
      user_entry_progress: {
        Row: {
          user_id: string;
          entry_id: string;
          visited: boolean;
          personal_notes: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          entry_id: string;
          visited?: boolean;
          personal_notes?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          entry_id?: string;
          visited?: boolean;
          personal_notes?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_entry_progress_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "entries";
            referencedColumns: ["id"];
          },
        ];
      };
      entry_media: {
        Row: {
          id: string;
          entry_id: string;
          image_url: string;
          source_url: string | null;
          caption: string | null;
          photo_year: number | null;
          media_period: MediaPeriod;
          creator: string | null;
          attribution_text: string | null;
          license: string | null;
          license_url: string | null;
          comparison_group: string | null;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          entry_id: string;
          image_url: string;
          source_url?: string | null;
          caption?: string | null;
          photo_year?: number | null;
          media_period?: MediaPeriod;
          creator?: string | null;
          attribution_text?: string | null;
          license?: string | null;
          license_url?: string | null;
          comparison_group?: string | null;
          display_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          entry_id?: string;
          image_url?: string;
          source_url?: string | null;
          caption?: string | null;
          photo_year?: number | null;
          media_period?: MediaPeriod;
          creator?: string | null;
          attribution_text?: string | null;
          license?: string | null;
          license_url?: string | null;
          comparison_group?: string | null;
          display_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entry_media_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "entries";
            referencedColumns: ["id"];
          },
        ];
      };
      entry_links: {
        Row: {
          id: string;
          source_id: string;
          target_id: string;
          relationship_type: string;
          relationship_label: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          target_id: string;
          relationship_type: string;
          relationship_label: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string;
          target_id?: string;
          relationship_type?: string;
          relationship_label?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entry_links_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entry_links_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "entries";
            referencedColumns: ["id"];
          },
        ];
      };
      entry_sources: {
        Row: {
          id: string;
          entry_id: string;
          source_title: string;
          source_url: string;
          publisher: string | null;
          author: string | null;
          publication_year: number | null;
          accessed_at: string;
          source_type: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          entry_id: string;
          source_title: string;
          source_url: string;
          publisher?: string | null;
          author?: string | null;
          publication_year?: number | null;
          accessed_at?: string;
          source_type?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          entry_id?: string;
          source_title?: string;
          source_url?: string;
          publisher?: string | null;
          author?: string | null;
          publication_year?: number | null;
          accessed_at?: string;
          source_type?: string | null;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "entry_sources_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "entries";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          user_id: string;
          role: "owner" | "curator" | "viewer";
          created_at: string;
        };
        Insert: {
          user_id: string;
          role: "owner" | "curator" | "viewer";
          created_at?: string;
        };
        Update: {
          user_id?: string;
          role?: "owner" | "curator" | "viewer";
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_curator: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      search_viewport: {
        Args: {
          p_min_lat: number;
          p_min_lon: number;
          p_max_lat: number;
          p_max_lon: number;
          p_scope?: string | null;
          p_entry_type?: string | null;
          p_min_year?: number | null;
          p_max_year?: number | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: SearchViewportResult;
      };
      search_entries: {
        Args: {
          p_query?: string | null;
          p_scope?: string | null;
          p_entry_type?: string | null;
          p_min_year?: number | null;
          p_max_year?: number | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: SearchEntriesResult;
      };
      import_historical_entry: {
        Args: {
          p_payload: Json;
        };
        Returns: RpcHistoricalEntry;
      };
      set_entry_reviewed: {
        Args: {
          p_entry_id: string;
          p_reviewed: boolean;
        };
        Returns: SetEntryReviewedResult;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
