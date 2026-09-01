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
  is_public?: boolean;
  created_by?: string;
  created_at: string;
  members: FamilyMember[];
}

export interface PollVoter {
  user_id: string;
  name: string;
  avatar: string | null;
}

export interface PollData {
  poll_id: string;
  message_id?: string;
  question: string;
  options: string[];
  duration_hours: number;
  expires_at: string;
  is_closed: boolean;
  tallies?: Record<string | number, number>;
  voters?: Record<string | number, PollVoter[]>;
  total_votes?: number;
  my_vote?: number | null;
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
  client_message_id?: string;
  status?: 'sending' | 'sent' | 'failed';
  poll?: PollData;
  retryPayload?: {
    content?: string;
    media_url?: string;
    media_thumbnail_url?: string;
    media_type?: string;
  };
}

export interface TaskItem {
  id: string;
  family_id: string;
  created_by: string;
  assigned_to?: string | null;
  title: string;
  description?: string | null;
  priority: 'normal' | 'urgent';
  is_completed: boolean;
  completed_at?: string | null;
  completed_by?: string | null;
  due_date?: string | null;
  created_at: string;
  updated_at: string;
  creator_name?: string | null;
  assignee_name?: string | null;
  completer_name?: string | null;
}

export interface BudgetItem {
  id: string;
  family_id: string;
  created_by: string;
  type: 'expense' | 'income';
  amount: number;
  category: string;
  title: string;
  description?: string | null;
  transaction_date: string;
  created_at: string;
  creator_name?: string | null;
}

export interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
  count: number;
}

export interface BudgetSummary {
  month: number;
  year: number;
  month_name: string;
  total_income: number;
  total_expense: number;
  net_balance: number;
  transaction_count: number;
  categories: CategoryBreakdown[];
  prev_month_expense?: number | null;
  expense_change_percent?: number | null;
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
