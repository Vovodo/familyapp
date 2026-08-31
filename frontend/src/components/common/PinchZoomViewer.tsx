import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

interface PinchZoomViewerProps {
  src: string;
  onClose: () => void;
}

export const PinchZoomViewer: React.FC<PinchZoomViewerProps> = ({ src, onClose }) => {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const lastTouchDistRef = useRef<number | null>(null);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const startPosRef = useRef({ x: 0, y: 0 });
  const startPinchCenterRef = useRef({ x: 0, y: 0 });
  const startScaleRef = useRef(1);

  const clampScale = (s: number) => Math.min(Math.max(s, 1), 5);
  const clampPos = useCallback((x: number, y: number, s: number) => {
    if (!containerRef.current || !imgRef.current) return { x, y };
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const iw = imgRef.current.naturalWidth || cw;
    const ih = imgRef.current.naturalHeight || ch;
    const rendW = Math.min(iw, cw) * s;
    const rendH = Math.min(ih, ch) * s;
    const maxX = Math.max(0, (rendW - cw) / 2);
    const maxY = Math.max(0, (rendH - ch) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }, []);

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      lastPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      startPosRef.current = { x: pos.x, y: pos.y };
      setIsDragging(true);
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      lastTouchDistRef.current = Math.sqrt(dx * dx + dy * dy);
      startScaleRef.current = scale;
      startPinchCenterRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2 && lastTouchDistRef.current !== null) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const newScale = clampScale(startScaleRef.current * (dist / lastTouchDistRef.current));
      setScale(newScale);
      if (newScale === 1) {
        setPos({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      const deltaX = e.touches[0].clientX - lastPosRef.current.x;
      const deltaY = e.touches[0].clientY - lastPosRef.current.y;
      lastPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const newPos = clampPos(pos.x + deltaX, pos.y + deltaY, scale);
      setPos(newPos);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      lastTouchDistRef.current = null;
    }
    setIsDragging(false);
  };

  // Double tap to zoom
  const lastTapRef = useRef(0);
  const handleDoubleTap = (e: React.TouchEvent) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (scale > 1) {
        setScale(1);
        setPos({ x: 0, y: 0 });
      } else {
        setScale(2.5);
      }
    }
    lastTapRef.current = now;
  };

  // Mouse wheel zoom (desktop)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => clampScale(s * delta));
  };

  // Close on background click when not zoomed
  const handleBackdropClick = () => {
    if (scale <= 1) onClose();
  };

  // Keyboard ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center overflow-hidden select-none"
      onClick={handleBackdropClick}
    >
      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 z-10 p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition cursor-pointer"
        aria-label="Kapat"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Zoom indicators */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/50 rounded-full px-3 py-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); setScale((s) => clampScale(s - 0.5)); if (scale <= 1.5) setPos({ x: 0, y: 0 }); }}
          className="p-1 text-white/80 hover:text-white transition cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-white text-xs font-bold w-10 text-center">{Math.round(scale * 100)}%</span>
        <button
          onClick={(e) => { e.stopPropagation(); setScale((s) => clampScale(s + 0.5)); }}
          className="p-1 text-white/80 hover:text-white transition cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      {/* Hint */}
      {scale === 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-white/50 text-xs text-center">
          Yakınlaştırmak için iki parmakla sürükle ya da çift dokun
        </div>
      )}

      {/* Zoomable image */}
      <div
        className="w-full h-full flex items-center justify-center"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchStartCapture={handleDoubleTap}
        onWheel={handleWheel}
        onClick={(e) => e.stopPropagation()}
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default', touchAction: 'none' }}
      >
        <img
          ref={imgRef}
          src={src}
          alt="Büyük fotoğraf"
          draggable={false}
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.2s ease',
            maxWidth: '100vw',
            maxHeight: '88vh',
            objectFit: 'contain',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        />
      </div>
    </div>
  );
};
