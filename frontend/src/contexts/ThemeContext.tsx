import React, { createContext, useContext, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export const THEME_STORAGE_KEY = 'ailem_active_theme';
export const DEFAULT_THEME_ID = 'ailem';
const LEGACY_DEFAULT_THEME_IDS = new Set(['rose']);

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  isDark: boolean;
  isDefault?: boolean;
  palette: string[]; // 4 representative color swatches for store preview
  colors: {
    bg: string;
    surface: string;
    surfaceSecondary: string;
    textPrimary: string;
    textSecondary: string;
    border: string;
    accent: string;
    heroGradient: string;
    headerBg: string;
    headerBorder: string;
    navBg: string;
    navBorder: string;
    navActive: string;
    navInactive: string;
    cardShadow: string;
  };
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'ailem',
    name: 'Ailem',
    description: 'Logomuzla uyumlu ana tema',
    isDark: true,
    isDefault: true,
    palette: ['#160F28', '#2C1F4C', '#E879A8', '#F7F3FF'],
    colors: {
      bg: '#160F28',
      surface: '#1E1638',
      surfaceSecondary: '#2C1F4C',
      textPrimary: '#F7F3FF',
      textSecondary: '#C9B3E8',
      border: '#3A2A5C',
      accent: '#E879A8',
      heroGradient: 'linear-gradient(135deg, #7C3AED 0%, #D946A0 52%, #F0725A 100%)',
      headerBg: '#1A1230',
      headerBorder: '#3A2A5C',
      navBg: '#1A1230',
      navBorder: '#3A2A5C',
      navActive: '#A78BFA',
      navInactive: '#9B8BB8',
      cardShadow: '0 4px 24px rgba(217, 70, 160, 0.18)',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight Black',
    description: 'Modern koyu görünüm',
    isDark: true,
    palette: ['#0d1117', '#161b22', '#38bdf8', '#f0f6fc'],
    colors: {
      bg: '#0d1117',
      surface: '#161b22',
      surfaceSecondary: '#21262d',
      textPrimary: '#f0f6fc',
      textSecondary: '#8b949e',
      border: '#30363d',
      accent: '#38bdf8',
      heroGradient: 'linear-gradient(135deg, #16202e 0%, #0d1117 100%)',
      headerBg: '#161b22',
      headerBorder: '#30363d',
      navBg: '#161b22',
      navBorder: '#30363d',
      navActive: '#38bdf8',
      navInactive: '#8b949e',
      cardShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean Blue',
    description: 'Serin ve modern',
    isDark: true,
    palette: ['#0b192c', '#1e3e62', '#00b4d8', '#f1f5f9'],
    colors: {
      bg: '#0b192c',
      surface: '#142942',
      surfaceSecondary: '#1e3e62',
      textPrimary: '#f1f5f9',
      textSecondary: '#94a3b8',
      border: '#2b5278',
      accent: '#00b4d8',
      heroGradient: 'linear-gradient(135deg, #1e3e62 0%, #0b192c 100%)',
      headerBg: '#0d1d33',
      headerBorder: '#224770',
      navBg: '#0d1d33',
      navBorder: '#224770',
      navActive: '#00b4d8',
      navInactive: '#64748b',
      cardShadow: '0 4px 20px rgba(0, 180, 216, 0.15)',
    },
  },
  {
    id: 'royal',
    name: 'Royal Purple',
    description: 'Zarif ve premium',
    isDark: true,
    palette: ['#120d1e', '#221838', '#a855f7', '#faf5ff'],
    colors: {
      bg: '#120d1e',
      surface: '#1c1330',
      surfaceSecondary: '#291c45',
      textPrimary: '#faf5ff',
      textSecondary: '#c084fc',
      border: '#39285c',
      accent: '#a855f7',
      heroGradient: 'linear-gradient(135deg, #2b184f 0%, #120d1e 100%)',
      headerBg: '#181028',
      headerBorder: '#39285c',
      navBg: '#181028',
      navBorder: '#39285c',
      navActive: '#c084fc',
      navInactive: '#7e679e',
      cardShadow: '0 4px 20px rgba(168, 85, 247, 0.15)',
    },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    description: 'Yumuşak ve sakin',
    isDark: false,
    palette: ['#f8f7ff', '#ffffff', '#8b5cf6', '#2e1065'],
    colors: {
      bg: '#f8f7ff',
      surface: '#ffffff',
      surfaceSecondary: '#ede9fe',
      textPrimary: '#2e1065',
      textSecondary: '#6d28d9',
      border: '#ddd6fe',
      accent: '#8b5cf6',
      heroGradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
      headerBg: '#ffffff',
      headerBorder: '#ede9fe',
      navBg: '#ffffff',
      navBorder: '#ede9fe',
      navActive: '#8b5cf6',
      navInactive: '#8b5cf6',
      cardShadow: '0 4px 20px rgba(139, 92, 246, 0.08)',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Sıcak ve enerjik',
    isDark: false,
    palette: ['#fff8f3', '#ffffff', '#f97316', '#431407'],
    colors: {
      bg: '#fff8f3',
      surface: '#ffffff',
      surfaceSecondary: '#ffedd5',
      textPrimary: '#431407',
      textSecondary: '#9a3412',
      border: '#fed7aa',
      accent: '#f97316',
      heroGradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
      headerBg: '#ffffff',
      headerBorder: '#ffedd5',
      navBg: '#ffffff',
      navBorder: '#ffedd5',
      navActive: '#f97316',
      navInactive: '#9a3412',
      cardShadow: '0 4px 20px rgba(249, 115, 22, 0.08)',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Doğal ve huzurlu',
    isDark: true,
    palette: ['#0d1f18', '#163327', '#10b981', '#ecfdf5'],
    colors: {
      bg: '#0d1f18',
      surface: '#132c22',
      surfaceSecondary: '#1d4233',
      textPrimary: '#ecfdf5',
      textSecondary: '#6ee7b7',
      border: '#234e3d',
      accent: '#10b981',
      heroGradient: 'linear-gradient(135deg, #1b4534 0%, #0d1f18 100%)',
      headerBg: '#10241c',
      headerBorder: '#234e3d',
      navBg: '#10241c',
      navBorder: '#234e3d',
      navActive: '#10b981',
      navInactive: '#6ee7b7',
      cardShadow: '0 4px 20px rgba(16, 185, 129, 0.15)',
    },
  },
  {
    id: 'sky',
    name: 'Sky',
    description: 'Ferahlık ve sadelik',
    isDark: false,
    palette: ['#f0f9ff', '#ffffff', '#0284c7', '#082f49'],
    colors: {
      bg: '#f0f9ff',
      surface: '#ffffff',
      surfaceSecondary: '#e0f2fe',
      textPrimary: '#082f49',
      textSecondary: '#0369a1',
      border: '#bae6fd',
      accent: '#0284c7',
      heroGradient: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
      headerBg: '#ffffff',
      headerBorder: '#e0f2fe',
      navBg: '#ffffff',
      navBorder: '#e0f2fe',
      navActive: '#0284c7',
      navInactive: '#0284c7',
      cardShadow: '0 4px 20px rgba(2, 132, 199, 0.08)',
    },
  },
  {
    id: 'cherry',
    name: 'Cherry',
    description: 'Canlı ve tutkulu',
    isDark: true,
    palette: ['#1a0a0f', '#2d121b', '#f43f5e', '#fff1f2'],
    colors: {
      bg: '#1a0a0f',
      surface: '#260e16',
      surfaceSecondary: '#3d1624',
      textPrimary: '#fff1f2',
      textSecondary: '#fda4af',
      border: '#4c1d2e',
      accent: '#f43f5e',
      heroGradient: 'linear-gradient(135deg, #3d1222 0%, #1a0a0f 100%)',
      headerBg: '#200b13',
      headerBorder: '#4c1d2e',
      navBg: '#200b13',
      navBorder: '#4c1d2e',
      navActive: '#f43f5e',
      navInactive: '#fda4af',
      cardShadow: '0 4px 20px rgba(244, 63, 94, 0.15)',
    },
  },
  {
    id: 'minimal',
    name: 'Minimal Light',
    description: 'Temiz ve sade',
    isDark: false,
    palette: ['#f8fafc', '#ffffff', '#475569', '#0f172a'],
    colors: {
      bg: '#f8fafc',
      surface: '#ffffff',
      surfaceSecondary: '#f1f5f9',
      textPrimary: '#0f172a',
      textSecondary: '#64748b',
      border: '#e2e8f0',
      accent: '#475569',
      heroGradient: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
      headerBg: '#ffffff',
      headerBorder: '#e2e8f0',
      navBg: '#ffffff',
      navBorder: '#e2e8f0',
      navActive: '#0f172a',
      navInactive: '#94a3b8',
      cardShadow: '0 4px 20px rgba(15, 23, 42, 0.05)',
    },
  },
  {
    id: 'amoled',
    name: 'AMOLED',
    description: 'Gerçek siyah deneyimi',
    isDark: true,
    palette: ['#000000', '#0a0a0a', '#ffffff', '#a3a3a3'],
    colors: {
      bg: '#000000',
      surface: '#0d0d0d',
      surfaceSecondary: '#171717',
      textPrimary: '#ffffff',
      textSecondary: '#a3a3a3',
      border: '#262626',
      accent: '#ffffff',
      heroGradient: 'linear-gradient(135deg, #1f1f1f 0%, #000000 100%)',
      headerBg: '#000000',
      headerBorder: '#262626',
      navBg: '#000000',
      navBorder: '#262626',
      navActive: '#ffffff',
      navInactive: '#737373',
      cardShadow: 'none',
    },
  },
  {
    id: 'coffee',
    name: 'Coffee',
    description: 'Sıcak ve rahat',
    isDark: true,
    palette: ['#1a1412', '#291f1c', '#d97706', '#fef3c7'],
    colors: {
      bg: '#1a1412',
      surface: '#241b18',
      surfaceSecondary: '#362924',
      textPrimary: '#fef3c7',
      textSecondary: '#d4a373',
      border: '#443530',
      accent: '#d97706',
      heroGradient: 'linear-gradient(135deg, #36221a 0%, #1a1412 100%)',
      headerBg: '#201815',
      headerBorder: '#443530',
      navBg: '#201815',
      navBorder: '#443530',
      navActive: '#f59e0b',
      navInactive: '#a8826b',
      cardShadow: '0 4px 20px rgba(217, 119, 6, 0.12)',
    },
  },
];

interface ThemeContextType {
  currentTheme: ThemeDefinition;
  setTheme: (themeId: string) => void;
  availableThemes: ThemeDefinition[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const getDefaultTheme = (): ThemeDefinition =>
  THEMES.find((t) => t.id === DEFAULT_THEME_ID) || THEMES[0];

export const resolveStoredThemeId = (): string => {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (!stored || LEGACY_DEFAULT_THEME_IDS.has(stored)) {
    localStorage.setItem(THEME_STORAGE_KEY, DEFAULT_THEME_ID);
    return DEFAULT_THEME_ID;
  }
  if (!THEMES.some((t) => t.id === stored)) {
    localStorage.setItem(THEME_STORAGE_KEY, DEFAULT_THEME_ID);
    return DEFAULT_THEME_ID;
  }
  return stored;
};

const applyNativeChrome = (theme: ThemeDefinition) => {
  if (!Capacitor.isNativePlatform()) return;
  StatusBar.setStyle({ style: theme.isDark ? Style.Light : Style.Dark }).catch(() => {});
  StatusBar.setBackgroundColor({ color: theme.colors.headerBg }).catch(() => {});
};

const applyThemeToDOM = (theme: ThemeDefinition) => {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.id);
  root.classList.toggle('dark', theme.isDark);

  root.style.setProperty('--theme-bg', theme.colors.bg);
  root.style.setProperty('--theme-surface', theme.colors.surface);
  root.style.setProperty('--theme-surface-secondary', theme.colors.surfaceSecondary);
  root.style.setProperty('--theme-text-primary', theme.colors.textPrimary);
  root.style.setProperty('--theme-text-secondary', theme.colors.textSecondary);
  root.style.setProperty('--theme-border', theme.colors.border);
  root.style.setProperty('--theme-accent', theme.colors.accent);
  root.style.setProperty('--theme-hero-gradient', theme.colors.heroGradient);
  root.style.setProperty('--theme-header-bg', theme.colors.headerBg);
  root.style.setProperty('--theme-header-border', theme.colors.headerBorder);
  root.style.setProperty('--theme-nav-bg', theme.colors.navBg);
  root.style.setProperty('--theme-nav-border', theme.colors.navBorder);
  root.style.setProperty('--theme-nav-active', theme.colors.navActive);
  root.style.setProperty('--theme-nav-inactive', theme.colors.navInactive);
  root.style.setProperty('--theme-card-shadow', theme.colors.cardShadow);

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', theme.colors.headerBg);
  }

  applyNativeChrome(theme);
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeThemeId, setActiveThemeId] = useState<string>(() => {
    const id = resolveStoredThemeId();
    applyThemeToDOM(THEMES.find((t) => t.id === id) || getDefaultTheme());
    return id;
  });

  const currentTheme = THEMES.find((t) => t.id === activeThemeId) || getDefaultTheme();

  useEffect(() => {
    applyThemeToDOM(currentTheme);
  }, [currentTheme]);

  const setTheme = (themeId: string) => {
    const target = THEMES.find((t) => t.id === themeId);
    if (target) {
      setActiveThemeId(target.id);
      localStorage.setItem(THEME_STORAGE_KEY, target.id);
      applyThemeToDOM(target);
    }
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, availableThemes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
