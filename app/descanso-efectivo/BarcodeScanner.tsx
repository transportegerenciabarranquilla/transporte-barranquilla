"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

export function BarcodeScanner({ onScan, onStart, disabled }: { onScan: (value: string) => Promise<void>; onStart: () => void; disabled: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const callback = useRef(onScan);
  useEffect(() => { callback.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let consumed = false;
    let controls: IScannerControls | undefined;
    const preview = video.current;
    const stop = () => {
      controls?.stop();
      if (preview?.srcObject instanceof MediaStream) preview.srcObject.getTracks().forEach((track) => track.stop());
    };
    const start = async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Abre la aplicación por HTTPS para usar la cámara.");
        const reader = new BrowserMultiFormatReader(new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]]]));
        controls = await reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } }, preview!, (result, _error, scanner) => {
          if (cancelled || consumed || !result) return;
          const value = result.getText().trim();
          if (!/^\d{1,15}$/.test(value)) { setError("Este código no contiene una cédula válida."); return; }
          consumed = true;
          scanner.stop();
          setActive(false);
          void callback.current(value);
        });
        if (cancelled || consumed) stop();
      } catch (caught) {
        stop();
        if (!cancelled) {
          setActive(false);
          setError(caught instanceof Error && caught.name === "NotAllowedError" ? "Permite el acceso a la cámara en el navegador e intenta de nuevo." : "No se pudo abrir la cámara. Comprueba el permiso, usa HTTPS y cierra otras aplicaciones que la estén usando.");
        }
      }
    };
    void start();
    return () => { cancelled = true; stop(); };
  }, [active]);

  return <div className="mt-5">
    <button type="button" disabled={disabled} className="min-h-12 w-full rounded-xl bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-50" onClick={() => { onStart(); setError(""); setActive(!active); }}>{active ? "Cerrar cámara" : "Escanear código de barras"}</button>
    {active && <div className="mt-3 overflow-hidden rounded-xl bg-slate-950"><video ref={video} muted playsInline className="aspect-video w-full object-cover" /><p className="p-3 text-center text-sm text-white">Acerca el código completo y espera a que enfoque.</p></div>}
    {error && <p role="alert" className="mt-3 text-sm text-amber-800">{error}</p>}
    <p className="mt-3 text-xs text-slate-500">También puedes usar un lector en el campo de cédula, configurado para enviar Enter.</p>
  </div>;
}
