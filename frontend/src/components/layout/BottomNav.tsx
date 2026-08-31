import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, MessageCircle, ShoppingBag, StickyNote, Bell } from 'lucide-react';
import { useFamily } from '../../contexts/FamilyContext';

export const BottomNav: React.FC = () => {
  const { currentFamily } = useFamily();

  const navItems = [
    { to: '/', label: 'Ana Sayfa', icon: Home },
    { to: currentFamily ? '/chat' : '/', label: 'Sohbet', icon: MessageCircle },
    { to: currentFamily ? '/shopping' : '/', label: 'Alışveriş', icon: ShoppingBag },
    { to: currentFamily ? '/notes' : '/', label: 'Notlar', icon: StickyNote },
    { to: currentFamily ? '/reminders' : '/', label: 'Hatırlatıcı', icon: Bell },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 z-40 safe-area-bottom shadow-lg">
      <div className="flex justify-around items-center max-w-lg mx-auto h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full py-1 text-xs font-medium transition-all ${
                  isActive
                    ? 'text-family-600 font-bold scale-105'
                    : 'text-gray-500 hover:text-gray-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`p-1 rounded-xl transition-colors ${
                      isActive ? 'bg-family-50 text-family-600' : ''
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="mt-0.5 tracking-tight text-[11px]">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
