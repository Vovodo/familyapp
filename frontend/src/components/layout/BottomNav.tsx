import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, MessageCircle, ShoppingBag, StickyNote, Bell } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const navItems = [
    { id: 'nav-home', to: '/', label: 'Ana Sayfa', icon: Home, end: true },
    { id: 'nav-chat', to: '/chat', label: 'Sohbet', icon: MessageCircle, end: false },
    { id: 'nav-shopping', to: '/shopping', label: 'Alışveriş', icon: ShoppingBag, end: false },
    { id: 'nav-notes', to: '/notes', label: 'Notlar', icon: StickyNote, end: false },
    { id: 'nav-reminders', to: '/reminders', label: 'Hatırlatıcı', icon: Bell, end: false },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200/90 z-40 safe-area-bottom shadow-lg select-none">
      <div className="flex justify-around items-center max-w-lg mx-auto h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 text-xs transition-all ${
                  isActive
                    ? 'text-family-600 font-bold scale-105'
                    : 'text-gray-400 hover:text-gray-700 font-medium'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`p-1.5 rounded-2xl transition-colors ${
                      isActive ? 'bg-family-50 text-family-600 shadow-2xs' : 'text-gray-400'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span
                    className={`mt-0.5 tracking-tight text-[11px] ${
                      isActive ? 'text-family-700 font-black' : 'text-gray-500'
                    }`}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
