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

export type LateComment = {
  causal: string;
  comentario: string;
  contractor: string;
  date: string;
  dt: string | number;
  placa: string;
};
