import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as CapApp } from '@capacitor/app';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FamilyProvider } from './contexts/FamilyContext';
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
import { FamilySettingsPage } from './pages/family/FamilySettingsPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { liveUpdateService } from './services/liveUpdate';
import { Loader2, Heart } from 'lucide-react';

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
    return (
      <div className="min-h-screen bg-warm-50 flex flex-col items-center justify-center space-y-3">
        <div className="w-16 h-16 rounded-3xl bg-family-100 flex items-center justify-center text-family-600 shadow-md animate-bounce">
          <Heart className="w-8 h-8 fill-family-500 text-family-500" />
        </div>
        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <Loader2 className="w-4 h-4 animate-spin text-family-600" />
          <span>Aile Uygulaması Yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-50 flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-family-600" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  // Check for Live OTA Updates on startup and on foreground resume
  useEffect(() => {
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
                  <Route path="/family" element={<FamilySettingsPage />} />
                  <Route path="/admin" element={<AdminDashboardPage />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </FamilyProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
