import React, { useMemo } from 'react';

const COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#eab308'];

interface DrawingConfettiProps {
  active: boolean;
}

export const DrawingConfetti: React.FC<DrawingConfettiProps> = ({ active }) => {
  const bits = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        id: i,
        left: (i * 17) % 100,
        delay: (i % 8) * 0.04,
        duration: 1.1 + (i % 5) * 0.12,
        color: COLORS[i % COLORS.length],
        size: 6 + (i % 5) * 2,
        dx: ((i % 9) - 4) * 14,
      })),
    []
  );

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none overflow-hidden" aria-hidden>
      <style>{`
        @keyframes draw-confetti-fall {
          0% { transform: translate3d(0, -12px, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(var(--dx), 105vh, 0) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {bits.map((bit) => (
        <span
          key={bit.id}
          className="absolute top-0 rounded-[2px]"
          style={{
            left: `${bit.left}%`,
            width: bit.size,
            height: bit.size * 1.4,
            backgroundColor: bit.color,
            ['--dx' as string]: `${bit.dx}px`,
            animation: `draw-confetti-fall ${bit.duration}s ease-in ${bit.delay}s both`,
          }}
        />
      ))}
    </div>
  );
};
