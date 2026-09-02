import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { captureInviteQrWithCamera, decodeInviteFromVideo } from '../../utils/inviteQr';

interface InviteQrScannerProps {
  onDetected: (code: string) => void;
  onClose: () => void;
}

export const InviteQrScanner: React.FC<InviteQrScannerProps> = ({ onDetected, onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const stoppedRef = useRef(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    stoppedRef.current = false;
    let frame = 0;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stoppedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setIsStarting(false);

        const tick = async () => {
          if (stoppedRef.current || !videoRef.current) return;
          const code = await decodeInviteFromVideo(videoRef.current);
          if (code) {
            stoppedRef.current = true;
            stopStream();
            onDetectedRef.current(code);
            return;
          }
          frame = window.requestAnimationFrame(() => {
            void tick();
          });
        };
        frame = window.requestAnimationFrame(() => {
          void tick();
        });
      } catch {
        setIsStarting(false);
        setError('Canlı kamera açılamadı. Fotoğraf çekerek deneyin.');
      }
    };

    void start();

    return () => {
      stoppedRef.current = true;
      window.cancelAnimationFrame(frame);
      stopStream();
    };
  }, []);

  const handlePhotoFallback = async () => {
    const code = await captureInviteQrWithCamera();
    if (code) {
      stoppedRef.current = true;
      stopStream();
      onDetected(code);
      return;
    }
    setError('QR kod okunamadı. Kodu elle yazabilir veya tekrar deneyebilirsiniz.');
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm p-4 space-y-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-black text-gray-900">QR kodu tara</h4>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4]">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
          {isStarting && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
          <div className="absolute inset-10 border-2 border-white/80 rounded-2xl pointer-events-none" />
        </div>
        {error && <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">{error}</p>}
        <button
          type="button"
          onClick={() => void handlePhotoFallback()}
          className="w-full py-2.5 bg-family-600 hover:bg-family-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Camera className="w-4 h-4" />
          <span>Fotoğrafla tara</span>
        </button>
      </div>
    </div>
  );
};
