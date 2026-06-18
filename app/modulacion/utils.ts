import { ASISTENCIA_STORAGE_KEY, type AsistenciaRegistro } from "../lib/asistenciaStorage";
import { getLocalDateKey, type ModulacionRegistro } from "../lib/modulacionStorage";
import { readSeguimientoVehiculos } from "../lib/seguimientoStorage";
import { initialVehicles } from "../seguimiento/data";
import type { Vehiculo } from "../seguimiento/types";
import type { FormErrors, FormState } from "./types";

export function onlyNumbers(value: string) {
  return value.replace(/\D/g, "");
}

export function validateModulacion(form: FormState) {
  const errors: FormErrors = {};

  if (!form.dt) errors.dt = "Ingresa el DT.";
  if (!form.codigoCliente) errors.codigoCliente = "Ingresa el codigo de cliente.";
  if (!form.totalCajas) errors.totalCajas = "Ingresa las cajas rechazadas.";
  if (!form.persona.trim()) errors.persona = "Ingresa la persona que modula.";
  if (!form.causal) errors.causal = "Selecciona la causal.";
  if (!form.comentario.trim()) errors.comentario = "Ingresa el comentario.";

  return errors;
}

export function getUniquePersonas(registros: ModulacionRegistro[]) {
  const unique = new Map<string, ModulacionRegistro>();

  registros.forEach((registro) => {
    const persona = registro.persona?.trim();
    if (!persona) return;

    const key = persona.toLowerCase();
    if (!unique.has(key)) unique.set(key, registro);
  });

  return Array.from(unique.values());
}

export function getVehiculosSeguimiento() {
  if (typeof window === "undefined") return initialVehicles;

  const seguimientoGuardado = readSeguimientoVehiculos();
  if (seguimientoGuardado.length) return filterTodayVehicles(seguimientoGuardado);

  const current = localStorage.getItem(ASISTENCIA_STORAGE_KEY);
  if (!current) return filterTodayVehicles(initialVehicles);

  try {
    const registros = JSON.parse(current) as AsistenciaRegistro[];
    const puntoCorona = registros.filter((registro) => registro.contratista === "Punto Corona");

    return filterTodayVehicles([...initialVehicles, ...puntoCorona.map(mapAttendanceToVehicle)]);
  } catch {
    return filterTodayVehicles(initialVehicles);
  }
}

function filterTodayVehicles(vehiculos: Vehiculo[]) {
  const today = getLocalDateKey();
  return vehiculos.filter((vehiculo) => (vehiculo.fechaDespacho || vehiculo.fechaDt) === today);
}

function mapAttendanceToVehicle(registro: AsistenciaRegistro): Vehiculo {
  const createdAt = new Date(registro.createdAt);
  const fecha = getLocalDateKey(createdAt);

  return {
    mes: createdAt.toLocaleDateString("es-CO", { month: "long" }),
    cd: "Punto Corona",
    transportista: registro.contratista,
    llave: registro.llave,
    transporte: registro.dt,
    centro: "Punto Corona",
    codTransportista: "-",
    fechaDt: fecha,
    fechaDespacho: fecha,
    vehiculo: `DT-${registro.dt}`,
    responsable: `RR ${registro.cedulaResponsable}`,
    territorio: "Pendiente",
    viaje: "Pendiente",
    bloque: "Pendiente",
    cajas: 0,
    hl: 0,
    clientes: 1,
    visitados: 0,
    horaSalida: "Pendiente",
    peso: 0,
    capacidad: 1,
    validadorPeso: "Pendiente",
    avanceRuta: "0%",
    status: "Cargando",
    horaLlegada: "Pendiente",
    tiempoRuta: "Pendiente",
    metaRelevo: "Pendiente",
    horaInicioRelevo: "Pendiente",
    clasificacionRelevo: "Pendiente",
    alertaSifPotencial: "Pendiente",
    relevador: "-",
    causalDesviado: "-",
    clasificacionOnTime: "Pendiente",
    recargue: "Pendiente",
    cedulaResponsable: registro.cedulaResponsable,
    cedulaAuxiliar1: registro.cedulaAuxiliar1,
    cedulaAuxiliar2: registro.cedulaAuxiliar2,
  };
}
