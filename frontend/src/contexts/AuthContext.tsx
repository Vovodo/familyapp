import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { api, storage } from '../services/api';
import { cacheService } from '../services/cacheService';
import { notificationService } from '../services/notificationService';

export interface VerifyAndRegisterPayload {
  email: string;
  code: string;
  full_name: string;
  password: string;
  family_action?: 'create' | 'join';
  invite_code?: string;
  family_name?: string;
  nickname?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  sendVerificationCode: (email: string, purpose: 'register' | 'reset_password') => Promise<void>;
  verifyAndRegister: (payload: VerifyAndRegisterPayload) => Promise<void>;
  resetPassword: (email: string, code: string, newPass: string) => Promise<void>;
  quickJoin: (
    fullName: string,
    nickname: string,
    action?: 'create' | 'join',
    familyName?: string,
    inviteCode?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const savedToken = await storage.get('auth_token');
        if (savedToken) {
          setToken(savedToken);
          const response = await api.get<User>('/auth/me');
          setUser(response.data);
        }
      } catch (error) {
        console.error('Session validation error:', error);
        await storage.remove('auth_token');
        setUser(null);
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const sendVerificationCode = async (email: string, purpose: 'register' | 'reset_password') => {
    await api.post('/auth/send-verification-code', {
      email: email.trim().toLowerCase(),
      purpose,
    });
  };

  const verifyAndRegister = async (payload: VerifyAndRegisterPayload) => {
    setIsLoading(true);
    try {
      cacheService.clear();
      await storage.remove('active_family_id');
      const response = await api.post<{ access_token: string; user: User }>('/auth/verify-and-register', {
        ...payload,
        email: payload.email.trim().toLowerCase(),
        code: payload.code.trim(),
      });

      const { access_token, user: registeredUser } = response.data;
      await storage.set('auth_token', access_token);
      setToken(access_token);
      setUser(registeredUser);
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (email: string, code: string, newPass: string) => {
    await api.post('/auth/reset-password', {
      email: email.trim().toLowerCase(),
      code: code.trim(),
      new_password: newPass,
    });
  };

  const login = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      cacheService.clear();
      await storage.remove('active_family_id');
      const response = await api.post<{ access_token: string; user: User }>('/auth/login', {
        email_or_phone: email.trim().toLowerCase(),
        password: pass,
      });

      const { access_token, user: loggedUser } = response.data;
      await storage.set('auth_token', access_token);
      setToken(access_token);
      setUser(loggedUser);
    } finally {
      setIsLoading(false);
    }
  };

  const quickJoin = async (
    fullName: string,
    nickname: string,
    action: 'create' | 'join' = 'create',
    familyName?: string,
    inviteCode?: string
  ) => {
    setIsLoading(true);
    try {
      cacheService.clear();
      await storage.remove('active_family_id');
      let deviceId = await storage.get('ailem_device_id');
      if (!deviceId) {
        deviceId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        await storage.set('ailem_device_id', deviceId);
      }

      const response = await api.post<{
        access_token: string;
        user: User;
        family_id: string;
        family_name: string;
      }>('/auth/quick-join', {
        full_name: fullName.trim(),
        nickname: nickname.trim(),
        device_id: deviceId,
        action,
        family_name: familyName?.trim() || 'Bizim Aile ❤️',
        invite_code: inviteCode?.trim() || undefined,
      });

      const { access_token, user: loggedUser, family_id } = response.data;
      await storage.set('auth_token', access_token);
      await storage.set('active_family_id', family_id);
      await storage.set('device_registered', 'true');
      setToken(access_token);
      setUser(loggedUser);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await api.post('/auth/logout').catch(() => {});
        await notificationService.unregisterToken().catch(() => {});
      }
    } finally {
      cacheService.clear();
      await storage.remove('auth_token');
      await storage.remove('active_family_id');
      await storage.remove('device_registered');
      setToken(null);
      setUser(null);
    }
  };

  const updateProfile = async (data: Partial<User>) => {
    const response = await api.patch<User>('/auth/me', data);
    setUser(response.data);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        sendVerificationCode,
        verifyAndRegister,
        resetPassword,
        quickJoin,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
