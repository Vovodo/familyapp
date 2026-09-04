import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as CapApp } from '@capacitor/app';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FamilyProvider } from './contexts/FamilyContext';
import { DrawingGameProvider } from './contexts/DrawingGameContext';
import { WordWarProvider } from './contexts/WordWarContext';
import { VoiceChannelProvider } from './contexts/VoiceChannelContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { MobileLayout } from './components/layout/MobileLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { HomePage } from './pages/home/HomePage';
import { ChatPage } from './pages/chat/ChatPage';
import { GalleryPage } from './pages/gallery/GalleryPage';
import { ShoppingPage } from './pages/shopping/ShoppingPage';
import { NotesPage } from './pages/notes/NotesPage';
import { RemindersPage } from './pages/reminders/RemindersPage';
import { TasksPage } from './pages/tasks/TasksPage';
import { BudgetPage } from './pages/budget/BudgetPage';
import { JoinInviteRedirect, InviteDeepLinkListener } from './pages/family/JoinInviteRedirect';
import { FamilySettingsPage } from './pages/family/FamilySettingsPage';
import { GamesPage } from './pages/games/GamesPage';
import { DrawGuessPage } from './pages/games/DrawGuessPage';
import { WordWarPage } from './pages/games/WordWarPage';
import { WatchPartyPage } from './pages/watchparty/WatchPartyPage';
import { WatchPartyRoomPage } from './pages/watchparty/WatchPartyRoomPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { liveUpdateService } from './services/liveUpdate';
import { applySafeAreaInsets } from './services/safeArea';
import { BrandLoading } from './components/branding/BrandLoading';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <BrandLoading message="Aile Uygulaması Yükleniyor..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <BrandLoading message="Yükleniyor..." />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  // Check for Live OTA Updates on startup and on foreground resume
  useEffect(() => {
    applySafeAreaInsets();
    liveUpdateService.checkForUpdate();

    const stateListener = CapApp.addListener('appStateChange', (state) => {
      if (state.isActive) {
        liveUpdateService.checkForUpdate();
      }
    });

    return () => {
      stateListener.then((l) => l.remove()).catch(() => {});
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <FamilyProvider>
            <BrowserRouter>
              <InviteDeepLinkListener />
              <DrawingGameProvider>
              <WordWarProvider>
              <VoiceChannelProvider>
              <Routes>
                {/* Public Routes */}
                <Route
                  path="/login"
                  element={
                    <PublicRoute>
                      <LoginPage />
                    </PublicRoute>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <PublicRoute>
                      <RegisterPage />
                    </PublicRoute>
                  }
                />
                <Route path="/join" element={<JoinInviteRedirect />} />

                {/* Protected App Routes with Shell */}
                <Route
                  element={
                    <ProtectedRoute>
                      <MobileLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/" element={<HomePage />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/gallery" element={<GalleryPage />} />
                  <Route path="/shopping" element={<ShoppingPage />} />
                  <Route path="/tasks" element={<TasksPage />} />
                  <Route path="/budget" element={<BudgetPage />} />
                  <Route path="/notes" element={<NotesPage />} />
                  <Route path="/reminders" element={<RemindersPage />} />
                  <Route path="/games" element={<GamesPage />} />
                  <Route path="/games/draw" element={<DrawGuessPage />} />
                  <Route path="/games/word" element={<WordWarPage />} />
                  <Route path="/watch-party" element={<WatchPartyPage />} />
                  <Route path="/watch-party/:roomId" element={<WatchPartyRoomPage />} />
                  <Route path="/family" element={<FamilySettingsPage />} />
                  <Route path="/admin" element={<AdminDashboardPage />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </VoiceChannelProvider>
              </WordWarProvider>
              </DrawingGameProvider>
            </BrowserRouter>
          </FamilyProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
