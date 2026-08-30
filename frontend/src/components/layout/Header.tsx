import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Users, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';

export const Header: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily, activeMember } = useFamily();
  const navigate = useNavigate();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'Günaydın';
    if (hour >= 12 && hour < 18) return 'İyi günler';
    if (hour >= 18 && hour < 22) return 'İyi akşamlar';
    return 'İyi geceler';
  };

  const displayName = activeMember?.nickname || user?.full_name?.split(' ')[0] || 'Ailem';
  const isAdmin = user?.role === 'admin';

  return (
    <header className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-40 shadow-sm safe-area-top">
      <div className="flex items-center justify-between max-w-lg mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-family-50 flex items-center justify-center text-family-600 shadow-inner">
            <Heart className="w-6 h-6 fill-family-500 text-family-500 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <span>{getGreeting()}</span>
              <span>{displayName} ❤️</span>
            </div>
            <h1 className="text-base font-bold text-gray-900 truncate max-w-[170px]">
              {currentFamily ? currentFamily.name : 'Ailem'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="w-11 h-11 rounded-2xl bg-amber-50 hover:bg-amber-100 active:scale-95 flex items-center justify-center text-amber-700 transition border border-amber-200"
              title="Sistem Gösterge Paneli (Admin)"
              aria-label="Admin Paneli"
            >
              <ShieldCheck className="w-5 h-5 text-amber-600" />
            </button>
          )}

          <button
            onClick={() => navigate('/family')}
            className="w-11 h-11 rounded-2xl bg-gray-50 hover:bg-gray-100 active:scale-95 flex items-center justify-center text-gray-700 transition border border-gray-100"
            title="Aile Üyeleri ve Ayarlar"
            aria-label="Aile Ayarları"
          >
            <Users className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
