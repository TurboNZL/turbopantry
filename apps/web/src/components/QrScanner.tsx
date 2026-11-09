import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: new (o?: { formats: string[] }) => Detector } }

/**
 * Looks through the camera for a QR code and reports its text once. Uses the browser's own detector where there is one and jsQR everywhere else.
 * The camera stops as soon as a code is read or the component goes away. Needs a secure page (https or localhost) and the camera permission.
 */
export function QrScanner({ onResult, onCancel }: { onResult(text: string): void; onCancel(): void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(onResult); done.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null, stopped = false, raf = 0;
    const canvas = document.createElement('canvas');
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setError('This browser cannot use the camera here (it needs https). Paste the code instead.'); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
      catch { setError('The camera is not available or was not allowed. Paste the code instead.'); return; }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      const v = video.current!; v.srcObject = stream; await v.play().catch(() => undefined);
      const det = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
      const tick = async () => {
        if (stopped) return;
        if (v.readyState >= 2 && v.videoWidth) {
          let text: string | null = null;
          try {
            if (det) text = (await det.detect(v))[0]?.rawValue ?? null;
            else {
              const w = Math.min(640, v.videoWidth), h = Math.round((v.videoHeight / v.videoWidth) * w);
              canvas.width = w; canvas.height = h;
              const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(v, 0, 0, w, h);
              text = jsQR(ctx.getImageData(0, 0, w, h).data, w, h)?.data ?? null;
            }
          } catch { /* a bad frame: try the next one */ }
          if (text) { stopped = true; stream?.getTracks().forEach((t) => t.stop()); done.current(text); return; }
        }
        raf = window.setTimeout(() => void tick(), 120);
      };
      void tick();
    })();
    return () => { stopped = true; window.clearTimeout(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  return (
    <div className="space-y-2">
      {error ? <p className="rounded-theme bg-raised p-3 text-sm" role="alert">{error}</p> : (
        <div className="relative overflow-hidden rounded-theme border border-line bg-black">
          <video ref={video} className="aspect-square w-full object-cover" muted playsInline aria-label="Camera" />
          <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-white/80" aria-hidden />
        </div>)}
      <p className="text-xs text-muted">{error ? '' : 'Point the camera at the QR code on the other device.'}</p>
      <button className="btn h-11 w-full" onClick={onCancel}>Cancel</button>
    </div>
  );
}
