import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';

/**
 * Çizim tuvali: sabit 4:3 tahta + 0..COORD_SPACE koordinat.
 * Her cihaz aynı tahtayı görür; CSS yalnızca ölçekler, en-boy oranını bozmaz.
 */

export const COORD_SPACE = 10000;
export const BOARD_ASPECT = 4 / 3;
/** Tüm cihazlar aynı piksel tahtaya çizer; CSS yalnızca kutuyu sığdırır. */
const BOARD_PIXEL_W = 1200;
const BOARD_PIXEL_H = 900;

const MIN_SEND_DELTA = 18;

export type DrawTool = 'pen' | 'eraser' | 'rect' | 'circle' | 'triangle' | 'fill';
export type StrokeKind = 'stroke' | 'rect' | 'circle' | 'triangle' | 'fill';

export interface NormalizedStroke {
  c: string;
  w: number;
  p: number[];
  k?: StrokeKind;
}

export interface DrawingCanvasHandle {
  beginRemoteStroke: (id: string, color: string, width: number, kind?: StrokeKind) => void;
  appendRemotePoints: (id: string, points: number[]) => void;
  endRemoteStroke: (id: string) => void;
  replaceAll: (strokes: NormalizedStroke[]) => void;
  clearAll: () => void;
}

interface DrawingCanvasProps {
  interactive: boolean;
  color: string;
  width: number;
  tool?: DrawTool;
  onStrokeStart?: (strokeId: string, color: string, width: number, kind?: StrokeKind) => void;
  onLivePoints?: (strokeId: string, points: number[]) => void;
  onStrokeEnd?: (strokeId: string, stroke: NormalizedStroke) => void;
  className?: string;
}

interface RuntimeStroke {
  stroke: NormalizedStroke;
  rendered: number;
  lastMidX: number;
  lastMidY: number;
}

const clampCoord = (value: number) => Math.max(0, Math.min(COORD_SPACE, Math.round(value)));

const hexToRgba = (hex: string): [number, number, number, number] => {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw.padEnd(6, '0');
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

const colorsMatch = (
  data: Uint8ClampedArray,
  idx: number,
  target: [number, number, number, number],
  tol = 18
) =>
  Math.abs(data[idx] - target[0]) <= tol &&
  Math.abs(data[idx + 1] - target[1]) <= tol &&
  Math.abs(data[idx + 2] - target[2]) <= tol &&
  Math.abs(data[idx + 3] - target[3]) <= tol;

const floodFillPixels = (
  ctx: CanvasRenderingContext2D,
  cssX: number,
  cssY: number,
  cssW: number,
  cssH: number,
  fillHex: string
) => {
  const canvas = ctx.canvas;
  const x = Math.max(0, Math.min(canvas.width - 1, Math.round((cssX / cssW) * canvas.width)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.round((cssY / cssH) * canvas.height)));
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = image;
  const start = (y * width + x) * 4;
  const fill = hexToRgba(fillHex);
  const seed: [number, number, number, number] = [data[start], data[start + 1], data[start + 2], data[start + 3]];
  if (colorsMatch(data, start, fill, 4)) return;

  const stack = [x, y];
  while (stack.length) {
    const cy = stack.pop() as number;
    const cx = stack.pop() as number;
    let left = cx;
    while (left >= 0 && colorsMatch(data, (cy * width + left) * 4, seed)) left -= 1;
    left += 1;
    let right = cx;
    while (right < width && colorsMatch(data, (cy * width + right) * 4, seed)) right += 1;
    for (let i = left; i < right; i += 1) {
      const idx = (cy * width + i) * 4;
      data[idx] = fill[0];
      data[idx + 1] = fill[1];
      data[idx + 2] = fill[2];
      data[idx + 3] = fill[3];
      if (cy > 0 && colorsMatch(data, ((cy - 1) * width + i) * 4, seed)) stack.push(i, cy - 1);
      if (cy < height - 1 && colorsMatch(data, ((cy + 1) * width + i) * 4, seed)) stack.push(i, cy + 1);
    }
  }
  ctx.putImageData(image, 0, 0);
};

export const DrawingCanvas = React.forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  ({ interactive, color, width, tool = 'pen', onStrokeStart, onLivePoints, onStrokeEnd, className }, ref) => {
    const outerRef = useRef<HTMLDivElement | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const sizeRef = useRef({ cssWidth: BOARD_PIXEL_W, cssHeight: BOARD_PIXEL_H });

    const historyRef = useRef<NormalizedStroke[]>([]);
    const activeRef = useRef<Map<string, RuntimeStroke>>(new Map());
    const dirtyRef = useRef(false);
    const frameRef = useRef<number | null>(null);

    const localStrokeRef = useRef<{ id: string; runtime: RuntimeStroke } | null>(null);
    const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
    const previewRef = useRef<NormalizedStroke | null>(null);
    const lastSentRef = useRef<{ x: number; y: number } | null>(null);
    const propsRef = useRef({ color, width, tool, onStrokeStart, onLivePoints, onStrokeEnd });
    propsRef.current = { color, width, tool, onStrokeStart, onLivePoints, onStrokeEnd };

    const toPxX = (n: number) => (n / COORD_SPACE) * sizeRef.current.cssWidth;
    const toPxY = (n: number) => (n / COORD_SPACE) * sizeRef.current.cssHeight;
    const toPxWidth = (n: number) => Math.max(0.75, (n / COORD_SPACE) * sizeRef.current.cssWidth);

    const drawShape = useCallback((ctx: CanvasRenderingContext2D, stroke: NormalizedStroke) => {
      const { p, c, w, k } = stroke;
      if (!k || k === 'stroke' || p.length < 4 && k !== 'fill') return;
      ctx.strokeStyle = c;
      ctx.fillStyle = c;
      ctx.lineWidth = toPxWidth(w);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const x0 = toPxX(p[0]);
      const y0 = toPxY(p[1]);
      if (k === 'fill') {
        floodFillPixels(ctx, x0, y0, sizeRef.current.cssWidth, sizeRef.current.cssHeight, c);
        return;
      }
      const x1 = toPxX(p[2]);
      const y1 = toPxY(p[3]);
      ctx.beginPath();
      if (k === 'rect') {
        ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      } else if (k === 'circle') {
        const rx = Math.abs(x1 - x0) / 2;
        const ry = Math.abs(y1 - y0) / 2;
        ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (k === 'triangle') {
        ctx.moveTo((x0 + x1) / 2, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x0, y1);
        ctx.closePath();
        ctx.stroke();
      }
    }, []);

    const renderStrokeFrom = useCallback(
      (runtime: RuntimeStroke) => {
        const ctx = ctxRef.current;
        if (!ctx) return;
        const kind = runtime.stroke.k || 'stroke';
        if (kind !== 'stroke') {
          if (runtime.rendered > 0) return;
          if (kind === 'fill' && runtime.stroke.p.length >= 2) {
            drawShape(ctx, runtime.stroke);
            runtime.rendered = 1;
          } else if (runtime.stroke.p.length >= 4) {
            drawShape(ctx, runtime.stroke);
            runtime.rendered = 2;
          }
          return;
        }

        const { p } = runtime.stroke;
        const totalPairs = Math.floor(p.length / 2);
        if (totalPairs === 0 || runtime.rendered >= totalPairs) return;

        ctx.strokeStyle = runtime.stroke.c;
        ctx.fillStyle = runtime.stroke.c;
        ctx.lineWidth = toPxWidth(runtime.stroke.w);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

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
      },
      [drawShape]
    );

    const scheduleRender = useCallback(() => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        if (!dirtyRef.current) return;
        dirtyRef.current = false;
        activeRef.current.forEach((runtime) => renderStrokeFrom(runtime));
        const preview = previewRef.current;
        const ctx = ctxRef.current;
        if (preview && ctx) drawShape(ctx, preview);
      });
    }, [drawShape, renderStrokeFrom]);

    const redrawAll = useCallback(() => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const { cssWidth, cssHeight } = sizeRef.current;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      historyRef.current.forEach((stroke) => {
        renderStrokeFrom({ stroke, rendered: 0, lastMidX: 0, lastMidY: 0 });
      });

      activeRef.current.forEach((runtime) => {
        const pairs = Math.floor(runtime.stroke.p.length / 2);
        runtime.rendered = pairs;
      });
    }, [renderStrokeFrom]);

    const resizeCanvas = useCallback(() => {
      const outer = outerRef.current;
      const wrapper = wrapperRef.current;
      const canvas = canvasRef.current;
      if (!outer || !wrapper || !canvas) return;

      const avail = outer.getBoundingClientRect();
      if (avail.width < 1 || avail.height < 1) return;

      let viewW = avail.width;
      let viewH = viewW / BOARD_ASPECT;
      if (viewH > avail.height) {
        viewH = avail.height;
        viewW = viewH * BOARD_ASPECT;
      }

      sizeRef.current = { cssWidth: BOARD_PIXEL_W, cssHeight: BOARD_PIXEL_H };
      wrapper.style.width = `${viewW}px`;
      wrapper.style.height = `${viewH}px`;

      if (canvas.width !== BOARD_PIXEL_W || canvas.height !== BOARD_PIXEL_H) {
        canvas.width = BOARD_PIXEL_W;
        canvas.height = BOARD_PIXEL_H;
      }
      canvas.style.width = '100%';
      canvas.style.height = '100%';

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctxRef.current = ctx;
      redrawAll();
    }, [redrawAll]);

    useEffect(() => {
      resizeCanvas();
      const outer = outerRef.current;
      if (!outer || typeof ResizeObserver === 'undefined') {
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
      }
      const observer = new ResizeObserver(() => resizeCanvas());
      observer.observe(outer);
      return () => observer.disconnect();
    }, [resizeCanvas]);

    useEffect(
      () => () => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      },
      []
    );

    useImperativeHandle(
      ref,
      (): DrawingCanvasHandle => ({
        beginRemoteStroke: (id, strokeColor, strokeWidth, kind) => {
          if (activeRef.current.has(id)) return;
          const stroke: NormalizedStroke = { c: strokeColor, w: strokeWidth, p: [], k: kind || 'stroke' };
          historyRef.current.push(stroke);
          activeRef.current.set(id, { stroke, rendered: 0, lastMidX: 0, lastMidY: 0 });
        },
        appendRemotePoints: (id, points) => {
          const runtime = activeRef.current.get(id);
          if (!runtime || points.length === 0) return;
          runtime.stroke.p.push(...points);
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
          previewRef.current = null;
          historyRef.current = strokes.map((s) => ({ c: s.c, w: s.w, p: [...s.p], k: s.k }));
          redrawAll();
        },
        clearAll: () => {
          activeRef.current.clear();
          localStrokeRef.current = null;
          previewRef.current = null;
          historyRef.current = [];
          redrawAll();
        },
      }),
      [redrawAll, renderStrokeFrom, scheduleRender]
    );

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

    const commitShape = useCallback(
      (kind: StrokeKind, start: { x: number; y: number }, end: { x: number; y: number }) => {
        const { color: strokeColor, width: strokeWidth, onStrokeStart, onLivePoints, onStrokeEnd } =
          propsRef.current;
        const strokeId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const stroke: NormalizedStroke = {
          c: strokeColor,
          w: strokeWidth,
          p: [start.x, start.y, end.x, end.y],
          k: kind,
        };
        historyRef.current.push(stroke);
        previewRef.current = null;
        redrawAll();
        onStrokeStart?.(strokeId, strokeColor, strokeWidth, kind);
        onLivePoints?.(strokeId, stroke.p);
        onStrokeEnd?.(strokeId, stroke);
      },
      [redrawAll]
    );

    const handlePointerDown = useCallback(
      (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!interactive || event.button > 0) return;
        const point = pointToNormalized(event.clientX, event.clientY);
        if (!point) return;
        event.preventDefault();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }

        const { color: strokeColor, width: strokeWidth, tool: currentTool, onStrokeStart, onLivePoints, onStrokeEnd } =
          propsRef.current;

        if (currentTool === 'fill') {
          const strokeId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
          const stroke: NormalizedStroke = { c: strokeColor, w: strokeWidth, p: [point.x, point.y], k: 'fill' };
          historyRef.current.push(stroke);
          redrawAll();
          onStrokeStart?.(strokeId, strokeColor, strokeWidth, 'fill');
          onLivePoints?.(strokeId, stroke.p);
          onStrokeEnd?.(strokeId, stroke);
          return;
        }

        if (currentTool === 'rect' || currentTool === 'circle' || currentTool === 'triangle') {
          shapeStartRef.current = point;
          previewRef.current = { c: strokeColor, w: strokeWidth, p: [point.x, point.y, point.x, point.y], k: currentTool };
          dirtyRef.current = true;
          scheduleRender();
          return;
        }

        const strokeId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const stroke: NormalizedStroke = { c: strokeColor, w: strokeWidth, p: [point.x, point.y], k: 'stroke' };
        const runtime: RuntimeStroke = { stroke, rendered: 0, lastMidX: 0, lastMidY: 0 };
        historyRef.current.push(stroke);
        activeRef.current.set(strokeId, runtime);
        localStrokeRef.current = { id: strokeId, runtime };
        lastSentRef.current = { x: point.x, y: point.y };
        dirtyRef.current = true;
        scheduleRender();
        onStrokeStart?.(strokeId, strokeColor, strokeWidth, 'stroke');
        onLivePoints?.(strokeId, [point.x, point.y]);
      },
      [interactive, pointToNormalized, redrawAll, scheduleRender]
    );

    const handlePointerMove = useCallback(
      (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!interactive) return;
        const start = shapeStartRef.current;
        if (start) {
          const point = pointToNormalized(event.clientX, event.clientY);
          if (!point) return;
          event.preventDefault();
          const tool = propsRef.current.tool;
          const kind: StrokeKind =
            tool === 'rect' || tool === 'circle' || tool === 'triangle' ? tool : 'rect';
          previewRef.current = {
            c: propsRef.current.color,
            w: propsRef.current.width,
            p: [start.x, start.y, point.x, point.y],
            k: kind,
          };
          redrawAll();
          if (previewRef.current) drawShape(ctxRef.current!, previewRef.current);
          return;
        }

        const local = localStrokeRef.current;
        if (!local) return;
        event.preventDefault();

        const native = event.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
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
          if (p[p.length - 2] === point.x && p[p.length - 1] === point.y) continue;
          p.push(point.x, point.y);
          const lastSent = lastSentRef.current;
          if (!lastSent || Math.abs(point.x - lastSent.x) + Math.abs(point.y - lastSent.y) >= MIN_SEND_DELTA) {
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
      [drawShape, interactive, pointToNormalized, redrawAll, scheduleRender]
    );

    const finishStroke = useCallback(
      (event: React.PointerEvent<HTMLCanvasElement>) => {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }

        const start = shapeStartRef.current;
        if (start) {
          const point = pointToNormalized(event.clientX, event.clientY) || start;
          const kind = propsRef.current.tool;
          shapeStartRef.current = null;
          previewRef.current = null;
          if (kind === 'rect' || kind === 'circle' || kind === 'triangle') {
            commitShape(kind, start, point);
          }
          return;
        }

        const local = localStrokeRef.current;
        if (!local) return;
        localStrokeRef.current = null;
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
      [commitShape, pointToNormalized, renderStrokeFrom]
    );

    return (
      <div
        ref={outerRef}
        className={`relative flex items-center justify-center min-h-0 min-w-0 w-full h-full ${className || ''}`}
        style={{ backgroundColor: '#0c0a14' }}
      >
        <div
          ref={wrapperRef}
          className="relative overflow-hidden bg-white shadow-inner"
          style={{
            touchAction: 'none',
            backgroundColor: '#ffffff',
          }}
        >
          <canvas
            ref={canvasRef}
            className="block bg-white"
            style={{
              touchAction: 'none',
              cursor: interactive ? 'crosshair' : 'default',
              userSelect: 'none',
              backgroundColor: '#ffffff',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            onPointerLeave={(event) => {
              if ((localStrokeRef.current || shapeStartRef.current) && event.pointerType === 'mouse') {
                finishStroke(event);
              }
            }}
          />
        </div>
      </div>
    );
  }
);

DrawingCanvas.displayName = 'DrawingCanvas';
