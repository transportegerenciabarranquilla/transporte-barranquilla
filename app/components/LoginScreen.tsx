"use client";

import { FormEvent, useMemo, useState } from "react";
import { Icon } from "./Icon";

type LoginForm = {
  email: string;
  password: string;
  remember: boolean;
};

type LoginErrors = Partial<Record<"email" | "password", string>>;

const branches = ["Bogota", "Medellin", "Barranquilla", "Bucaramanga"];

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

  if (!form.password.trim()) {
    errors.password = "Ingresa tu contraseña.";
  }

  return errors;
}

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [form, setForm] = useState<LoginForm>(initialForm);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [showPassword, setShowPassword] = useState(false);

  const canSubmit = useMemo(() => form.email.trim() && form.password.trim(), [form]);

  function updateField<Key extends keyof LoginForm>(key: Key, value: LoginForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length === 0) {
      onLogin();
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <section className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <aside className="relative hidden overflow-hidden bg-[#10223d] text-white lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(245,189,25,0.35),transparent_30%),linear-gradient(135deg,rgba(16,34,61,0.97),rgba(15,124,88,0.82))]" />
          <div className="absolute inset-x-0 bottom-0 h-2/5 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.26))]" />

          <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-md bg-[#f5bd19] text-[#10223d] shadow-lg shadow-black/20">
                <Icon name="building" />
              </div>
              <div>
                <p className="text-lg font-semibold uppercase tracking-[0.18em] text-[#f5bd19]">Bavaria</p>
                <p className="text-sm text-white/72">Gerencia barranquilla</p>
              </div>
            </div>

            <div className="max-w-xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/82 backdrop-blur">
                <Icon name="shield" />
                Acceso temporal 
              </div>
              <h1 className="text-5xl font-semibold leading-tight xl:text-6xl">
                Gestiona el ingreso del equipo con una experiencia limpia.
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-8 text-white/75">
                Interfaz lista para conectar mas adelante con autenticacion, roles y base de datos.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {branches.map((branch) => (
                <div
                  className="rounded-md border border-white/12 bg-white/10 px-4 py-3 text-sm font-medium text-white/80 backdrop-blur"
                  key={branch}
                >
                  {branch}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[460px]">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="grid h-11 w-11 place-items-center rounded-md bg-[#f5bd19] text-[#10223d]">
                <Icon name="building" />
              </div>
              <div>
                <p className="text-base font-semibold uppercase tracking-[0.16em] text-[#10223d]">Bavaria</p>
                <p className="text-sm text-slate-500">Gerencia barranquilla</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(16,34,61,0.18)] sm:p-8">
              <div className="mb-8">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-md bg-[#e9f3ff] text-[#10223d]">
                  <Icon name="shield" />
                </div>
                <h2 className="text-3xl font-semibold text-[#10223d]">Iniciar sesion</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Entra con tus datos corporativos.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    className="inline-flex items-center gap-2 rounded-md bg-[#e9f3ff] px-3 py-2 text-sm font-semibold text-[#10223d] transition hover:bg-[#dbeeff]"
                    href="/asistencia"
                  >
                    Link de asistencia RR
                    <Icon name="arrow" />
                  </a>
                  <a
                    className="inline-flex items-center gap-2 rounded-md bg-[#e9f3ff] px-3 py-2 text-sm font-semibold text-[#10223d] transition hover:bg-[#dbeeff]"
                    href="/registro-modulacion"
                  >
                    link de modulacion
                    <Icon name="arrow" />
                  </a>
                </div>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Correo corporativo</span>
                  <span className="relative block">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Icon name="mail" />
                    </span>
                    <input
                      className={`h-12 w-full rounded-md border bg-white pl-10 pr-4 text-sm text-slate-900 transition placeholder:text-slate-400 ${
                        errors.email ? "border-red-400" : "border-slate-200 focus:border-[#e6a400]"
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
                  <span className="mb-2 block text-sm font-medium text-slate-700">Contraseña</span>
                  <span className="relative block">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Icon name="lock" />
                    </span>
                    <input
                      className={`h-12 w-full rounded-md border bg-white pl-10 pr-12 text-sm text-slate-900 transition placeholder:text-slate-400 ${
                        errors.password ? "border-red-400" : "border-slate-200 focus:border-[#e6a400]"
                      }`}
                      onChange={(event) => updateField("password", event.target.value)}
                      placeholder="Tu contraseña"
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                    />
                    <button
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-[#10223d]"
                      onClick={() => setShowPassword((current) => !current)}
                      type="button"
                    >
                      <Icon name={showPassword ? "eyeOff" : "eye"} />
                    </button>
                  </span>
                  {errors.password ? <span className="mt-2 block text-sm text-red-600">{errors.password}</span> : null}
                </label>

                <div className="flex items-center justify-between gap-4">
                  <label className="flex items-center gap-3 text-sm text-slate-600">
                    <input
                      checked={form.remember}
                      className="h-4 w-4 rounded border-slate-300 accent-[#e6a400]"
                      onChange={(event) => updateField("remember", event.target.checked)}
                      type="checkbox"
                    />
                    Recordarme
                  </label>
                  <button className="text-sm font-medium text-[#0f7c58] hover:text-[#10223d]" type="button">
                    Olvide mi contraseña
                  </button>
                </div>

                <button
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#f5bd19] px-5 text-sm font-semibold text-[#10223d] shadow-lg shadow-yellow-500/20 transition hover:bg-[#e6a400] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
                  disabled={!canSubmit}
                  type="submit"
                >
                  Entrar al portal
                  <Icon name="arrow" />
                </button>
              </form>
            </div>

            <p className="mt-6 text-center text-xs leading-5 text-slate-500">Bavaria S.A.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
