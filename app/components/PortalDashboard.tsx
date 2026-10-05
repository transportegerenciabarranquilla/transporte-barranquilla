"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./portal.module.css";
import { Truck, PackageCheck, Clock3, Users, Route, CalendarCheck, Timer, BriefcaseBusiness, Star, ChartColumn, ClipboardCheck, Phone, MapPinned, MessageSquareWarning, ReceiptText, BedDouble, LayoutGrid, Sun, Moon, type LucideIcon } from "lucide-react";
import { Icon } from "./Icon";
import { GlobalOperationsSearch } from "./GlobalOperationsSearch";
import { getPortalSessionLabel, getVisiblePortalModules, type PortalModule } from "./portalModules";
import { isLogisticosContractor } from "../lib/contractors";

const moduleIcons: Record<number, LucideIcon> = { 1: Truck, 2: PackageCheck, 3: Clock3, 4: Users, 5: Route, 6: CalendarCheck, 7: Timer, 8: BriefcaseBusiness, 9: Star, 10: ChartColumn, 11: Timer, 12: ClipboardCheck, 13: Phone, 14: MapPinned, 15: MessageSquareWarning, 16: ReceiptText, 17: MapPinned, 18: BedDouble, 19: ChartColumn, 22: MapPinned, 23: Users, 24: PackageCheck, 25: Route, 26: ClipboardCheck };

// Presentation groups only; every access comes from the existing authorized list.
const operationIds = [1, 2, 3, 12];
const operationLabels: Record<number, string> = { 1: "RUTAS", 2: "FLUJO", 3: "TIEMPO", 12: "VERIFICACIÓN" };

export function PortalDashboard({
  onLogout,
  isAdmin = false,
  isPeople = false,
  contractor = "",
}: {
  onLogout: () => void;
  isAdmin?: boolean;
  isPeople?: boolean;
  contractor?: string;
}) {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    const resetTheme = () => setDarkMode(false);
    window.addEventListener("pageshow", resetTheme);
    return () => window.removeEventListener("pageshow", resetTheme);
  }, []);
  const visibleModules = getVisiblePortalModules({ contractor, isAdmin, isPeople });
  const sessionLabel = getPortalSessionLabel({ contractor, isAdmin, isPeople });
  const reportsModule = visibleModules.find(module => [19, 10].includes(module.id));
  const personnelModule = visibleModules.find(module => [23, 4].includes(module.id));
  const resourcesModule = visibleModules.find(module => module.id === 2);
  const operationModules = operationIds.flatMap(id => visibleModules.filter(module => module.id === id));
  const supportingModules = visibleModules.filter(module => !operationIds.includes(module.id));
  const deliveryModules = [20, 5, 13, 15].flatMap(id => supportingModules.filter(module => module.id === id));
  const instrumentModules = [19, 10, 23].flatMap(id => supportingModules.filter(module => module.id === id));
  const utilityModules = supportingModules.filter(module => ![20, 5, 13, 15, 19, 10, 23].includes(module.id));
  const toolPosition = (module: PortalModule) => operationModules.length + [...deliveryModules, ...instrumentModules, ...utilityModules].indexOf(module) + 1;
  const mainModule = operationModules.find(module => module.id === 1);
  const consoleModules = operationModules.filter(module => module.id !== 1);

  function renderModule(module: PortalModule, position: number, variant: "dominant" | "console" | "delivery" | "analysis" | "team" | "utility") {
    return (
      <button
        className={[styles.module, styles[variant]].join(" ")}
        data-module-id={module.id}
        data-signal={module.id}
        aria-label={"Abrir " + module.title}
        key={module.id}
        onClick={() => {
          setDarkMode(false);
          // Load a new document to receive the camera or microphone policy.
          if (module.href === "/descanso-efectivo" || module.href === "/admin" || module.href.startsWith("/admin/")) window.location.assign(module.href);
          else router.push(module.href);
        }}
        type="button"
      >
        <span className={styles.moduleIndex} aria-hidden="true">{String(position).padStart(2, "0")}</span>
        <span className={styles.moduleGlyph}><ModuleIcon id={module.id} /></span>
        <span className={styles.moduleContent}>
          <span className={styles.moduleTitle}>{module.title}</span>
          <span className={styles.moduleDescription}>{module.detail}</span>
        </span>
        {variant === "dominant" ? (
          <>
            <span className={styles.mapBackdrop} aria-hidden="true"><OperationMap /></span>
            <span className={styles.mapCaption}>RECORRIDO ESQUEMÁTICO</span>
            <span className={styles.routeDiagram} aria-hidden="true">
              <svg viewBox="0 0 640 320" fill="none">
                <path className={styles.routeGuide} d="M230 269L279 244Q298 234 298 208Q298 182 331 181L366 159Q388 136 414 150L451 162L482 133L542 111" />
                <path className={styles.routeTrace} d="M230 269L279 244Q298 234 298 208Q298 182 331 181L366 159Q388 136 414 150L451 162L482 133L542 111" />
                <circle cx="230" cy="269" r="5" /><circle cx="331" cy="181" r="5" /><circle cx="451" cy="162" r="5" /><circle cx="542" cy="111" r="5" />
                <circle className={styles.routeTraveller} cx="366" cy="159" r="4" />
                <circle className={styles.mapHalo} cx="331" cy="158" r="15" />
                <path d="M323 156H334V164H323ZM334 159H338L340 163V164H334M326 167H327M336 167H337" stroke="#c5e3ff" strokeWidth="2" />
              </svg>
            </span>
            <span className={styles.mainAction}>Abrir operación <Icon name="arrow" /></span>
            <span className={styles.moduleCode} aria-hidden="true">ACCESO PRINCIPAL / 01</span>
          </>
        ) : variant === "console" ? <span className={styles.functionalSignal}><FunctionalSignal id={module.id} /></span> : variant === "analysis" ? <span className={styles.analysisSignal}><FunctionalSignal id={19} /></span> : variant === "delivery" ? <span className={styles.deliverySignal}><FunctionalSignal id={module.id} /></span> : variant === "team" ? <span className={styles.teamSignal} aria-hidden="true"><Users size={24} /><Users size={20} /><Users size={16} /></span> : null}
        {variant !== "dominant" && <span className={styles.moduleArrow} aria-hidden="true"><Icon name="arrow" /></span>}
        {variant === "console" && <span className={styles.consoleLabel} aria-hidden="true">{operationLabels[module.id]}</span>}
      </button>
    );
  }

  return (
    <main className={styles.portal} data-theme={darkMode ? "dark" : "light"} onClickCapture={event => {
      if ((event.target as Element).closest('a[href^="/"]')) setDarkMode(false);
    }}>
      <aside className={styles.rail} aria-label="Navegación del portal">
        <a className={styles.railMenu} href="#portal-operation" aria-label="Ir al inicio"><LayoutGrid size={17} /></a>
        <nav>
          <a className={styles.railActive} href="#portal-operation"><Icon name="building" /><span>Operación</span></a>
          {reportsModule && <a href={reportsModule.href}><ChartColumn size={19} /><span>Reportes</span></a>}
          {personnelModule && <a href={personnelModule.href}><Users size={19} /><span>Personas</span></a>}
          {resourcesModule && <a href={resourcesModule.href}><Truck size={19} /><span>modulaciones</span></a>}
        </nav>
        <span className={styles.railMap} aria-hidden="true"><OperationMap /></span>
      </aside>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-cyan-200 ring-1 ring-white/15">
              <Icon name="building" />
            </div>
            <div>
              <p className="text-base font-semibold uppercase tracking-[0.16em] text-white">Torre Control</p>
              <p className="text-sm text-slate-300">{sessionLabel}</p>
            </div>
          </div>
          <div className={styles.headerSearch}>
            {contractor !== "Control de ingreso" && isAdmin ? <GlobalOperationsSearch isAdmin={isAdmin} /> : <a href="#portal-tools-title"><span aria-hidden="true">⌕</span> Explorar módulos de operación <LayoutGrid size={13} /></a>}
          </div>
          <div className={styles.sessionIdentity}><span className={styles.sessionDot} />Sesión activa<span className={styles.sessionAvatar}>{sessionLabel.slice(0, 2).toUpperCase()}</span><span className={styles.sessionName}>{sessionLabel}</span></div>
          <button
            className={styles.themeToggle}
            aria-label={darkMode ? "Activar modo claro" : "Activar modo oscuro"}
            aria-pressed={darkMode}
            title={darkMode ? "Activar modo claro" : "Activar modo oscuro"}
            onClick={() => setDarkMode(current => !current)}
            type="button"
          >
            {darkMode ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
          <button
            aria-label="Cerrar sesion"
            className="grid h-10 w-10 place-items-center shrink-0 rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-300"
            onClick={onLogout}
            type="button"
          >
            <Icon name="logout" />
          </button>
        </div>
      </header>
      <section className={styles.workspace} id="portal-operation">
        <div className={styles.workspaceHeader}>
          <div><p className={styles.eyebrow}>CENTRO DE OPERACIONES</p><h1>Operación</h1></div>
          <span className={styles.headerMap} aria-hidden="true"><OperationMap /><span className={styles.mapCrosshair} /></span>
          <span className={styles.accessCount}><b>{String(visibleModules.length).padStart(2, "0")}</b> módulos disponibles</span>
        </div>


        {operationModules.length > 0 && (
          <section aria-label="Módulos principales" className={styles.operationDeck} data-solo={consoleModules.length === 0}>
            {mainModule && renderModule(mainModule, 1, "dominant")}
            {consoleModules.length > 0 && <div className={styles.console}>
              {consoleModules.map(module => renderModule(module, operationIds.indexOf(module.id) + 1, "console"))}
            </div>}
          </section>
        )}

        {supportingModules.length > 0 && <section className={styles.tools} aria-labelledby="portal-tools-title">
          <div className={styles.toolsHeading}><h2 id="portal-tools-title">{operationModules.length ? "Herramientas de operación" : "Módulos disponibles"}</h2><span>{String(supportingModules.length).padStart(2, "0")} ACCESOS</span></div>
          <div className={styles.connectionBoard} data-delivery={deliveryModules.length > 0} data-instruments={instrumentModules.length > 0}>
            {deliveryModules.length > 0 && <div className={styles.deliveryZone}>
              <span className={styles.zoneLabel}>CONTINUIDAD DE ENTREGA</span>
              <svg className={styles.connectionLines} viewBox="0 0 600 194" fill="none" preserveAspectRatio="none" aria-hidden="true"><path d="M20 52H264Q284 52 284 72V94H580M20 149H320Q340 149 340 130V114H580" /><circle cx="284" cy="94" r="3" /><circle cx="340" cy="114" r="3" /></svg>
              <div className={styles.deliveryAccesses}>
                {deliveryModules.map(module => renderModule(module, toolPosition(module), "delivery"))}
              </div>
            </div>}
            {instrumentModules.length > 0 && <div className={styles.instrumentZone}>
              {instrumentModules.map(module => renderModule(module, toolPosition(module), module.id === 23 ? "team" : "analysis"))}
            </div>}
            {utilityModules.length > 0 && <div className={styles.utilityZone}>
              {utilityModules.map(module => renderModule(module, toolPosition(module), "utility"))}
            </div>}
          </div>
        </section>}
        <p className={[styles.brandSignature, isLogisticosContractor(contractor) ? styles.logisticosSignature : ""].join(" ")}>{isLogisticosContractor(contractor) ? "LO ENTREGAMOS TODO" : "LOGÍSTICA QUE MUEVE MÁS"}</p>
      </section>
      <svg className={styles.depotTexture} viewBox="0 0 520 170" fill="none" aria-hidden="true" focusable="false">
        <path d="M0 115L190 32L420 140L350 170H0Z" fill="#ccd8e5" />
        <path d="M30 89L141 37L277 99L167 152ZM188 39L252 10L392 75L329 105Z" fill="#e2eaf2" stroke="#91a7bf" />
        <path d="M30 89V128L167 190V152ZM167 152L277 99V137L167 190ZM188 39V70L329 136V105ZM329 105L392 75V106L329 136Z" fill="#afc0d2" stroke="#91a7bf" />
        <path d="M58 92L148 52M82 104L172 64M106 116L196 76M130 128L220 88M216 40L278 68M240 30L301 59M261 20L323 48" stroke="#b7c7d7" />
      </svg>
    </main>
  );
}

function ModuleIcon({ id }: { id: number }) {
  const Glyph = moduleIcons[id] || LayoutGrid;
  return <Glyph size={22} strokeWidth={1.8} aria-hidden="true" />;
}

// Schematic texture, deliberately independent of real vehicle positions.
function OperationMap() {
  return <svg viewBox="0 0 640 320" fill="none" preserveAspectRatio="xMidYMid slice" focusable="false">
    <g stroke="currentColor" strokeWidth=".7">
      <path d="M180 0L257 58L226 118L290 159L255 222L287 320M278 0L298 72L360 112L333 201L382 252L351 320M400 0L377 65L442 105L417 188L474 232L457 320M524 0L495 61L548 140L515 227L569 320M603 0L568 57L612 155L575 231L630 290" />
      <path d="M124 49L227 67L289 35L380 58L462 24L640 53M156 104L238 98L306 123L397 91L479 117L571 88L640 114M146 165L258 145L340 173L433 148L514 171L640 142M107 231L209 198L299 229L392 204L466 241L568 207L640 230M132 295L258 272L322 291L414 265L508 289L640 263" />
      <path d="M218 18L207 41L248 65M278 82L258 107L282 136M305 28L336 55L323 84M353 105L384 122L367 153M427 44L448 65L422 84M478 152L489 195L458 216M327 230L349 248L331 275M535 26L554 44L531 65M559 168L588 180L573 201M521 248L541 271L516 304M204 249L225 274L203 309" />
    </g>
    <path d="M533 -10Q472 69 564 103Q608 125 580 175Q552 226 653 315" stroke="currentColor" strokeWidth="10" opacity=".25" />
    <g className={styles.mapBlocks}>
      <path d="M297 76L315 86L306 108L288 98ZM385 129L402 137L394 163L376 153ZM475 69L491 78L479 99L461 91ZM536 219L555 232L546 251L528 240ZM288 254L305 264L296 282L279 274Z" />
    </g>
  </svg>;
}

// Small navigation symbols; they do not represent measured data or completed tasks.
function FunctionalSignal({ id }: { id: number }) {
  return <svg viewBox="0 0 100 40" fill="none" aria-hidden="true" focusable="false">
    {id === 2 ? <>
      <g className={styles.warehouse}>
        <path d="M29 28V9L66 2L85 10V29ZM29 9L49 16L85 10M49 16V29M58 29V18H76V29" />
        <path d="M5 29V17H19V29ZM10 17V29M5 23H19M19 29V21H32V29ZM82 29V18H96V29ZM89 18V29M82 24H96" />
      </g>
      <path className={styles.signalGuide} d="M8 25H43L61 10H92M43 25H92" />
      <g className={styles.cargoMove}><path d="M27 18L34 14L41 18V27L34 31L27 27ZM27 18L34 22L41 18M34 22V31" /></g>
      <path className={styles.signalGuide} d="M84 6H93V15M84 21H93V30" />
    </> : id === 3 ? <>
      <path className={styles.shiftBand} d="M8 23H72V29H8Z" />
      <path className={styles.signalGuide} d="M8 26H92M15 22V30M38 22V30M61 22V30M85 22V30" />
      <path d="M15 13H48M55 13H85" />
      <path className={styles.shiftMarker} d="M48 5V34M44 5H52" />
    </> : id === 12 ? <>
      <path className={styles.signalGuide} d="M12 8H21V17H12ZM12 25H21V34H12ZM33 12H89M33 29H75" />
      <path className={styles.checkStroke} d="M12 12L16 16L24 6" />
    </> : id === 19 ? <>
      <g className={styles.analysisContours}>
        <path d="M3 35Q19 34 29 28T49 24T68 13T96 7M3 39Q19 36 33 33T54 28T73 21T96 16M3 31Q21 31 30 22T49 18T68 6T96 3" />
      </g>
      <path className={styles.signalGuide} d="M8 9H92M8 20H92M8 31H92M18 6V12M38 17V23M68 28V34" />
      <path className={styles.scanMarker} d="M52 5V35" /><circle cx="52" cy="9" r="2" /><circle cx="52" cy="31" r="2" />
    </> : id === 20 ? <>
      <path className={styles.signalGuide} d="M15 27H63Q85 27 85 15Q85 5 67 5H45M50 1L45 5L50 9" />
      <path className={styles.continuityTrace} d="M15 27H63" />
    </> : id === 5 ? <>
      <path className={styles.signalGuide} d="M8 21H92M72 11L82 21L72 31L62 21Z" /><circle className={styles.destinationNode} cx="82" cy="21" r="3" />
    </> : id === 13 ? <>
      <path className={styles.signalGuide} d="M8 20H39V10H73M39 20V30H92" /><circle cx="8" cy="20" r="3" /><path className={styles.communicationTrace} d="M43 10H65" />
    </> : <>
      <path className={styles.signalGuide} d="M8 20H39M60 20H92" /><path className={styles.incidentMarker} d="M45 10V30M54 10V30" />
    </>}
  </svg>;
}
