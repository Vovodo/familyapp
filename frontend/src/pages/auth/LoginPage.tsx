import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Lock, Mail, ArrowRight, AlertCircle, Loader2, Sparkles, UserCheck, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { DownloadApkButton } from '../../components/common/DownloadApkButton';

const QUICK_ROLES = ['Baba', 'Anne', 'Oğlum', 'Kızım', 'Dede', 'Nine', 'Kardeşim'];

export const LoginPage: React.FC = () => {
  const [tab, setTab] = useState<'quick' | 'admin'>('quick');

  // Quick Join State
  const [fullName, setFullName] = useState('');
  const [nickname, setNickname] = useState('Baba');
  const [customNickname, setCustomNickname] = useState('');

  // Admin Login State
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { quickJoin, login } = useAuth();
  const navigate = useNavigate();

  const handleQuickJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = fullName.trim();
    if (!finalName) {
      setError('Lütfen adınızı ve soyadınızı girin.');
      return;
    }

    const finalNickname = (nickname === 'other' ? customNickname.trim() : nickname) || 'Aile Üyesi';

    try {
      setError(null);
      setIsSubmitting(true);
      await quickJoin(finalName, finalNickname);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Bağlantı kurulamadı. Lütfen tekrar deneyin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOrPhone.trim() || !password.trim()) {
      setError('Lütfen e-posta / telefon ve şifrenizi girin.');
      return;
    }

    try {
      setError(null);
      setIsSubmitting(true);
      await login(emailOrPhone.trim(), password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Giriş yapılamadı. Bilgilerinizi kontrol edin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col justify-center px-4 sm:px-6 py-8 max-w-md mx-auto space-y-5">
      {/* Header Logo */}
      <div className="text-center space-y-1.5">
        <div className="inline-flex items-center justify-center w-18 h-18 rounded-3xl bg-family-100 text-family-600 shadow-md shadow-family-100 mb-1 animate-bounce">
          <Heart className="w-9 h-9 fill-family-500 text-family-500" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">Ailemize Hoş Geldiniz</h1>
        <p className="text-xs sm:text-sm font-medium text-gray-500">Aile içi özel, güvenli ve hızlı alanınız</p>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-xl border border-gray-100 space-y-4">
        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-2xl">
          <button
            type="button"
            onClick={() => {
              setTab('quick');
              setError(null);
            }}
            className={`py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
              tab === 'quick' ? 'bg-white text-family-700 shadow-xs' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Hemen Başla</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('admin');
              setError(null);
            }}
            className={`py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
              tab === 'admin' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Yönetici Girişi</span>
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-red-700 text-xs font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Tab 1: Instant Quick Join Flow */}
        {tab === 'quick' ? (
          <form onSubmit={handleQuickJoinSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">
                Adınız ve Soyadınız
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <UserCheck className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Örn: Ahmet Yılmaz"
                  className="w-full pl-10 pr-3.5 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">
                Ailedeki Rolünüz / Hitabınız
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {QUICK_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setNickname(r)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold transition text-center truncate ${
                      nickname === r
                        ? 'bg-family-600 text-white shadow-xs scale-102'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200/60'
                    }`}
                  >
                    {r}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setNickname('other')}
                  className={`py-2 px-1 rounded-xl text-xs font-bold transition text-center truncate ${
                    nickname === 'other'
                      ? 'bg-family-600 text-white shadow-xs scale-102'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200/60'
                  }`}
                >
                  Diğer
                </button>
              </div>

              {nickname === 'other' && (
                <input
                  type="text"
                  value={customNickname}
                  onChange={(e) => setCustomNickname(e.target.value)}
                  placeholder="Hitabınızı yazın (Örn: Teyze, Dayı, Enişte)"
                  className="w-full mt-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
                />
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !fullName.trim()}
              className="w-full py-3.5 bg-gradient-to-r from-family-600 to-rose-600 hover:from-family-700 hover:to-rose-700 active:scale-98 text-white font-bold rounded-2xl shadow-lg shadow-family-600/25 flex items-center justify-center gap-2 text-sm transition duration-150 disabled:opacity-50 mt-1 cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>Kullanıma Başla</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-[11px] text-gray-400 text-center leading-relaxed">
              🔒 Bu cihaz bir daha sizden şifre veya giriş istemeyecektir. Profilinizi istediğiniz zaman ayarlardan güncelleyebilirsiniz.
            </p>
          </form>
        ) : (
          /* Tab 2: Admin Password Login Flow */
          <form onSubmit={handleAdminLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">
                Yönetici E-posta
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  placeholder="admin@aile.com"
                  className="w-full pl-10 pr-3.5 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
                  autoCapitalize="none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">
                Yönetici Şifresi
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-gray-900 hover:bg-black active:scale-98 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2 text-sm transition duration-150 disabled:opacity-50 mt-1 cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>Yönetici Olarak Giriş Yap</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>

      {/* Web APK Download Banner (Hidden on Native APK) */}
      <DownloadApkButton variant="compact" />
    </div>
  );
};
