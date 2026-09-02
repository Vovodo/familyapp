import React from 'react';
import * as Sentry from '@sentry/react';
import { AlertCircle } from 'lucide-react';

const Fallback: React.FC<{ error: unknown; resetError(): void }> = ({ error, resetError }) => {
  const message = error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu.';

  return (
    <div className="m-3 p-4 rounded-2xl border theme-border theme-surface space-y-2">
      <div className="flex items-center gap-2 font-black text-sm theme-text-primary">
        <AlertCircle className="w-4 h-4 text-rose-500" />
        <span>Bu sayfa yüklenemedi</span>
      </div>
      <p className="text-xs theme-text-secondary leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={resetError}
        className="mt-1 px-3 py-2 rounded-xl bg-family-600 text-white text-xs font-bold"
      >
        Tekrar dene
      </button>
    </div>
  );
};

export const RouteErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Sentry.ErrorBoundary fallback={({ error, resetError }) => <Fallback error={error} resetError={resetError} />}>
    {children}
  </Sentry.ErrorBoundary>
);
