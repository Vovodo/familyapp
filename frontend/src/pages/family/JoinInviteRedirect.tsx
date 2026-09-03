import React, { useEffect } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { BrandLoading } from '../../components/branding/BrandLoading';
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
    return <BrandLoading message="Davet açılıyor..." />;
  }

  if (!user) {
    return <Navigate to={code ? `/register?code=${encodeURIComponent(code)}` : '/register'} replace />;
  }

  return <Navigate to="/" replace />;
};
