import { useRef, useState, useCallback, useEffect } from 'react';
import { Link2, Upload, Camera, CameraOff, X, Loader2, ImageIcon } from 'lucide-react';

type Props = {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  aspect?: string;
  placeholder?: string;
};

export default function ImagePicker({ value, onChange, label = 'Image', aspect = 'aspect-[4/3]', placeholder = 'https://example.com/image.jpg' }: Props) {
  const [mode, setMode] = useState<'none' | 'url' | 'upload' | 'camera'>('none');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setCameraError('Could not access camera.');
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    onChange(dataUrl);
    stopCamera();
    setMode('none');
  }, [onChange, stopCamera]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setCameraError('Please select an image file.'); return; }
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      onChange(reader.result as string);
      setBusy(false);
      setMode('none');
    };
    reader.onerror = () => { setBusy(false); setCameraError('Failed to read file.'); };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2">
      <label className="label">{label}</label>

      {/* Preview */}
      {value && (
        <div className={`relative ${aspect} rounded-lg overflow-hidden border border-ink-800 max-w-xs`}>
          <img src={value} alt="Preview" className="h-full w-full object-cover" />
          <button
            onClick={() => onChange('')}
            className="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-md bg-black/60 text-white hover:bg-black/80"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Mode tabs */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => { setMode(mode === 'url' ? 'none' : 'url'); stopCamera(); }}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${mode === 'url' ? 'border-accent bg-accent/10 text-accent' : 'border-ink-700 bg-ink-850 text-ink-300 hover:bg-ink-800'}`}
        >
          <Link2 size={13} /> URL
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === 'upload' ? 'none' : 'upload'); stopCamera(); if (mode !== 'upload') fileRef.current?.click(); }}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${mode === 'upload' ? 'border-accent bg-accent/10 text-accent' : 'border-ink-700 bg-ink-850 text-ink-300 hover:bg-ink-800'}`}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === 'camera' ? 'none' : 'camera'); if (mode !== 'camera') startCamera(); else stopCamera(); }}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${mode === 'camera' ? 'border-accent bg-accent/10 text-accent' : 'border-ink-700 bg-ink-850 text-ink-300 hover:bg-ink-800'}`}
        >
          {cameraOn ? <CameraOff size={13} /> : <Camera size={13} />} Camera
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {/* URL input */}
      {mode === 'url' && (
        <div className="relative">
          <ImageIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-9"
            placeholder={placeholder}
            value={value.startsWith('data:') ? '' : value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}

      {/* Camera view */}
      {mode === 'camera' && (
        <div className="space-y-2">
          <div className={`relative ${aspect} rounded-lg overflow-hidden border border-ink-800 bg-ink-950 max-w-xs`}>
            <video ref={videoRef} className={`w-full h-full object-cover ${cameraOn ? 'block' : 'hidden'}`} playsInline />
            {!cameraOn && (
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <Camera size={28} className="mx-auto text-ink-600" />
                  <p className="mt-1.5 text-xs text-ink-400">{cameraError || 'Starting camera…'}</p>
                </div>
              </div>
            )}
            {cameraOn && (
              <button
                onClick={capturePhoto}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 grid h-11 w-11 place-items-center rounded-full bg-white text-ink-900 shadow-lg hover:scale-110 transition-transform"
              >
                <Camera size={20} />
              </button>
            )}
          </div>
          {cameraError && <p className="text-xs text-danger">{cameraError}</p>}
        </div>
      )}
    </div>
  );
}
