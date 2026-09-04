import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Palette, Swords, Users } from 'lucide-react';
import { Logo } from '../../components/branding/Logo';
import { useDrawingGameOptional } from '../../contexts/DrawingGameContext';
import { useWordWarOptional } from '../../contexts/WordWarContext';
import { DrawingPlayer, WordWarPlayer } from '../../types';

function face(name: string, avatar?: string | null) {
  if (avatar) return <img src={avatar} alt="" className="w-full h-full object-cover" />;
  return <span>{(name || '?').slice(0, 1).toUpperCase()}</span>;
}

const AvatarStack: React.FC<{ people: Array<{ name: string; avatar_url?: string | null; user_id: string }> }> = ({
  people,
}) => {
  if (!people.length) return null;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {people.slice(0, 5).map((p) => (
          <div
            key={p.user_id}
            className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-black border-2 theme-border"
            style={{ background: 'var(--theme-surface-secondary)', color: 'var(--theme-text-primary)' }}
            title={p.name}
          >
            {face(p.name, p.avatar_url)}
          </div>
        ))}
      </div>
      {people.length > 5 && (
        <span className="ml-2 text-[11px] font-bold theme-text-secondary">+{people.length - 5}</span>
      )}
    </div>
  );
};

const GameCard: React.FC<{
  title: string;
  blurb: string;
  icon: React.ReactNode;
  live: boolean;
  players: Array<{ name: string; avatar_url?: string | null; user_id: string }>;
  statusLabel: string;
  onOpen: () => void;
  onJoin: () => void;
}> = ({ title, blurb, icon, live, players, statusLabel, onOpen, onJoin }) => (
  <div className="theme-surface border theme-border rounded-3xl p-4 space-y-3">
    <button type="button" onClick={onOpen} className="w-full text-left cursor-pointer">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl theme-cta text-white flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-black theme-text-primary">{title}</h2>
            {live && (
              <span className="text-[10px] px-2 py-0.5 rounded-lg bg-violet-500/25 text-violet-200 font-black border border-violet-400/30">
                Canlı
              </span>
            )}
          </div>
          <p className="text-xs theme-text-secondary mt-1 leading-relaxed">{blurb}</p>
        </div>
      </div>
    </button>

    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        {players.length > 0 ? (
          <div className="space-y-1">
            <AvatarStack people={players} />
            <p className="text-[11px] font-bold theme-text-secondary truncate">
              {statusLabel} · {players.map((p) => p.name).join(', ')}
            </p>
          </div>
        ) : (
          <p className="text-[11px] font-bold theme-text-secondary flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            Lobide kimse yok · en az 2 kişi
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onJoin}
        className="flex-shrink-0 px-3 py-2 rounded-xl text-[11px] font-black text-white theme-cta cursor-pointer"
      >
        Lobiye katıl
      </button>
    </div>
  </div>
);

function drawingLobby(players: DrawingPlayer[] | undefined) {
  return (players || []).filter((p) => p.is_online !== false);
}

function wordLobby(players: WordWarPlayer[] | undefined) {
  return (players || []).filter((p) => p.is_online);
}

export const GamesPage: React.FC = () => {
  const navigate = useNavigate();
  const drawing = useDrawingGameOptional();
  const wordWar = useWordWarOptional();
  const refreshDraw = drawing?.refreshState;
  const refreshWord = wordWar?.refreshState;

  useEffect(() => {
    void refreshDraw?.();
    void refreshWord?.();
    const timer = window.setInterval(() => {
      void refreshDraw?.();
      void refreshWord?.();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [refreshDraw, refreshWord]);

  const drawPlayers = drawingLobby(drawing?.state?.players);
  const wordPlayers = wordLobby(wordWar?.state?.players);
  const drawLive = !!drawing?.state && drawing.state.status !== 'none' && drawing.state.status !== 'finished';
  const wordLive = !!wordWar?.state && wordWar.state.status !== 'none' && wordWar.state.status !== 'finished';

  const drawStatus =
    drawing?.state?.status === 'drawing'
      ? 'Oyun sürüyor'
      : drawing?.state?.status === 'round_end'
        ? 'Tur arası'
        : drawPlayers.length
          ? 'Lobi açık'
          : 'Hazır';

  const wordStatus =
    wordWar?.state?.status === 'playing'
      ? 'Oyun sürüyor'
      : wordWar?.state?.status === 'countdown'
        ? 'Başlamak üzere'
        : wordWar?.state?.status === 'winner'
          ? 'Kazanan açıklanıyor'
          : wordWar?.state?.status === 'round_end'
            ? 'Tur arası'
            : wordPlayers.length
              ? 'Lobi açık'
              : 'Hazır';

  return (
    <div className="p-4 space-y-4 w-full max-w-2xl mx-auto">
      <div className="theme-surface rounded-3xl p-5 border theme-border">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-violet-300">
          <Logo size="xs" />
          <span>Aile Oyunları</span>
        </div>
        <h1 className="text-xl font-black theme-text-primary mt-1">Birlikte oynayın</h1>
        <p className="text-xs theme-text-secondary mt-1 leading-relaxed">
          Aynı evde ya da uzakta olun, aile grubunuzla anlık oynayabileceğiniz oyunlar.
        </p>
      </div>

      <GameCard
        title="Çiz ve Tahmin Et"
        blurb="Bir kişiye gizli bir kelime verilir, o çizer; diğerleri tahmin eder. Çizim tüm ailenin ekranında anlık görünür."
        icon={<Palette className="w-6 h-6" />}
        live={drawLive}
        players={drawPlayers}
        statusLabel={drawStatus}
        onOpen={() => navigate('/games/draw')}
        onJoin={() => navigate('/games/draw')}
      />

      <GameCard
        title="Kelime Savaşı"
        blurb="Son harften yeni kelime üret. Süre kısa, eventler sürpriz, puanlar ve tepkiler parti temposunda."
        icon={<Swords className="w-6 h-6" />}
        live={wordLive}
        players={wordPlayers}
        statusLabel={wordStatus}
        onOpen={() => navigate('/games/word')}
        onJoin={() => navigate('/games/word')}
      />
    </div>
  );
};

export default GamesPage;
