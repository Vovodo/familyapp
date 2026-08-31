import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart,
  Lock,
  Mail,
  User,
  ArrowRight,
  AlertCircle,
  Loader2,
  Smile,
  Home,
  Link as LinkIcon,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const QUICK_ROLES = ['Baba', 'Anne', 'Oğlum', 'Kızım', 'Dede', 'Nine', 'Kardeşim'];

export const RegisterPage: React.FC = () => {
  const [step, setStep] = useState<'info' | 'otp'>('info');

  // Step 1 Form Data
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('Anne');
  const [customNickname, setCustomNickname] = useState('');
  const [familyAction, setFamilyAction] = useState<'create' | 'join'>('create');
  const [familyName, setFamilyName] = useState('Bizim Aile ❤️');
  const [inviteCode, setInviteCode] = useState('');

  // Step 2 Form Data
  const [otpCode, setOtpCode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { sendVerificationCode, verifyAndRegister } = useAuth();
  const navigate = useNavigate();

  // Step 1: Validate and request OTP code via Resend
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || !cleanEmail || !password.trim()) {
      setError('Lütfen tüm zorunlu alanları doldurun.');
      return;
    }

    if (password.length < 6) {
      setError('Şifreniz en az 6 karakter olmalıdır.');
      return;
    }

    if (familyAction === 'join' && !inviteCode.trim()) {
      setError('Lütfen ailenizden aldığınız katılım kodunu girin.');
      return;
    }

    try {
      setError(null);
      setIsSubmitting(true);
      await sendVerificationCode(cleanEmail, 'register');
      setStep('otp');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Doğrulama kodu gönderilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: Verify OTP and complete registration
  const handleVerifyAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setError('Lütfen 6 haneli doğrulama kodunu girin.');
      return;
    }

    const finalNickname = (nickname === 'other' ? customNickname.trim() : nickname) || 'Aile Üyesi';

    try {
      setError(null);
      setIsSubmitting(true);
      await verifyAndRegister({
        email: email.trim().toLowerCase(),
        code: otpCode.trim(),
        full_name: fullName.trim(),
        password,
        nickname: finalNickname,
        family_action: familyAction,
        family_name: familyAction === 'create' ? (familyName.trim() || 'Bizim Aile ❤️') : undefined,
        invite_code: familyAction === 'join' ? inviteCode.trim().toUpperCase() : undefined,
      });

      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Kayıt tamamlanamadı. Kodu kontrol edin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col justify-center px-4 sm:px-6 py-6 max-w-md mx-auto space-y-4">
      {/* Header Logo */}
      <div className="text-center space-y-1">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-family-100 text-family-600 shadow-md shadow-family-100 mb-1 animate-bounce">
          <Heart className="w-8 h-8 fill-family-500 text-family-500" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Aile Hesabı Oluşturun</h1>
        <p className="text-xs font-medium text-gray-500">
          {step === 'info' ? 'Ailenize özel sıcak ve güvenli alanınızı başlatın' : 'E-posta adresinizi doğrulayın'}
        </p>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-red-700 text-xs font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 'info' ? (
          /* STEP 1: Registration Details */
          <form onSubmit={handleRequestCode} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 ml-1">
                Adınız ve Soyadınız
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Örn: Ayşe Yılmaz"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 ml-1">
                E-posta Adresiniz
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
                  className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
                  autoCapitalize="none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 ml-1">
                Şifre
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="En az 6 karakter"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
                  required
                />
              </div>
            </div>

            {/* Nickname / Family Role */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 ml-1">
                Aile İçi Hitabınız
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {QUICK_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setNickname(r)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold transition text-center truncate cursor-pointer ${
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
                  className={`py-2 px-1 rounded-xl text-xs font-bold transition text-center truncate cursor-pointer ${
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
                  placeholder="Hitabınızı yazın (Örn: Teyze, Dayı)"
                  className="w-full mt-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
                />
              )}
            </div>

            {/* Family Setup Selection (Create vs Join) */}
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider ml-1">
                Aile Grubu Seçimi
              </label>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setFamilyAction('create')}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border cursor-pointer ${
                    familyAction === 'create'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs font-black'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>Yeni Aile Kur</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFamilyAction('join')}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border cursor-pointer ${
                    familyAction === 'join'
                      ? 'bg-sky-50 text-sky-800 border-sky-300 shadow-2xs font-black'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>Aileye Katıl</span>
                </button>
              </div>

              {familyAction === 'create' ? (
                <input
                  type="text"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="Örn: Yılmaz Ailesi ❤️"
                  className="w-full px-3 py-2 bg-emerald-50/40 border border-emerald-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
              ) : (
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-sky-500">
                    <KeyRound className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="Örn: AILE-123456"
                    className="w-full pl-9 pr-3 py-2 bg-sky-50/40 border border-sky-200 rounded-xl text-xs font-mono font-bold uppercase focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
                    required
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-gradient-to-r from-family-600 to-rose-600 hover:from-family-700 hover:to-rose-700 active:scale-98 text-white font-bold rounded-2xl shadow-lg shadow-family-600/25 flex items-center justify-center gap-2 text-sm transition duration-150 disabled:opacity-50 mt-2 cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>Doğrulama Kodu Gönder</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* STEP 2: Email OTP Code Entry */
          <form onSubmit={handleVerifyAndRegister} className="space-y-4 text-center">
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl">
              <p className="text-xs text-rose-800 font-medium leading-relaxed">
                <strong>{email}</strong> adresinize 6 haneli bir doğrulama kodu gönderdik. Lütfen gelen kutunuzu kontrol edin.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                6 Haneli Doğrulama Kodu
              </label>
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                className="w-full py-3.5 bg-gray-50 border-2 border-family-200 rounded-2xl text-2xl font-mono tracking-widest text-center font-black focus:bg-white focus:outline-none focus:border-family-600 transition"
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || otpCode.length < 4}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-98 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2 text-sm transition duration-150 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Doğrula ve Aileyi Başlat</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-between text-xs text-gray-500 pt-2">
              <button
                type="button"
                onClick={() => setStep('info')}
                className="text-gray-500 hover:text-gray-800 hover:underline cursor-pointer"
              >
                ← Bilgileri Değiştir
              </button>

              <button
                type="button"
                onClick={handleRequestCode}
                disabled={isSubmitting}
                className="text-family-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Kodu Tekrar Gönder</span>
              </button>
            </div>
          </form>
        )}

        {/* Login Navigation Link */}
        <div className="pt-4 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-600">
            Zaten bir hesabınız var mı?{' '}
            <Link to="/login" className="text-family-600 font-extrabold hover:underline">
              Giriş Yapın
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
