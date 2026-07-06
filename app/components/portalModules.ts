import { contractorSiteName, isLogisticosContractor, isPuntoCoronaContractor, normalizeContractorName } from "../lib/contractors";

export type PortalModule = {
  id: number;
  title: string;
  href: string;
  detail: string;
  tone: string;
  accent: string;
};

const modules: PortalModule[] = [
  {
    id: 1,
    title: "Seguimiento",
    href: "/seguimiento",
    detail: "Rutas, avance y alertas",
    tone: "from-[#10223d] to-[#1264ff]",
    accent: "border-l-[#1264ff]",
  },
  {
    id: 2,
    title: "Modulacion",
    href: "/modulacion",
    detail: "Refusal y gestion comercial",
    tone: "from-[#0f7c58] to-[#00b8d9]",
    accent: "border-l-[#0f7c58]",
  },
  {
    id: 3,
    title: "Jornada laboral",
    href: "/jornada-laboral",
    detail: "Relevos y alertas SIF",
    tone: "from-[#f5bd19] to-[#ff7a1a]",
    accent: "border-l-[#f5bd19]",
  },
];

const peopleModule: PortalModule = {
  id: 4,
  title: "Personas",
  href: "/personas",
  detail: "Trabajadores, fotos e historial operativo",
  tone: "from-[#7c3aed] to-[#00b8d9]",
  accent: "border-l-[#7c3aed]",
};

const rangoModule: PortalModule = {
  id: 5,
  title: "Rango",
  href: "/punto-corona",
  detail: "Entrega en rango y modulacion",
  tone: "from-[#16a34a] to-[#0f766e]",
  accent: "border-l-[#16a34a]",
};

const peopleAttendanceModule: PortalModule = {
  id: 6,
  title: "Asistencia personas",
  href: "/asistencia-personas",
  detail: "Excel, llegadas y contratistas",
  tone: "from-[#0f7c58] to-[#f5bd19]",
  accent: "border-l-[#0f7c58]",
};

export function getVisiblePortalModules({
  contractor,
  isAdmin,
  isPeople,
}: {
  contractor?: string;
  isAdmin?: boolean;
  isPeople?: boolean;
}) {
  const canSeeJornada = Boolean(isAdmin || isLogisticosContractor(contractor));
  const routedModules = modules.map((module) => ({ ...module, href: getModuleHref(module.href, contractor) }));
  const baseModules = canSeeJornada ? routedModules : routedModules.filter((module) => module.href !== "/jornada-laboral");
  if (isPeople) return [peopleModule];
  if (isAdmin) return [{ ...baseModules[0], href: "/admin" }, peopleAttendanceModule, ...baseModules.slice(1)];
  return contractor ? [...baseModules, rangoModule] : baseModules;
}

function getModuleHref(href: string, contractor?: string) {
  if (href !== "/seguimiento" || !normalizeContractorName(contractor).endsWith("arenosa")) return href;
  if (isLogisticosContractor(contractor)) return "/seguimiento/arenosa/logisticos";
  if (isPuntoCoronaContractor(contractor)) return "/seguimiento/arenosa/corona";
  return href;
}

export function getPortalSessionLabel({ contractor, isAdmin, isPeople }: { contractor?: string; isAdmin?: boolean; isPeople?: boolean }) {
  if (isPeople) return "People Transporte";
  if (isAdmin) return "Administrador";
  if (!contractor) return "Operacion en tiempo real";
  return `${contractor} - ${contractorSiteName(contractor)}`;
}

export function getPortalHeroCopy(isPeople?: boolean) {
  return isPeople
    ? "Consulta trabajadores, fotos de reconocimiento e historial operativo por contratista y sede."
    : "Accede rapido a los modulos activos sin pantallas de bienvenida ni cruces entre contratistas.";
}
