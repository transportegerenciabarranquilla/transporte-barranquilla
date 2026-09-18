"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail, MapPinned, Plus, ShieldCheck, X } from "lucide-react";
import { Icon } from "./Icon";

type LoginForm = {
  email: string;
  password: string;
  remember: boolean;
};

type LoginErrors = Partial<Record<"email" | "password", string>>;

type NewCoordinateForm = {
  customerCode: string;
  route: string;
  type: string;
  latitude: string;
  longitude: string;
};

const initialForm: LoginForm = {
  email: "",
  password: "",
  remember: true,
};

const initialCoordinateForm: NewCoordinateForm = {
  customerCode: "",
  route: "",
  type: "",
  latitude: "",
  longitude: "",
};

function validate(form: LoginForm) {
  const errors: LoginErrors = {};

  if (!form.email.trim()) {
    errors.email = "Ingresa tu correo corporativo.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = "El correo no tiene un formato valido.";
  }

  if (!form.password.trim()) errors.password = "Ingresa tu contrasena.";

  return errors;
}

export function LoginScreen({ onLogin, sessionError = "" }: { onLogin: (form: LoginForm) => Promise<void>; sessionError?: string }) {
  const [form, setForm] = useState<LoginForm>(initialForm);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isCoordinateModalOpen, setIsCoordinateModalOpen] = useState(false);
  const [coordinateForm, setCoordinateForm] = useState<NewCoordinateForm>(initialCoordinateForm);
  const [coordinateSaving, setCoordinateSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [coordinateMessage, setCoordinateMessage] = useState("");
  const [coordinateCustomer, setCoordinateCustomer] = useState<{ codigo: string; nombre: string; cedula: string; telefono: string } | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const [rrValidation, setRrValidation] = useState<{ cc: string; valid: boolean; name: string; message: string } | null>(null);

  useEffect(() => {
    const cc = coordinateForm.type.trim();
    if (!isCoordinateModalOpen || !cc) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/personas?cc=${encodeURIComponent(cc)}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error("No se pudo validar el RR. Vuelve a ingresar la cédula.");
        if (controller.signal.aborted) return;
        const valid = body.isRR === true;
        setRrValidation({ cc, valid, name: body.persona?.NOMBRE || "", message: valid ? "RR validado" : "La cédula no pertenece a un RR registrado. No puedes guardar coordenadas." });
      } catch (error) {
        if (!controller.signal.aborted) setRrValidation({ cc, valid: false, name: "", message: error instanceof Error ? error.message : "No se pudo validar el RR." });
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [coordinateForm.type, isCoordinateModalOpen]);
  const rrIsValid = Boolean(rrValidation?.valid && rrValidation.cc === coordinateForm.type.trim());

  useEffect(() => {
    const codigo = coordinateForm.customerCode.trim();
    if (!isCoordinateModalOpen || !codigo) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCustomerLoading(true);
      setCustomerError("");
      try {
        const response = await fetch(`/api/clientes?codigo=${encodeURIComponent(codigo)}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No se pudo consultar el cliente.");
        if (!body.cliente) throw new Error("No encontramos un cliente con ese código.");
        if (controller.signal.aborted) return;
        const cliente = body.cliente;
        setCoordinateCustomer({ codigo, nombre: cliente.nombre || "", cedula: cliente.cedula || "", telefono: cliente.telefono || "" });
        setRrValidation(null);
        setCoordinateForm((current) => current.customerCode === codigo ? { ...current, route: cliente.nombre || codigo, type: String(cliente.cedulaResponsable || "").replace(/\D/g, "") } : current);
      } catch (error) {
        if (!controller.signal.aborted) setCustomerError(error instanceof Error ? error.message : "No se pudo consultar el cliente.");
      } finally {
        if (!controller.signal.aborted) setCustomerLoading(false);
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [coordinateForm.customerCode, isCoordinateModalOpen]);

  const canSubmit = useMemo(() => form.email.trim() && form.password.trim(), [form]);

  function updateField<Key extends keyof LoginForm>(key: Key, value: LoginForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length === 0) {
      setSubmitting(true);
      setLoginError("");
      try {
        await onLogin(form);
      } catch (error) {
        setLoginError(error instanceof Error ? error.message : "No se pudo iniciar sesion.");
      } finally {
        setSubmitting(false);
      }
    }
  }

  async function handleCoordinateGeoLocation() {
    if (locating || coordinateSaving) return;
    setCoordinateMessage("");
    if (!navigator.geolocation) {
      setCoordinateMessage("Este navegador no permite obtener la ubicación.");
      return;
    }

    setLocating(true);
    setCoordinateForm((current) => ({ ...current, latitude: "", longitude: "" }));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinateForm((current) => ({
          ...current,
          latitude: String(coords.latitude),
          longitude: String(coords.longitude),
        }));
        setLocating(false);
        setCoordinateMessage("Ubicación capturada. Pulsa Guardar coordenada para registrarla.");
      },
      () => {
        setLocating(false);
        setCoordinateMessage("No se pudo capturar la ubicación. Permite el acceso a tu ubicación y vuelve a intentarlo.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function handleCoordinateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (coordinateSaving || locating) return;
    setCoordinateMessage("");
    if (!rrIsValid) {
      setCoordinateMessage("Debes ingresar la cédula de un RR registrado y esperar su validación.");
      return;
    }

    const route = coordinateForm.route.trim();
    const type = coordinateForm.type.trim();
    const latitude = Number(coordinateForm.latitude);
    const longitude = Number(coordinateForm.longitude);

    if (customerLoading || !coordinateCustomer || coordinateCustomer.codigo !== coordinateForm.customerCode || !route || !type || !coordinateForm.latitude.trim() || !coordinateForm.longitude.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      setCoordinateMessage("Consulta el código de cliente, valida la cédula RR y pulsa Usar mi ubicación.");
      return;
    }

    setCoordinateSaving(true);
    const payload = {
      customerCode: coordinateForm.customerCode,
      route,
      type,
      latitude,
      longitude,
    };

    try {
      const response = await fetch("/api/public/critical-routes?scope=coordinates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok || !body.hazard?.id) {
        throw new Error(body.error || "No se pudo guardar la nueva coordenada.");
      }

      setCoordinateMessage("Coordenada guardada correctamente en el sistema.");
      setCoordinateForm(initialCoordinateForm);
      setCoordinateCustomer(null);
      setRrValidation(null);
      setTimeout(() => {
        setIsCoordinateModalOpen(false);
        setCoordinateMessage("");
      }, 1200);
    } catch (error) {
      setCoordinateMessage(error instanceof Error ? error.message : "No se pudo guardar la coordenada. Conservamos los datos para que puedas reintentar.");
    } finally {
      setCoordinateSaving(false);
    }
  }

  return (
    <main className="min-h-screen text-slate-900">
      <section className="grid min-h-screen lg:grid-cols-[1.02fr_0.98fr]">
        <aside className="relative hidden overflow-hidden bg-[#091525] text-white lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(0,184,217,0.32),transparent_30%),radial-gradient(circle_at_78%_22%,rgba(245,189,25,0.24),transparent_26%)]" />
          <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-md bg-gradient-to-br from-[#f5bd19] to-[#00b8d9] text-[#10223d] shadow-lg shadow-cyan-500/20">
                <Icon name="building" />
              </div>
              <div>
                <p className="text-lg font-semibold uppercase tracking-[0.18em] text-[#f5bd19]">transport Barranquilla</p>
                <p className="text-sm text-white/68">Torre Control</p>
              </div>
            </div>

            <div className="max-w-xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/82 backdrop-blur">
                <ShieldCheck size={17} />
                Acceso seguro
              </div>
              <h1 className="text-balance text-5xl font-semibold leading-tight xl:text-6xl">
                Operacion conectada, decisiones mas rapidas.
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-8 text-white/70">
                Seguimiento, modulacion y jornada laboral en un entorno visual pensado para control operativo.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {["BAQ", "Rutas", "Refusal"].map((item) => (
                <div className="rounded-md border border-white/12 bg-white/10 px-4 py-3 text-sm font-medium text-white/80 backdrop-blur" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[460px]">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="grid h-11 w-11 place-items-center rounded-md bg-gradient-to-br from-[#f5bd19] to-[#00b8d9] text-[#10223d]">
                <Icon name="building" />
              </div>
              <div>
                <p className="text-base font-semibold uppercase tracking-[0.16em] text-[#10223d]">Transport</p>
                <p className="text-sm text-slate-500">Torre Control</p>
              </div>
            </div>

            <div className="glass-panel rounded-lg p-6 sm:p-8">
              <div className="mb-8">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-md bg-gradient-to-br from-[#10223d] to-[#1264ff] text-white shadow-lg shadow-blue-500/20">
                  <ShieldCheck size={20} />
                </div>
                <h2 className="text-3xl font-semibold text-[#10223d]">Iniciar sesion</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">Entra con tus datos corporativos.</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <a className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-cyan-100 bg-cyan-50 px-2.5 py-2 text-center text-xs font-semibold text-[#07556b] transition hover:border-[#00b8d9] hover:bg-white" href="/asistencia">
                    Asistencia RR
                    <ArrowRight size={14} />
                  </a>
                  <a className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-cyan-100 bg-cyan-50 px-2.5 py-2 text-center text-xs font-semibold text-[#07556b] transition hover:border-[#00b8d9] hover:bg-white" href="/registro-modulacion">
                    Registrar modulacion
                    <ArrowRight size={14} />
                  </a>
                  <button
                    className="col-span-2 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-2 text-center text-xs font-bold text-violet-900 transition hover:border-violet-400 hover:bg-white"
                    onClick={() => {
                      setCoordinateForm(initialCoordinateForm);
                      setCoordinateMessage("");
                      setIsCoordinateModalOpen(true);
                    }}
                    type="button"
                  >
                    Agregar nuevas coordenadas
                    <Plus size={14} />
                  </button>
                  <a className="col-span-2 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-center text-xs font-bold text-amber-900 transition hover:border-[#f5bd19] hover:bg-white" href="/rutas-criticas">
                    Consultar rutas criticas
                    <ArrowRight size={14} />
                  </a>
                </div>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                {sessionError ? <p className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">{sessionError}</p> : null}
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Correo corporativo</span>
                  <span className="relative block">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                    <input
                      className={`h-12 w-full rounded-md border bg-white/90 pl-10 pr-4 text-sm text-slate-900 transition placeholder:text-slate-400 ${
                        errors.email ? "border-red-400" : "border-slate-200 focus:border-[#00b8d9]"
                      }`}
                      inputMode="email"
                      onChange={(event) => updateField("email", event.target.value)}
                      placeholder="nombre@bavaria.co"
                      type="email"
                      value={form.email}
                    />
                  </span>
                  {errors.email ? <span className="mt-2 block text-sm text-red-600">{errors.email}</span> : null}
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Contrasena</span>
                  <span className="relative block">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                    <input
                      className={`h-12 w-full rounded-md border bg-white/90 pl-10 pr-12 text-sm text-slate-900 transition placeholder:text-slate-400 ${
                        errors.password ? "border-red-400" : "border-slate-200 focus:border-[#00b8d9]"
                      }`}
                      onChange={(event) => updateField("password", event.target.value)}
                      placeholder="Tu contrasena"
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                    />
                    <button
                      aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                      className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-[#10223d]"
                      onClick={() => setShowPassword((current) => !current)}
                      type="button"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                  {errors.password ? <span className="mt-2 block text-sm text-red-600">{errors.password}</span> : null}
                </label>

                <div className="flex items-center justify-between gap-4">
                  <label className="flex items-center gap-3 text-sm text-slate-600">
                    <input
                      checked={form.remember}
                      className="h-4 w-4 rounded border-slate-300 accent-[#00b8d9]"
                      onChange={(event) => updateField("remember", event.target.checked)}
                      type="checkbox"
                    />
                    Recordarme
                  </label>
                </div>

                <button
                  className="tech-button flex h-12 w-full items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
                  disabled={!canSubmit || submitting}
                  type="submit"
                >
                  {submitting ? "Ingresando..." : "Entrar al portal"}
                  <ArrowRight size={17} />
                </button>
                {loginError ? <p className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{loginError}</p> : null}
              </form>
            </div>

            <p className="mt-6 text-center text-xs leading-5 text-slate-500">Transport S.A.</p>
          </div>
        </section>
      </section>

      {isCoordinateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700">
                  <MapPinned size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700">Coordenadas</p>
                  <h3 className="text-lg font-black text-[#10223d]">Agregar nuevas coordenadas</h3>
                </div>
              </div>
              <button
                aria-label="Cerrar"
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                onClick={() => setIsCoordinateModalOpen(false)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleCoordinateSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Código de cliente</span>
                  <input
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-400"
                    onChange={(event) => {
                      const customerCode = event.target.value.replace(/\D/g, "");
                      setCoordinateForm((current) => ({ ...current, customerCode, route: "", type: "", latitude: "", longitude: "" }));
                      setCoordinateMessage("");
                      setCoordinateCustomer(null);
                      setRrValidation(null);
                      setCustomerError("");
                      setCustomerLoading(false);
                    }}
                    inputMode="numeric"
                    disabled={coordinateSaving || locating}
                    placeholder="Ingresa el código del cliente"
                    type="text"
                    value={coordinateForm.customerCode}
                  />
                </label>

                <div aria-live="polite" className="sm:col-span-2">
                  {customerLoading ? <p className="text-sm text-violet-700">Consultando cliente...</p> : null}
                  {customerError ? <p role="alert" className="text-sm text-red-700">{customerError}</p> : null}
                  {coordinateCustomer && coordinateCustomer.codigo === coordinateForm.customerCode ? <dl className="grid gap-2 rounded-xl border border-violet-100 bg-violet-50 p-3 text-sm sm:grid-cols-2">
                    <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Nombre del cliente</dt><dd className="font-semibold text-[#10223d]">{coordinateCustomer.nombre || "Sin nombre registrado"}</dd></div>
                    <div><dt className="text-xs text-slate-500">Cédula / NIT del cliente</dt><dd>{coordinateCustomer.cedula || "No registrada"}</dd></div>
                    <div><dt className="text-xs text-slate-500">Teléfono</dt><dd>{coordinateCustomer.telefono || "No registrado"}</dd></div>
                  </dl> : null}
                </div>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Cédula RR</span>
                  <input
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-400"
                    onChange={(event) => { setRrValidation(null); setCoordinateForm((current) => ({ ...current, type: event.target.value.replace(/\D/g, "") })); }}
                    inputMode="numeric"
                    disabled={coordinateSaving}
                    placeholder="Ej. 12345678"
                    type="text"
                    value={coordinateForm.type}
                  />
                  <p aria-live="polite" className={`mt-1 text-xs ${rrIsValid ? "text-emerald-700" : "text-red-700"}`}>{!coordinateForm.type ? "Ingresa la cédula del RR para validar su cargo." : rrValidation?.cc === coordinateForm.type ? `${rrValidation.message}${rrValidation.name ? ` · ${rrValidation.name}` : ""}` : "Validando cargo del RR..."}</p>
                </label>

              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 transition hover:bg-violet-100"
                  onClick={handleCoordinateGeoLocation}
                  disabled={locating || coordinateSaving}
                  type="button"
                >
                  <MapPinned size={16} />
                  {locating ? "Obteniendo ubicación..." : coordinateForm.latitude && coordinateForm.longitude ? "Actualizar mi ubicación" : "Usar mi ubicación"}
                </button>

                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#10223d] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#0d1b2d] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={coordinateSaving || locating || !coordinateForm.latitude || !coordinateForm.longitude || customerLoading || !rrIsValid || !coordinateCustomer || coordinateCustomer.codigo !== coordinateForm.customerCode}
                  type="submit"
                >
                  <Plus size={16} />
                  {coordinateSaving ? "Guardando..." : "Guardar coordenada"}
                </button>
              </div>

              {coordinateMessage ? (
                <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {coordinateMessage}
                </p>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
