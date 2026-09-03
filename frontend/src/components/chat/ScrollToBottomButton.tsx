import React from 'react';
import { ChevronDown } from 'lucide-react';

interface ScrollToBottomButtonProps {
  visible: boolean;
  unreadCount?: number;
  onClick: () => void;
}

export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = React.memo(
  ({ visible, unreadCount = 0, onClick }) => {
    if (!visible) return null;

    return (
      <button
        onClick={onClick}
        className="absolute right-4 bottom-20 z-20 theme-surface theme-text-primary p-2.5 rounded-full shadow-lg border theme-border active:scale-95 transition-all flex items-center gap-1 text-xs font-bold"
        aria-label="En son mesaja git"
      >
        <ChevronDown className="w-4 h-4 text-family-600" />
        {unreadCount > 0 && (
          <span className="bg-family-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
            {unreadCount} yeni
          </span>
        )}
      </button>
    );
  }
);

ScrollToBottomButton.displayName = 'ScrollToBottomButton';
