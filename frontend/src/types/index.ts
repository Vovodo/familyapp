export interface User {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
  role: string;
  created_at: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  user_id: string;
  nickname?: string;
  role: 'admin' | 'member';
  joined_at: string;
  user?: User;
}

export interface Family {
  id: string;
  name: string;
  invite_code: string;
  created_by?: string;
  created_at: string;
  members: FamilyMember[];
}

export interface Message {
  id: string;
  family_id: string;
  sender_id: string;
  content?: string;
  media_url?: string;
  media_thumbnail_url?: string;
  media_type?: string;
  is_edited: boolean;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string;
  sender_nickname?: string;
}

export interface MediaItem {
  id: string;
  family_id: string;
  uploader_id: string;
  storage_path: string;
  public_url: string;
  thumbnail_url?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  caption?: string;
  taken_at: string;
  created_at: string;
  uploader_name?: string;
}

export interface ShoppingItem {
  id: string;
  family_id: string;
  created_by: string;
  completed_by?: string;
  title: string;
  quantity: string;
  category: string;
  is_completed: boolean;
  completed_at?: string;
  created_at: string;
  creator_name?: string;
  completed_by_name?: string;
}

export interface Note {
  id: string;
  family_id: string;
  author_id: string;
  title: string;
  content: string;
  is_private: boolean;
  color: string;
  created_at: string;
  updated_at: string;
  author_name?: string;
}

export interface Reminder {
  id: string;
  family_id: string;
  creator_id: string;
  title: string;
  description?: string;
  remind_at: string;
  repeat_interval: string;
  notify_before_minutes: number;
  is_completed: boolean;
  created_at: string;
  creator_name?: string;
}

export interface NotificationItem {
  id: string;
  family_id: string;
  recipient_id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  data?: string;
  created_at: string;
}

export interface IntegrationItem {
  name: string;
  active: boolean;
  status: string;
  detail: string;
  provider?: string;
  bucket?: string;
  from_email?: string;
  latency_ms?: number;
  project_url?: string;
}

export interface AdminDashboardData {
  integrations: {
    database: IntegrationItem;
    supabase_auth: IntegrationItem;
    storage: IntegrationItem;
    resend_email: IntegrationItem;
    capacitor_mobile: IntegrationItem;
  };
  stats: {
    total_users: number;
    total_families: number;
    total_messages: number;
    total_media: number;
    total_shopping: number;
    total_notes: number;
    total_reminders: number;
  };
  server: {
    environment: string;
    debug: boolean;
    cors_origins: string[];
  };
}
