import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://rcttkxlqrboraknixddp.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjdHRreGxxcmJvcmFrbml4ZGRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NzgxNjgsImV4cCI6MjEwMTM1NDE2OH0.uczLS_N2brRKSbdwz9775X0Wrf63-g-3MvV6aH2r3bs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      // Çizim oyunu saniyede ~22 toplu mesaj yollar; 10'luk varsayılan tavan
      // bu mesajları kırpıp uzak tuvalde takılmaya yol açıyordu.
      eventsPerSecond: 40,
    },
  },
});
