export type AdminRefusalComRow = {
  causal: string;
  contractor: string;
  codigoCliente: string;
  com: string;
  date: string;
  dt: string;
  jefeVentas: string;
  nombreCliente: string;
  preventista: string;
  reportadas: number;
  gestionadas: number;
  refusalFinal: number;
};

export type RefusalComSummary = {
  contractor: string;
  label: string;
  preventista: string;
  reportadas: number;
  gestionadas: number;
  refusalFinal: number;
  registros: number;
  refusal: number;
};

export type RefusalCausePreventistaSummary = {
  causal: string;
  contractor: string;
  gestionadas: number;
  pendientes: number;
  registros: number;
  reportadas: number;
};

export type RefusalClientSummary = {
  causal: string;
  codigoCliente: string;
  contractor: string;
  date: string;
  gestionadas: number;
  nombreCliente: string;
  pendientes: number;
  registros: number;
  reportadas: number;
};

export type GraphDateRange = {
  from: string;
  to: string;
};

export type ModulationRefusalRecord = {
  contratista?: string;
  dt: string;
  fechaDespacho?: string;
  fechaDt?: string;
  createdAt: string;
  codigoCliente: string;
  nombreCliente?: string;
  com?: string;
  persona?: string;
  personaNombre?: string;
  preventista?: string;
  preventistaNombre?: string;
  totalCajas: string;
  cajasGestionadas?: string;
};

export type RrRefusalSummary = {
  contractor: string;
  rr: string;
  rechazadas: number;
  pendientes: number;
  registros: number;
  clientes: Array<{
    codigo: string;
    nombre: string;
    rechazadas: number;
    veces: number;
    fechas: string[];
  }>;
};

export type ContractorRefusalTrend = {
  contractor: string;
  points: Array<{ date: string; percentage: number; pending: number; dispatched: number }>;
};

export type LateComment = {
  causal: string;
  comentario: string;
  contractor: string;
  date: string;
  dt: string | number;
  placa: string;
};
