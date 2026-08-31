import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { api, storage } from '../services/api';
import { notificationService } from '../services/notificationService';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (emailOrPhone: string, pass: string) => Promise<void>;
  quickJoin: (
    fullName: string,
    nickname: string,
    action?: 'create' | 'join',
    familyName?: string,
    inviteCode?: string
  ) => Promise<void>;
  register: (fullName: string, emailOrPhone: string, pass: string, nickname?: string) => Promise<void>;
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

  const quickJoin = async (
    fullName: string,
    nickname: string,
    action: 'create' | 'join' = 'create',
    familyName?: string,
    inviteCode?: string
  ) => {
    setIsLoading(true);
    try {
      // Create or retrieve persistent device UUID
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

  const login = async (emailOrPhone: string, pass: string) => {
    setIsLoading(true);
    try {
      const response = await api.post<{ access_token: string; user: User }>('/auth/login', {
        email_or_phone: emailOrPhone,
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

  const register = async (fullName: string, emailOrPhone: string, pass: string, nickname?: string) => {
    setIsLoading(true);
    try {
      const isEmail = emailOrPhone.includes('@');
      const response = await api.post<{ access_token: string; user: User }>('/auth/register', {
        full_name: fullName,
        email: isEmail ? emailOrPhone : undefined,
        phone: !isEmail ? emailOrPhone : undefined,
        password: pass,
        nickname: nickname,
      });

      const { access_token, user: registeredUser } = response.data;
      await storage.set('auth_token', access_token);
      setToken(access_token);
      setUser(registeredUser);
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
        quickJoin,
        register,
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
