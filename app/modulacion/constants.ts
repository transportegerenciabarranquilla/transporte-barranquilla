import type { FormState } from "./types";

export const causales = [
  "No tiene dinero",
  "Cerrado",
  "No hizo pedido",
  "No cumple acuerdo cashless",
  "No busca su pedido (Multiparada)",
  "No existe o no encontrado",
  "Sin envase (No tiene mas envase)",
  "Triangulacion",
  "Esperaba descuento",
  "Pedido doble",
  "Averias",
  "OC Cerrada",
  "No recibe por PFN",
];

export const initialForm: FormState = {
  dt: "",
  codigoCliente: "",
  nombreCliente: "",
  totalCajas: "",
  cajasGestionadas: "",
  persona: "",
  causal: "",
  comentario: "",
  imagenNombre: "",
  imagenVista: "",
};
