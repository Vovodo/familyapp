import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Database,
  Key,
  HardDrive,
  Mail,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Users,
  MessageCircle,
  Image as ImageIcon,
  ShoppingBag,
  StickyNote,
  Bell,
  ArrowLeft,
  Send,
  Loader2,
  Server,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AdminDashboardData } from '../../types';
import { api } from '../../services/api';

export const AdminDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStatus = async () => {
    setIsRefreshing(true);
    try {
      const res = await api.get<AdminDashboardData>('/admin/integrations');
      setData(res.data);
    } catch (err: any) {
      console.error('Admin status error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    if (!autoRefresh) return;
    const interval = setInterval(fetchStatus, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleSendTestEmail = async () => {
    setIsSendingTestEmail(true);
    setTestEmailResult(null);
    try {
      const res = await api.post('/admin/test-email');
      if (res.data.status === 'success') {
        setTestEmailResult('✓ Test e-postası başarıyla gönderildi!');
      } else {
        setTestEmailResult(`✗ Hata: ${res.data.detail || 'Gönderilemedi'}`);
      }
    } catch (err: any) {
      setTestEmailResult(`✗ Hata: ${err.message}`);
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-6 text-center max-w-md mx-auto py-20 space-y-4">
        <XCircle className="w-16 h-16 text-red-500 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900">Erişim Reddedildi</h2>
        <p className="text-sm text-gray-600">Bu sayfayı yalnızca sistem yöneticisi görüntüleyebilir.</p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 bg-family-600 text-white font-bold rounded-2xl text-sm"
        >
          Ana Sayfaya Dön
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto pb-24">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="p-2.5 bg-white border border-gray-200 rounded-2xl text-gray-700 hover:bg-gray-50 active:scale-95 transition shadow-xs flex items-center gap-1.5 text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Uygulama</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              autoRefresh
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
            <span>{autoRefresh ? 'Canlı Takip' : 'Durduruldu'}</span>
          </button>

          <button
            onClick={fetchStatus}
            disabled={isRefreshing}
            className="p-2.5 bg-white border border-gray-200 rounded-2xl text-gray-700 hover:bg-gray-50 active:scale-95 transition shadow-xs"
            title="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-family-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Admin Title Card */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-5 text-white shadow-xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">Sistem Gösterge Paneli</h2>
              <p className="text-[11px] text-gray-400">Entegrasyon Durumu & Canlı İzleme</p>
            </div>
          </div>
          <span className="text-[10px] font-bold bg-amber-400/20 text-amber-300 px-2.5 py-1 rounded-xl border border-amber-400/30">
            ADMIN
          </span>
        </div>
      </div>

      {/* Integrations Live Status Cards */}
      {isLoading ? (
        <div className="flex justify-center items-center py-16">
          <Loader2 className="w-8 h-8 text-family-600 animate-spin" />
        </div>
      ) : data ? (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">
            Canlı Entegrasyonlar (5)
          </h3>

          {/* 1. Database */}
          <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">{data.integrations.database.name}</h4>
                  <p className="text-[11px] text-gray-500">{data.integrations.database.detail}</p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 ${
                  data.integrations.database.active
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {data.integrations.database.active ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                <span>{data.integrations.database.status}</span>
              </span>
            </div>
          </div>

          {/* 2. Supabase Auth */}
          <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">{data.integrations.supabase_auth.name}</h4>
                  <p className="text-[11px] text-gray-500">{data.integrations.supabase_auth.detail}</p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 ${
                  data.integrations.supabase_auth.active
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {data.integrations.supabase_auth.active ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                <span>{data.integrations.supabase_auth.status}</span>
              </span>
            </div>
          </div>

          {/* 3. Storage */}
          <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">{data.integrations.storage.name}</h4>
                  <p className="text-[11px] text-gray-500">{data.integrations.storage.detail}</p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 ${
                  data.integrations.storage.active
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-sky-50 text-sky-700 border border-sky-200'
                }`}
              >
                {data.integrations.storage.active ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                )}
                <span>{data.integrations.storage.status}</span>
              </span>
            </div>
          </div>

          {/* 4. Resend Email */}
          <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">{data.integrations.resend_email.name}</h4>
                  <p className="text-[11px] text-gray-500">{data.integrations.resend_email.detail}</p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 ${
                  data.integrations.resend_email.active
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {data.integrations.resend_email.active ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                <span>{data.integrations.resend_email.status}</span>
              </span>
            </div>

            {/* Test Email Trigger Button */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[11px] text-gray-500">
                Alıcı: <strong className="text-gray-700">{user.email}</strong>
              </span>
              <button
                onClick={handleSendTestEmail}
                disabled={isSendingTestEmail || !data.integrations.resend_email.active}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition"
              >
                {isSendingTestEmail ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Test Gönder</span>
              </button>
            </div>
            {testEmailResult && (
              <div className="text-xs font-semibold p-2 bg-gray-50 rounded-xl text-center">
                {testEmailResult}
              </div>
            )}
          </div>

          {/* 5. Capacitor Mobile */}
          <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">{data.integrations.capacitor_mobile.name}</h4>
                  <p className="text-[11px] text-gray-500">{data.integrations.capacitor_mobile.detail}</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{data.integrations.capacitor_mobile.status}</span>
              </span>
            </div>
          </div>

          {/* System Metrics Grid */}
          <div className="pt-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1 mb-2">
              Sistem İstatistikleri
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center shadow-2xs">
                <Users className="w-4 h-4 text-family-600 mx-auto mb-1" />
                <div className="text-lg font-black text-gray-900">{data.stats.total_users}</div>
                <div className="text-[10px] text-gray-400 font-medium">Kullanıcı</div>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center shadow-2xs">
                <MessageCircle className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                <div className="text-lg font-black text-gray-900">{data.stats.total_messages}</div>
                <div className="text-[10px] text-gray-400 font-medium">Mesaj</div>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center shadow-2xs">
                <ImageIcon className="w-4 h-4 text-purple-600 mx-auto mb-1" />
                <div className="text-lg font-black text-gray-900">{data.stats.total_media}</div>
                <div className="text-[10px] text-gray-400 font-medium">Fotoğraf</div>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center shadow-2xs">
                <ShoppingBag className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <div className="text-lg font-black text-gray-900">{data.stats.total_shopping}</div>
                <div className="text-[10px] text-gray-400 font-medium">Alışveriş</div>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center shadow-2xs">
                <StickyNote className="w-4 h-4 text-sky-600 mx-auto mb-1" />
                <div className="text-lg font-black text-gray-900">{data.stats.total_notes}</div>
                <div className="text-[10px] text-gray-400 font-medium">Not</div>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center shadow-2xs">
                <Bell className="w-4 h-4 text-amber-600 mx-auto mb-1" />
                <div className="text-lg font-black text-gray-900">{data.stats.total_reminders}</div>
                <div className="text-[10px] text-gray-400 font-medium">Hatırlatıcı</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
