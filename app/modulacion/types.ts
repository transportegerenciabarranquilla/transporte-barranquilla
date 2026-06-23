export type FormState = {
  contratista: string;
  dt: string;
  codigoCliente: string;
  nombreCliente: string;
  com: string;
  jefeComercial: string;
  preventista: string;
  totalCajas: string;
  cajasGestionadas: string;
  persona: string;
  personaNombre: string;
  causal: string;
  comentario: string;
  imagenNombre: string;
  imagenVista: string;
};

export type FormErrors = Partial<Record<keyof FormState, string>>;
