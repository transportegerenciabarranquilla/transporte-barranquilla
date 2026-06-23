export type FormState = {
  contratista: string;
  dt: string;
  codigoCliente: string;
  nombreCliente: string;
  telefonoCliente: string;
  com: string;
  jefeComercial: string;
  telefonoJefeComercial: string;
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
