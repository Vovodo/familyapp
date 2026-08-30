import axios from 'axios';
import { Preferences } from '@capacitor/preferences';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Storage Helper
export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      const { value } = await Preferences.get({ key });
      if (value) return value;
    } catch {
      // Fallback to localStorage
    }
    return localStorage.getItem(key);
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await Preferences.set({ key, value });
    } catch {
      // Fallback
    }
    localStorage.setItem(key, value);
  },
  async remove(key: string): Promise<void> {
    try {
      await Preferences.remove({ key });
    } catch {
      // Fallback
    }
    localStorage.removeItem(key);
  },
};

// Request Interceptor to add Bearer Token & Active Family ID
api.interceptors.request.use(async (config) => {
  const token = await storage.get('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const activeFamilyId = await storage.get('active_family_id');
  if (activeFamilyId) {
    config.headers['x-family-id'] = activeFamilyId;
  }

  return config;
});

// Response Interceptor for user-friendly error formatting
api.interceptors.response.use(
  (response) => response,
  (error) => {
    let message = 'Bir sorun oluştu. Lütfen tekrar deneyin.';
    if (error.response) {
      if (error.response.data && error.response.data.detail) {
        message = error.response.data.detail;
      } else if (error.response.status === 401) {
        message = 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.';
      } else if (error.response.status === 403) {
        message = 'Bu işlem için yetkiniz bulunmuyor.';
      } else if (error.response.status === 404) {
        message = 'İstenen kayıt bulunamadı.';
      }
    } else if (error.request) {
      message = 'Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.';
    }
    return Promise.reject(new Error(message));
  }
);
