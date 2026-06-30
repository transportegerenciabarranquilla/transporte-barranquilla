"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { Icon } from "./Icon";

type LoginForm = {
  email: string;
  password: string;
  remember: boolean;
};

type LoginErrors = Partial<Record<"email" | "password", string>>;

const initialForm: LoginForm = {
  email: "",
  password: "",
  remember: true,
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
                <p className="text-lg font-semibold uppercase tracking-[0.18em] text-[#f5bd19]">Bavaria</p>
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
                <p className="text-base font-semibold uppercase tracking-[0.16em] text-[#10223d]">Bavaria</p>
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

            <p className="mt-6 text-center text-xs leading-5 text-slate-500">Bavaria S.A.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
