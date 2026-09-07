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
        if (!window.isSecureContext) { setError("La cámara necesita una dirección HTTPS. Abre la dirección segura de la aplicación y vuelve a intentar."); setActive(false); return; }
        const policy = (document as Document & { featurePolicy?: { allowsFeature: (feature: string) => boolean } }).featurePolicy;
        if (policy && !policy.allowsFeature("camera")) { setError("La configuración del sitio está bloqueando la cámara. Recarga la página después de actualizar la aplicación; cambiar los permisos de la tablet no resuelve este bloqueo."); setActive(false); return; }
        if (!navigator.mediaDevices?.getUserMedia) { setError("Este navegador no permite abrir la cámara. Abre la aplicación directamente en Chrome actualizado."); setActive(false); return; }
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
          const name = caught instanceof Error ? caught.name : "";
          setError(name === "NotAllowedError"
            ? "El navegador denegó la cámara. En Chrome, abre los permisos de este sitio y permite Cámara. Revisa también Ajustes de Android > Aplicaciones > Chrome > Permisos > Cámara y vuelve a cargar la página."
            : name === "NotReadableError"
              ? "La cámara está ocupada o Android no permite abrirla. Cierra otras aplicaciones que usen la cámara y comprueba que el acceso general a la cámara esté activado."
              : name === "NotFoundError"
                ? "No se encontró una cámara disponible en este dispositivo."
                : "No se pudo abrir la cámara. Cierra otras aplicaciones que la estén usando e intenta de nuevo.");
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
