import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, Lock, Mail, User, ArrowRight, AlertCircle, Loader2, Smile } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const RegisterPage: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !emailOrPhone.trim() || !password.trim()) {
      setError('Lütfen tüm zorunlu alanları doldurun.');
      return;
    }

    if (password.length < 6) {
      setError('Şifreniz en az 6 karakter olmalıdır.');
      return;
    }

    try {
      setError(null);
      setIsSubmitting(true);
      await register(fullName.trim(), emailOrPhone.trim(), password, nickname.trim() || undefined);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Kayıt oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col justify-center px-6 py-12 max-w-md mx-auto">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-family-100 text-family-600 shadow-md mb-3">
          <Heart className="w-8 h-8 fill-family-500 text-family-500" />
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900">Aile Hesabı Oluştur</h1>
        <p className="text-sm font-medium text-gray-500 mt-1">Sadece ailenizin görebileceği özel alan</p>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100">
        {error && (
          <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2.5 text-red-700 text-sm font-medium">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 ml-1">
              Ad Soyad
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <User className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Örn: Ege Pamukçu"
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 ml-1">
              Aile İçi Hitap (İsteğe Bağlı)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Smile className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Örn: Anne, Baba, Ege"
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 ml-1">
              E-posta veya Telefon
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Mail className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={emailOrPhone}
                onChange={(e) => setEmailOrPhone(e.target.value)}
                placeholder="ornek@aile.com veya 05xxxxxxxxx"
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
                autoCapitalize="none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 ml-1">
              Şifre
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="En az 6 karakter"
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 bg-family-600 hover:bg-family-700 active:scale-[0.98] text-white font-bold rounded-2xl shadow-lg shadow-family-600/25 flex items-center justify-center gap-2 text-base transition duration-150 disabled:opacity-60 mt-4"
          >
            {isSubmitting ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <span>Hesap Oluştur</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-5 pt-5 border-t border-gray-100 text-center">
          <p className="text-sm text-gray-600">
            Zaten bir hesabınız var mı?{' '}
            <Link to="/login" className="text-family-600 font-bold hover:underline">
              Giriş Yapın
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
