"use client";

import type { CSSProperties, PointerEvent } from "react";
import { Activity, Boxes, CheckCircle2, Crown, MapPin, PackageCheck, Truck, Users } from "lucide-react";
import type { ResumenSeguimiento } from "../types";
import styles from "./corona.module.css";

export function CoronaHero({ resumen }: { resumen: ResumenSeguimiento }) {
  function moveLight(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const style = event.currentTarget.style;
    style.setProperty("--light-x", `${x * 100}%`);
    style.setProperty("--light-y", `${y * 100}%`);
    style.setProperty("--tilt-x", `${(0.5 - y) * 5}deg`);
    style.setProperty("--tilt-y", `${(x - 0.5) * 7}deg`);
    style.setProperty("--drift-x", `${(x - 0.5) * 12}px`);
    style.setProperty("--drift-y", `${(y - 0.5) * 8}px`);
  }
  function resetLight(event: PointerEvent<HTMLElement>) {
    ["--light-x", "--light-y", "--tilt-x", "--tilt-y", "--drift-x", "--drift-y"].forEach((key) => event.currentTarget.style.removeProperty(key));
  }
  const progress = Math.min(100, Math.max(0, Number(resumen.avance) || 0));
  const pending = Math.max(resumen.clientes - resumen.visitados, 0);
  const complete = resumen.clientes > 0 && pending === 0;
  const stats = [
    { label: "Rutas", value: resumen.vehiculos.toLocaleString("es-CO"), icon: Truck },
    { label: "Cajas", value: resumen.cajas.toLocaleString("es-CO"), icon: Boxes },
    { label: "HL", value: resumen.hl, icon: PackageCheck },
    { label: "Clientes", value: resumen.clientes.toLocaleString("es-CO"), icon: Users },
  ];
  return <section className={styles.hero} aria-label="Seguimiento Punto Corona" onPointerMove={moveLight} onPointerLeave={resetLight} onPointerCancel={resetLight}>
    <div className={styles.ambientLight} aria-hidden="true" />
    <div className={styles.architecture} aria-hidden="true"><i /><i /><i /></div>
    <div className={styles.floor} aria-hidden="true" />
    <div className={styles.heroLayout}>
      <div className={styles.intro}>
        <div className={styles.eyebrow}><Crown size={17} /> PUNTO CORONA <span /> CONTROL OPERATIVO</div>
        <h1>Seguimiento<br /><span>Punto Corona</span></h1>
        <p className={styles.description}>Toda tu operación, en perspectiva. Monitorea rutas, carga y visitas desde un solo lugar.</p>
        <div className={styles.stats}>{stats.map(({ label, value, icon: Icon }) => <article className={styles.stat} key={label}>
          <div><span>{label}</span><Icon size={18} /></div><strong>{value}</strong>
        </article>)}</div>
      </div>
      <div className={styles.instrument}>
        <div className={styles.instrumentHeader}><span><Activity size={16} /> Avance general</span><span className={styles.instrumentTag}>VISITAS</span></div>
        <p className={styles.instrumentSubtitle}>Cobertura de clientes</p>
        <div className={styles.orbit}>
          <div className={styles.outerRing} aria-hidden="true" />
          <div className={styles.ticks} aria-hidden="true" />
          <div className={styles.orbitLine} aria-hidden="true" />
          <div className={styles.dial} role="progressbar" aria-label="Porcentaje de clientes visitados" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} style={{ "--progress": `${progress * 3.6}deg` } as CSSProperties}>
            <div className={styles.dialFace}><strong>{progress}<small>%</small></strong><span>CLIENTES VISITADOS</span></div>
          </div>
          <div className={styles.pedestal} aria-hidden="true" />
          <div className={styles.projection} aria-hidden="true" />
        </div>
        <div className={styles.coverageState} data-complete={complete}>{complete ? <CheckCircle2 size={14} /> : <MapPin size={14} />}{complete ? "Todos los clientes visitados" : resumen.clientes ? "Visitas en seguimiento" : "Sin clientes registrados"}</div>
        <p className={styles.ratio}>{resumen.visitados.toLocaleString("es-CO")} <span>de {resumen.clientes.toLocaleString("es-CO")} clientes</span></p>
        <div className={styles.progressSummary}><div><span><MapPin size={12} /> Pendientes</span><strong>{pending.toLocaleString("es-CO")}</strong></div><div><span><CheckCircle2 size={12} /> Visitados</span><strong>{resumen.visitados.toLocaleString("es-CO")}</strong></div></div>
      </div>
    </div>
  </section>;
}
