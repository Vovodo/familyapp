import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { extractInviteCode } from './inviteCode';

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}

const getBarcodeDetector = (): BarcodeDetectorLike | null => {
  const Ctor = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike })
    .BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ['qr_code'] });
  } catch {
    return null;
  }
};

const decodeFromCanvas = (canvas: HTMLCanvasElement): string | null => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
  return extractInviteCode(result?.data || null);
};

export async function decodeInviteFromBlob(blob: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(blob);
  try {
    const detector = getBarcodeDetector();
    if (detector) {
      const codes = await detector.detect(bitmap);
      for (const code of codes) {
        const parsed = extractInviteCode(code.rawValue);
        if (parsed) return parsed;
      }
    }
  } catch {
    // jsQR fallback
  }

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  return decodeFromCanvas(canvas);
}

export async function decodeInviteFromVideo(video: HTMLVideoElement): Promise<string | null> {
  if (!video.videoWidth || !video.videoHeight) return null;

  try {
    const detector = getBarcodeDetector();
    if (detector) {
      const codes = await detector.detect(video);
      for (const code of codes) {
        const parsed = extractInviteCode(code.rawValue);
        if (parsed) return parsed;
      }
    }
  } catch {
    // jsQR fallback
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  return decodeFromCanvas(canvas);
}

export async function captureInviteQrWithCamera(): Promise<string | null> {
  try {
    const image = await CapCamera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
    });
    if (!image.webPath) return null;
    const blob = await fetch(image.webPath).then((r) => r.blob());
    return decodeInviteFromBlob(blob);
  } catch {
    return null;
  }
}

export async function inviteQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 280,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#7e22ce', light: '#ffffff' },
  });
}
