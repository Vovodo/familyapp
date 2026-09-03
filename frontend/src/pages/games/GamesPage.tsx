import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Palette, Users } from 'lucide-react';
import { Logo } from '../../components/branding/Logo';
import { useFamily } from '../../contexts/FamilyContext';

export const GamesPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentFamily } = useFamily();

  const memberCount = currentFamily?.members?.length ?? 0;

  return (
    <div className="p-4 space-y-4 w-full max-w-2xl mx-auto">
      <div className="theme-surface rounded-3xl p-5 border theme-border">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-fuchsia-600">
          <Logo size="xs" />
          <span>Aile Oyunları</span>
        </div>
        <h1 className="text-xl font-black theme-text-primary mt-1">Birlikte oynayın</h1>
        <p className="text-xs theme-text-secondary mt-1 leading-relaxed">
          Aynı evde ya da uzakta olun, aile grubunuzla anlık oynayabileceğiniz oyunlar.
        </p>
      </div>

      <button
        type="button"
        onClick={() => navigate('/games/draw')}
        className="w-full text-left p-5 bg-fuchsia-50/80 hover:bg-fuchsia-100/80 active:scale-98 rounded-3xl border border-fuchsia-200 transition cursor-pointer"
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-fuchsia-600 text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-fuchsia-300">
            <Palette className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-fuchsia-950">Çiz ve Tahmin Et</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-lg bg-fuchsia-600 text-white font-black">
                Canlı
              </span>
            </div>
            <p className="text-xs text-fuchsia-900/80 mt-1 leading-relaxed">
              Bir kişiye gizli bir kelime verilir, o çizer; diğerleri tahmin eder. Çizim tüm
              ailenin ekranında anlık görünür.
            </p>
            <div className="flex items-center gap-3 mt-2 text-[11px] font-bold text-fuchsia-800">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                En az 2 kişi · üst sınır yok
              </span>
              <span>·</span>
              <span>{memberCount} aile üyesi</span>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-fuchsia-400 flex-shrink-0 mt-1" />
        </div>
      </button>

      <p className="text-[11px] text-center theme-text-secondary">
        Yeni oyunlar zamanla bu bölüme eklenecek.
      </p>
    </div>
  );
};

export default GamesPage;
