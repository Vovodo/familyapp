import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  Loader2,
  KeyRound,
  CheckCircle2,
  X,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { DownloadApkButton } from '../../components/common/DownloadApkButton';
import { Logo } from '../../components/branding/Logo';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStep, setForgotStep] = useState<'email' | 'code'>('email');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [isForgotSubmitting, setIsForgotSubmitting] = useState(false);

  const { login, sendVerificationCode, resetPassword } = useAuth();
  const navigate = useNavigate();

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Lütfen e-posta adresinizi ve şifrenizi girin.');
      return;
    }

    try {
      setError(null);
      setIsSubmitting(true);
      await login(email.trim(), password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Giriş yapılamadı. Bilgilerinizi kontrol edin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Forgot Password Step 1: Send OTP via Resend
  const handleSendResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setForgotError('Lütfen kayıtlı e-posta adresinizi girin.');
      return;
    }

    try {
      setForgotError(null);
      setIsForgotSubmitting(true);
      await sendVerificationCode(forgotEmail.trim(), 'reset_password');
      setForgotStep('code');
    } catch (err: any) {
      setForgotError(err.response?.data?.detail || err.message || 'Kurtarma kodu gönderilemedi.');
    } finally {
      setIsForgotSubmitting(false);
    }
  };

  // Forgot Password Step 2: Verify OTP and update password
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode.trim() || !newPassword.trim()) {
      setForgotError('Lütfen 6 haneli kodu ve yeni şifrenizi girin.');
      return;
    }

    if (newPassword.length < 6) {
      setForgotError('Yeni şifreniz en az 6 karakter olmalıdır.');
      return;
    }

    try {
      setForgotError(null);
      setIsForgotSubmitting(true);
      await resetPassword(forgotEmail.trim(), resetCode.trim(), newPassword);
      setForgotSuccess('Şifreniz başarıyla yenilendi! Şimdi giriş yapabilirsiniz.');
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotStep('email');
        setForgotSuccess(null);
      }, 2000);
    } catch (err: any) {
      setForgotError(err.response?.data?.detail || err.message || 'Şifre sıfırlanamadı.');
    } finally {
      setIsForgotSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen theme-bg flex flex-col justify-center px-4 sm:px-6 py-6 max-w-md mx-auto space-y-4">
      {/* Header Logo */}
      <div className="text-center space-y-2">
        <Logo size="lg" pulse className="mx-auto mb-1" />
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Ailemize Giriş Yapın</h1>
        <p className="text-xs font-medium text-gray-500">Aile içi güvenli, sıcacık ve bağımsız alanınız</p>
      </div>

      {/* Main Login Card */}
      <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-red-700 text-xs font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-1">
              E-posta Adresi
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@aile.com"
                className="w-full pl-10 pr-3.5 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
                autoCapitalize="none"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5 ml-1">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Şifre
              </label>
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setShowForgotModal(true);
                }}
                className="text-[11px] font-bold text-family-600 hover:text-family-700 hover:underline cursor-pointer"
              >
                Şifremi Unuttum?
              </button>
            </div>
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
            className="w-full py-3.5 theme-cta hover:opacity-95 active:scale-98 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-sm transition duration-150 disabled:opacity-50 mt-2 cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>Giriş Yap</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Register Navigation Link */}
        <div className="pt-4 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-600">
            Henüz bir aile hesabınız yok mu?{' '}
            <Link to="/register" className="text-family-600 font-extrabold hover:underline">
              Kayıt Olun
            </Link>
          </p>
        </div>
      </div>

      {/* Web APK Download Banner (Hidden on Native APK) */}
      <DownloadApkButton variant="compact" />

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-family-100 text-family-600 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-gray-900">Şifre Kurtarma</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {forgotError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium">
                {forgotError}
              </div>
            )}

            {forgotSuccess ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col items-center text-center text-emerald-800 text-xs font-bold space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                <span>{forgotSuccess}</span>
              </div>
            ) : forgotStep === 'email' ? (
              <form onSubmit={handleSendResetCode} className="space-y-3">
                <p className="text-xs text-gray-500 leading-relaxed">
                  Hesabınıza ait e-posta adresinizi girin. Size 6 haneli bir kurtarma kodu göndereceğiz.
                </p>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="ornek@aile.com"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
                  required
                />
                <button
                  type="submit"
                  disabled={isForgotSubmitting}
                  className="w-full py-3 bg-family-600 hover:bg-family-700 active:scale-98 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isForgotSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Kurtarma Kodu Gönder</span>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-3">
                <p className="text-xs text-gray-500 leading-relaxed">
                  <strong>{forgotEmail}</strong> adresine gönderilen 6 haneli kodu ve yeni şifrenizi girin.
                </p>
                <input
                  type="text"
                  maxLength={6}
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder="6 Haneli Kod (Örn: 123456)"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm font-mono tracking-widest text-center font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
                  required
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Yeni Şifreniz (En az 6 karakter)"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
                  required
                />
                <button
                  type="submit"
                  disabled={isForgotSubmitting}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isForgotSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Şifremi Yenile</span>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
