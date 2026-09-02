import React from 'react';
import { Clapperboard, Hourglass } from 'lucide-react';

/**
 * Seyir Partisi bölümü. Şu aşamada yalnızca menüde yer alan, adı ve rotası
 * hazır boş bir bölüm; içerik sonraki adımda geliştirilecek.
 */
export const WatchPartyPage: React.FC = () => (
  <div className="p-4 w-full max-w-2xl mx-auto">
    <div className="theme-surface rounded-3xl p-8 border theme-border text-center space-y-4">
      <div className="w-16 h-16 rounded-3xl bg-violet-100 text-violet-600 mx-auto flex items-center justify-center">
        <Clapperboard className="w-8 h-8" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-black theme-text-primary">Seyir Partisi</h1>
        <p className="text-xs theme-text-secondary leading-relaxed max-w-sm mx-auto">
          Ailenizle birlikte aynı anda film ve dizi izleyeceğiniz bölüm burada olacak.
        </p>
      </div>
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-violet-50 text-violet-700 text-[11px] font-black">
        <Hourglass className="w-3.5 h-3.5" />
        <span>Yakında</span>
      </div>
    </div>
  </div>
);

export default WatchPartyPage;
