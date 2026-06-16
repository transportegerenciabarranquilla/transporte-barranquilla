export type FormState = {
  dt: string;
  codigoCliente: string;
  nombreCliente: string;
  totalCajas: string;
  cajasReubicadas: string;
  persona: string;
  causal: string;
  comentario: string;
  imagenNombre: string;
  imagenVista: string;
};

export type FormErrors = Partial<Record<keyof FormState, string>>;
