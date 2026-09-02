import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';

/**
 * Çizim tuvali: Canvas 2D + Pointer Events.
 *
 * Koordinatlar 0..COORD_SPACE aralığına normalize edilir ve tuval sabit bir
 * en-boy oranında tutulur, böylece aynı çizim her ekran boyutunda ve her
 * istemcide aynı görünür. Fırça kalınlığı da aynı uzayda taşınır.
 *
 * Yerel çizim ağdan tamamen bağımsızdır: nokta geldiği anda tampona yazılır ve
 * aynı karede (rAF) tuvale işlenir. Ağ katmanı yalnızca `onLivePoints` /
 * `onStrokeEnd` callback'leriyle beslenir.
 */

export const COORD_SPACE = 10000;

/** Ağa gönderim için minimum nokta mesafesi (COORD_SPACE uzayında). */
const MIN_SEND_DELTA = 18;

export interface NormalizedStroke {
  /** renk */
  c: string;
  /** kalınlık (COORD_SPACE uzayında) */
  w: number;
  /** [x0,y0,x1,y1,...] */
  p: number[];
}

export interface DrawingCanvasHandle {
  beginRemoteStroke: (id: string, color: string, width: number) => void;
  appendRemotePoints: (id: string, points: number[]) => void;
  endRemoteStroke: (id: string) => void;
  /** Tüm tuvali verilen çizgi listesiyle baştan kurar (replay / resync). */
  replaceAll: (strokes: NormalizedStroke[]) => void;
  clearAll: () => void;
}

interface DrawingCanvasProps {
  interactive: boolean;
  color: string;
  /** Kalınlık, COORD_SPACE uzayında (ör. 40 ≈ ekran genişliğinin %0.4'ü). */
  width: number;
  onStrokeStart?: (strokeId: string, color: string, width: number) => void;
  onLivePoints?: (strokeId: string, points: number[]) => void;
  onStrokeEnd?: (strokeId: string, stroke: NormalizedStroke) => void;
  className?: string;
}

interface RuntimeStroke {
  stroke: NormalizedStroke;
  /** Kaç nokta çifti tuvale işlendi */
  rendered: number;
  lastMidX: number;
  lastMidY: number;
}

const clampCoord = (value: number) => Math.max(0, Math.min(COORD_SPACE, Math.round(value)));

export const DrawingCanvas = React.forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  ({ interactive, color, width, onStrokeStart, onLivePoints, onStrokeEnd, className }, ref) => {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const sizeRef = useRef({ cssWidth: 0, cssHeight: 0 });

    /** Tuvalin tam içeriği; yeniden boyutlandırmada bundan replay edilir. */
    const historyRef = useRef<NormalizedStroke[]>([]);
    /** Henüz bitmemiş (yerel + uzak) çizgiler; her karede artımlı işlenir. */
    const activeRef = useRef<Map<string, RuntimeStroke>>(new Map());
    const dirtyRef = useRef(false);
    const frameRef = useRef<number | null>(null);

    const localStrokeRef = useRef<{ id: string; runtime: RuntimeStroke } | null>(null);
    // Ağa gönderilirken çok yakın noktaları atlamak için son gönderilen nokta
    const lastSentRef = useRef<{ x: number; y: number } | null>(null);
    const propsRef = useRef({ color, width, onStrokeStart, onLivePoints, onStrokeEnd });
    propsRef.current = { color, width, onStrokeStart, onLivePoints, onStrokeEnd };

    const toPxX = (n: number) => (n / COORD_SPACE) * sizeRef.current.cssWidth;
    const toPxY = (n: number) => (n / COORD_SPACE) * sizeRef.current.cssHeight;
    const toPxWidth = (n: number) =>
      Math.max(0.75, (n / COORD_SPACE) * sizeRef.current.cssWidth);

    /**
     * Bir çizgiyi `fromPair` noktasından itibaren artımlı olarak çizer.
     * Ara noktaların orta noktalarından geçen quadratic Bézier kullanıldığı
     * için çizgi köşeli değil, doğal ve sürekli görünür.
     */
    const renderStrokeFrom = useCallback((runtime: RuntimeStroke) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const { p } = runtime.stroke;
      const totalPairs = Math.floor(p.length / 2);
      if (totalPairs === 0 || runtime.rendered >= totalPairs) return;

      ctx.strokeStyle = runtime.stroke.c;
      ctx.fillStyle = runtime.stroke.c;
      ctx.lineWidth = toPxWidth(runtime.stroke.w);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // İlk nokta: tek dokunuşta da iz kalsın diye nokta olarak basılır.
      if (runtime.rendered === 0) {
        const x0 = toPxX(p[0]);
        const y0 = toPxY(p[1]);
        ctx.beginPath();
        ctx.arc(x0, y0, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        runtime.lastMidX = x0;
        runtime.lastMidY = y0;
        runtime.rendered = 1;
      }

      for (let i = runtime.rendered; i < totalPairs; i += 1) {
        const prevX = toPxX(p[(i - 1) * 2]);
        const prevY = toPxY(p[(i - 1) * 2 + 1]);
        const curX = toPxX(p[i * 2]);
        const curY = toPxY(p[i * 2 + 1]);
        const midX = (prevX + curX) / 2;
        const midY = (prevY + curY) / 2;

        ctx.beginPath();
        ctx.moveTo(runtime.lastMidX, runtime.lastMidY);
        ctx.quadraticCurveTo(prevX, prevY, midX, midY);
        ctx.stroke();

        runtime.lastMidX = midX;
        runtime.lastMidY = midY;
      }
      runtime.rendered = totalPairs;
    }, []);

    const scheduleRender = useCallback(() => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        if (!dirtyRef.current) return;
        dirtyRef.current = false;
        activeRef.current.forEach((runtime) => renderStrokeFrom(runtime));
      });
    }, [renderStrokeFrom]);

    /** Tuvali siler ve geçmişteki tüm çizgileri baştan işler. */
    const redrawAll = useCallback(() => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const { cssWidth, cssHeight } = sizeRef.current;
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      historyRef.current.forEach((stroke) => {
        renderStrokeFrom({ stroke, rendered: 0, lastMidX: 0, lastMidY: 0 });
      });

      // Devam eden çizgiler geçmişte zaten referansla duruyor; sayaçlarını
      // tam çizilmiş kabul edecek şekilde güncelle.
      activeRef.current.forEach((runtime) => {
        const pairs = Math.floor(runtime.stroke.p.length / 2);
        runtime.rendered = pairs;
        if (pairs >= 2) {
          const p = runtime.stroke.p;
          runtime.lastMidX = (toPxX(p[(pairs - 2) * 2]) + toPxX(p[(pairs - 1) * 2])) / 2;
          runtime.lastMidY = (toPxY(p[(pairs - 2) * 2 + 1]) + toPxY(p[(pairs - 1) * 2 + 1])) / 2;
        }
      });
    }, [renderStrokeFrom]);

    /** Canvas'ı cihaz piksel oranına göre ölçekler (pixelation önlemi). */
    const resizeCanvas = useCallback(() => {
      const wrapper = wrapperRef.current;
      const canvas = canvasRef.current;
      if (!wrapper || !canvas) return;

      const rect = wrapper.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const nextW = Math.round(rect.width * dpr);
      const nextH = Math.round(rect.height * dpr);

      sizeRef.current = { cssWidth: rect.width, cssHeight: rect.height };

      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
      }
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxRef.current = ctx;
      redrawAll();
    }, [redrawAll]);

    useEffect(() => {
      resizeCanvas();
      const wrapper = wrapperRef.current;
      if (!wrapper || typeof ResizeObserver === 'undefined') {
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
      }
      const observer = new ResizeObserver(() => resizeCanvas());
      observer.observe(wrapper);
      return () => observer.disconnect();
    }, [resizeCanvas]);

    useEffect(
      () => () => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      },
      []
    );

    // ------------------------------------------------------------ imperatif API

    useImperativeHandle(
      ref,
      (): DrawingCanvasHandle => ({
        beginRemoteStroke: (id, strokeColor, strokeWidth) => {
          if (activeRef.current.has(id)) return;
          const stroke: NormalizedStroke = { c: strokeColor, w: strokeWidth, p: [] };
          historyRef.current.push(stroke);
          activeRef.current.set(id, { stroke, rendered: 0, lastMidX: 0, lastMidY: 0 });
        },
        appendRemotePoints: (id, points) => {
          const runtime = activeRef.current.get(id);
          if (!runtime || points.length === 0) return;
          for (let i = 0; i < points.length; i += 1) {
            runtime.stroke.p.push(points[i]);
          }
          dirtyRef.current = true;
          scheduleRender();
        },
        endRemoteStroke: (id) => {
          const runtime = activeRef.current.get(id);
          if (!runtime) return;
          renderStrokeFrom(runtime);
          activeRef.current.delete(id);
        },
        replaceAll: (strokes) => {
          activeRef.current.clear();
          localStrokeRef.current = null;
          historyRef.current = strokes.map((s) => ({ c: s.c, w: s.w, p: [...s.p] }));
          redrawAll();
        },
        clearAll: () => {
          activeRef.current.clear();
          localStrokeRef.current = null;
          historyRef.current = [];
          redrawAll();
        },
      }),
      [redrawAll, renderStrokeFrom, scheduleRender]
    );

    // ------------------------------------------------------------ girdi

    const pointToNormalized = useCallback((clientX: number, clientY: number) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return null;
      const rect = wrapper.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      return {
        x: clampCoord(((clientX - rect.left) / rect.width) * COORD_SPACE),
        y: clampCoord(((clientY - rect.top) / rect.height) * COORD_SPACE),
      };
    }, []);

    const handlePointerDown = useCallback(
      (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!interactive || event.button > 0) return;
        const point = pointToNormalized(event.clientX, event.clientY);
        if (!point) return;

        event.preventDefault();
        // Parmak/imleç tuvalin dışına taşsa da çizgi kopmasın.
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Bazı tarayıcılarda desteklenmiyor; çizim yine çalışır.
        }

        const strokeId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const { color: strokeColor, width: strokeWidth, onStrokeStart, onLivePoints } =
          propsRef.current;
        const stroke: NormalizedStroke = { c: strokeColor, w: strokeWidth, p: [point.x, point.y] };
        const runtime: RuntimeStroke = { stroke, rendered: 0, lastMidX: 0, lastMidY: 0 };

        historyRef.current.push(stroke);
        activeRef.current.set(strokeId, runtime);
        localStrokeRef.current = { id: strokeId, runtime };
        lastSentRef.current = { x: point.x, y: point.y };

        dirtyRef.current = true;
        scheduleRender();

        onStrokeStart?.(strokeId, strokeColor, strokeWidth);
        onLivePoints?.(strokeId, [point.x, point.y]);
      },
      [interactive, pointToNormalized, scheduleRender]
    );

    const handlePointerMove = useCallback(
      (event: React.PointerEvent<HTMLCanvasElement>) => {
        const local = localStrokeRef.current;
        if (!interactive || !local) return;
        event.preventDefault();

        // Tarayıcı hızlı hareketlerde birden fazla girdi örneğini tek event'te
        // birleştirir. Hepsini okumak, hızlı çizimde çizginin kopmasını önler.
        const native = event.nativeEvent as PointerEvent & {
          getCoalescedEvents?: () => PointerEvent[];
        };
        let samples: Array<{ clientX: number; clientY: number }> = [];
        if (typeof native.getCoalescedEvents === 'function') {
          const coalesced = native.getCoalescedEvents();
          samples = coalesced && coalesced.length > 0 ? coalesced : [native];
        } else {
          samples = [native];
        }

        const forNetwork: number[] = [];
        for (let i = 0; i < samples.length; i += 1) {
          const point = pointToNormalized(samples[i].clientX, samples[i].clientY);
          if (!point) continue;

          const p = local.runtime.stroke.p;
          const lastX = p[p.length - 2];
          const lastY = p[p.length - 1];
          // Aynı pikselde tekrarlayan örnekleri at: kalite değişmez, iş azalır.
          if (lastX === point.x && lastY === point.y) continue;
          p.push(point.x, point.y);

          const lastSent = lastSentRef.current;
          if (
            !lastSent ||
            Math.abs(point.x - lastSent.x) + Math.abs(point.y - lastSent.y) >= MIN_SEND_DELTA
          ) {
            forNetwork.push(point.x, point.y);
            lastSentRef.current = { x: point.x, y: point.y };
          }
        }

        if (local.runtime.stroke.p.length > 0) {
          dirtyRef.current = true;
          scheduleRender();
        }
        if (forNetwork.length > 0) {
          propsRef.current.onLivePoints?.(local.id, forNetwork);
        }
      },
      [interactive, pointToNormalized, scheduleRender]
    );

    const finishStroke = useCallback(
      (event: React.PointerEvent<HTMLCanvasElement>) => {
        const local = localStrokeRef.current;
        if (!local) return;
        localStrokeRef.current = null;

        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // yoksay
        }

        renderStrokeFrom(local.runtime);
        activeRef.current.delete(local.id);

        const p = local.runtime.stroke.p;
        const lastSent = lastSentRef.current;
        const finalX = p[p.length - 2];
        const finalY = p[p.length - 1];
        if (lastSent && (lastSent.x !== finalX || lastSent.y !== finalY)) {
          propsRef.current.onLivePoints?.(local.id, [finalX, finalY]);
        }
        lastSentRef.current = null;

        propsRef.current.onStrokeEnd?.(local.id, local.runtime.stroke);
      },
      [renderStrokeFrom]
    );

    return (
      <div
        ref={wrapperRef}
        className={`relative w-full overflow-hidden bg-white ${className || ''}`}
        style={{ aspectRatio: '4 / 3', touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block"
          style={{
            touchAction: 'none',
            cursor: interactive ? 'crosshair' : 'default',
            userSelect: 'none',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={(event) => {
            // Kalem/parmak yakalandığı için normalde tetiklenmez; fare tuvalden
            // çıkarsa çizgiyi düzgün kapatır.
            if (localStrokeRef.current && event.pointerType === 'mouse') finishStroke(event);
          }}
        />
      </div>
    );
  }
);

DrawingCanvas.displayName = 'DrawingCanvas';
