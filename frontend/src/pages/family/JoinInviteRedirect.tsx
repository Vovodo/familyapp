import React, { useEffect } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Loader2, Heart } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { extractInviteCode, stashPendingInvite } from '../../utils/inviteCode';

export const InviteDeepLinkListener: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let remove: (() => void) | undefined;
    CapApp.addListener('appUrlOpen', ({ url }) => {
      const code = extractInviteCode(url);
      if (!code) return;
      stashPendingInvite(code);
      navigate(`/join?code=${encodeURIComponent(code)}`);
    })
      .then((listener) => {
        remove = () => listener.remove();
      })
      .catch(() => {});
    return () => remove?.();
  }, [navigate]);

  return null;
};

export const JoinInviteRedirect: React.FC = () => {
  const [params] = useSearchParams();
  const { user, isLoading } = useAuth();
  const code = extractInviteCode(params.get('code') || window.location.search);

  useEffect(() => {
    if (code) stashPendingInvite(code);
  }, [code]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-50 flex flex-col items-center justify-center space-y-3">
        <div className="w-16 h-16 rounded-3xl bg-family-100 flex items-center justify-center text-family-600 shadow-md animate-bounce">
          <Heart className="w-8 h-8 fill-family-500 text-family-500" />
        </div>
        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <Loader2 className="w-4 h-4 animate-spin text-family-600" />
          <span>Davet açılıyor...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={code ? `/register?code=${encodeURIComponent(code)}` : '/register'} replace />;
  }

  return <Navigate to="/" replace />;
};
