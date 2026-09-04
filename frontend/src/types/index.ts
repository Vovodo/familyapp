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
  cloud_chat_backup_enabled?: boolean;
  last_chat_backup_at?: string | null;
  chat_backup_size_bytes?: number;
  chat_backup_message_count?: number;
  chat_backup_media_count?: number;
  created_at: string;
  members: FamilyMember[];
}

export interface SyncStatus {
  family_id: string;
  cloud_chat_backup_enabled: boolean;
  last_chat_backup_at?: string | null;
  chat_backup_size_bytes: number;
  chat_backup_message_count: number;
  chat_backup_media_count: number;
  mandatory_sync_health: string;
}

export interface CategoryQuotaMetric {
  category: 'CHAT' | 'IMAGE' | 'AUDIO';
  percent_quota: number;
  quota_bytes: number;
  used_bytes: number;
  available_bytes: number;
  usage_percent: number;
  item_count: number;
}

export interface StorageQuotaBreakdown {
  family_id?: string;
  total_capacity_bytes: number;
  total_used_bytes: number;
  total_available_bytes: number;
  total_usage_percent: number;
  occupancy_level: 'NORMAL' | 'WARNING' | 'HIGH' | 'CRITICAL';
  chat: CategoryQuotaMetric;
  image: CategoryQuotaMetric;
  audio: CategoryQuotaMetric;
}

export interface StorageReconciliationReport {
  status: string;
  reconciled_at: string;
  db_total_bytes: number;
  storage_actual_bytes: number;
  discrepancy_bytes: number;
  orphan_files_detected: number;
  orphan_files_purged: number;
  purged_bytes: number;
  details: string[];
}

export interface CleanupJobLog {
  id: string;
  family_id?: string;
  category: string;
  trigger_reason: string;
  required_bytes: number;
  freed_bytes: number;
  deleted_messages_count: number;
  deleted_storage_objects_count: number;
  status: string;
  started_at: string;
  completed_at?: string;
}

export interface RestoreProgress {
  step: 'fetching' | 'saving_messages' | 'downloading_media' | 'completed' | 'error';
  percent: number;
  completedMessages: number;
  totalMessages: number;
  completedMedia: number;
  totalMedia: number;
  error?: string;
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
  local_media_path?: string;
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
  updated_at?: string;
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

export interface DrawingPlayer {
  user_id: string;
  name: string;
  avatar_url?: string | null;
  score: number;
  rounds_drawn: number;
  is_drawer: boolean;
  is_online?: boolean;
}

export interface DrawingGuessItem {
  id: string;
  user_id: string;
  name: string;
  text: string;
  is_correct: boolean;
  created_at: string;
}

export interface DrawingGameState {
  game_id: string | null;
  status: 'none' | 'lobby' | 'drawing' | 'round_end' | 'finished';
  round_number: number;
  drawer_user_id: string | null;
  drawer_name: string | null;
  is_drawer: boolean;
  /** Yalnızca çizen oyuncuya gelir. */
  word: string | null;
  /** Tahmin edenlere gelen maske. */
  word_masked: string | null;
  word_length: number | null;
  word_category: string | null;
  /** Tur bittiğinde herkese açılan kelime. */
  revealed_word: string | null;
  round_started_at: string | null;
  round_ends_at: string | null;
  seconds_left: number | null;
  countdown_left?: number | null;
  solved_by_user_id: string | null;
  solved_by_name: string | null;
  stroke_seq: number;
  revision?: number;
  players: DrawingPlayer[];
  guesses: DrawingGuessItem[];
  is_player: boolean;
  min_players: number;
  max_players?: number | null;
  family_member_count: number;
  pool_size: number;
  my_words_seen: number;
  online_count?: number;
  started_round?: boolean;
}

export type WordWarStatus = 'none' | 'lobby' | 'countdown' | 'playing' | 'round_end' | 'winner' | 'finished';

export type WordWarPlayerStatus = 'idle' | 'thinking' | 'critical' | 'answered' | 'miss' | 'frozen' | 'won';

export interface WordWarPlayer {
  user_id: string;
  name: string;
  avatar_url?: string | null;
  score: number;
  correct_count: number;
  miss_count: number;
  round_score: number;
  last_status: WordWarPlayerStatus | string;
  is_current: boolean;
  is_online: boolean;
}

export interface WordWarLastResult {
  kind: 'accepted' | 'invalid' | 'timeout' | 'frozen' | string;
  user_id?: string | null;
  name?: string | null;
  word?: string | null;
  delta: number;
  reason?: string | null;
}

export interface WordWarRoundSummary {
  round_number: number;
  scores: WordWarPlayer[];
  fastest_user_id?: string | null;
  fastest_name?: string | null;
  correct_count: number;
  miss_count: number;
}

export interface WordWarWinnerStats {
  winner_user_id?: string | null;
  winner_name?: string | null;
  fastest_user_id?: string | null;
  fastest_name?: string | null;
  word_master_user_id?: string | null;
  word_master_name?: string | null;
  risk_taker_user_id?: string | null;
  risk_taker_name?: string | null;
}

export interface WordWarState {
  game_id: string | null;
  status: WordWarStatus;
  round_number: number;
  total_rounds: number;
  current_player_id: string | null;
  current_player_name: string | null;
  is_my_turn: boolean;
  previous_word: string | null;
  required_letter: string | null;
  event_type: string | null;
  event_label: string | null;
  event_category: string | null;
  turn_started_at: string | null;
  turn_ends_at: string | null;
  phase_ends_at: string | null;
  seconds_left: number | null;
  countdown_left?: number | null;
  turn_seconds: number;
  revision: number;
  players: WordWarPlayer[];
  last_result: WordWarLastResult | null;
  round_summary: WordWarRoundSummary | null;
  winner_stats: WordWarWinnerStats | null;
  used_count: number;
  is_player: boolean;
  min_players: number;
  family_member_count: number;
  online_count: number;
  server_now?: string | null;
}

export type WatchPlaybackState = 'idle' | 'playing' | 'paused' | 'ended';

export interface WatchParticipant {
  user_id: string;
  name: string;
  avatar_url?: string | null;
  is_host: boolean;
  is_online: boolean;
}

export interface WatchRoomState {
  room_id: string;
  title: string;
  status: 'open' | 'ended' | string;
  provider: string | null;
  video_id: string | null;
  video_url: string | null;
  video_title: string | null;
  duration_ms: number | null;
  playback_state: WatchPlaybackState | string;
  position_ms: number;
  playback_rate: number;
  control_seq: number;
  host_user_id: string | null;
  host_name: string | null;
  created_by: string | null;
  is_host: boolean;
  can_control: boolean;
  is_participant: boolean;
  participants: WatchParticipant[];
  online_count: number;
  server_now: string;
  created_at: string;
  updated_at?: string | null;
}

export interface WatchRoomListItem {
  room_id: string;
  title: string;
  status: string;
  video_title: string | null;
  video_id: string | null;
  provider: string | null;
  playback_state: string;
  host_name: string | null;
  online_count: number;
  created_at: string;
}

export interface WatchChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  name: string;
  body: string;
  video_position_ms: number | null;
  client_message_id?: string | null;
  created_at: string;
}

export interface WatchReactionEvent {
  id: string;
  room_id: string;
  user_id: string;
  name: string;
  emoji: string;
  x: number;
  at: number;
}

export interface DrawingStrokeRecord {
  seq: number;
  round_number: number;
  user_id: string;
  kind: 'stroke' | 'clear' | 'undo';
  payload: { c: string; w: number; p: number[]; k?: string } | null;
}

export interface DrawingStrokesResponse {
  game_id: string;
  round_number: number;
  stroke_seq: number;
  strokes: DrawingStrokeRecord[];
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

export interface VoiceParticipant {
  user_id: string;
  name: string;
  avatar_url?: string | null;
  muted: boolean;
  speaking?: boolean;
  is_self: boolean;
  joined_at?: string;
}

export interface VoiceChannelState {
  family_id: string;
  family_name: string;
  participants: VoiceParticipant[];
  participant_count: number;
  self_in_channel: boolean;
  self_muted: boolean;
  server_now: string;
  firebase_token?: string | null;
  firebase_config?: {
    apiKey: string;
    authDomain: string;
    databaseURL: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  } | null;
  ice_servers?: RTCIceServer[];
}
