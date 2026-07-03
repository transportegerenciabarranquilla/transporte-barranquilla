"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "./Icon";

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  text: string;
};

function getAssistantAnswer(question: string) {
  const normalized = question.toLowerCase();

  if (!question.trim()) {
    return "Escribeme una pregunta sobre el portal, los modulos o el acceso.";
  }

  if (normalized.includes("seguimiento") || normalized.includes("vehiculo")) {
    return "El modulo Seguimiento sera el espacio para consultar y gestionar informacion relacionada con el seguimiento de vehiculos.";
  }

  if (normalized.includes("modulo") || normalized.includes("modulos")) {
    return "Por ahora hay 8 espacios de modulos. Solo Seguimiento tiene nombre; los demas quedan listos para futuras areas.";
  }

  if (normalized.includes("base") || normalized.includes("seguridad") || normalized.includes("login")) {
    return "Este ingreso es una simulacion visual. Mas adelante puedes conectarlo a autenticacion, roles, sesiones y base de datos.";
  }

  return "Este portal esta pensado para centralizar herramientas de  Puedes empezar por Seguimiento y luego activar nuevos modulos segun lo que necesite el equipo.";
}

function AssistantAvatar() {
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e9f3ff] ring-2 ring-white">
      <svg className="h-8 w-8" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="#10223D" />
        <rect x="14" y="17" width="36" height="28" rx="12" fill="#112944" stroke="#F5BD19" strokeWidth="3" />
        <path d="M21 14h22c3.3 0 6 2.7 6 6H15c0-3.3 2.7-6 6-6Z" fill="#10223D" />
        <path d="M25 11h14" stroke="#F5BD19" strokeWidth="4" strokeLinecap="round" />
        <rect x="21" y="27" width="8" height="9" rx="4" fill="#F5BD19" />
        <rect x="35" y="27" width="8" height="9" rx="4" fill="#F5BD19" />
        <circle cx="25" cy="31" r="1.5" fill="#10223D" />
        <circle cx="39" cy="31" r="1.5" fill="#10223D" />
        <path d="M25 40c4 4 10 4 14 0" stroke="#F5BD19" strokeWidth="3" strokeLinecap="round" />
        <circle cx="15" cy="32" r="4" fill="#10223D" />
        <circle cx="49" cy="32" r="4" fill="#10223D" />
      </svg>
    </div>
  );
}

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      text: "Hola, soy tu asistente Preguntame sobre el portal, los modulos o el acceso.",
    },
  ]);

  function askAssistant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const userQuestion = question.trim();
    const answer = getAssistantAnswer(userQuestion);

    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        role: "user",
        text: userQuestion || "Necesito ayuda",
      },
      {
        id: Date.now() + 1,
        role: "assistant",
        text: answer,
      },
    ]);
    setQuestion("");
  }

  return (
    <div className="fixed bottom-5 right-5 z-30">
      {open ? (
        <motion.div
          className="mb-4 w-[min(390px,calc(100vw-40px))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_60px_rgba(16,34,61,0.2)]"
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 px-4 pt-4">
              <AssistantAvatar />
              <div>
                <p className="text-sm font-semibold text-[#10223d]">Asistente</p>
                <p className="text-xs text-slate-500">Chat de ayuda rapida</p>
              </div>
            </div>
            <button
              className="mr-4 mt-4 grid h-9 w-9 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-[#10223d]"
              onClick={() => setOpen(false)}
              type="button"
              aria-label="Cerrar asistente"
            >
              <Icon name="close" />
            </button>
          </div>

          <div className="mx-4 max-h-80 space-y-3 overflow-y-auto rounded-md bg-[#f4f7fb] p-3">
            {messages.map((message) =>
              message.role === "assistant" ? (
                <motion.div
                  className="flex items-start gap-2"
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  <AssistantAvatar />
                  <div className="max-w-[260px] rounded-lg rounded-tl-sm border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 shadow-sm">
                    {message.text}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  className="flex justify-end"
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  <div className="max-w-[260px] rounded-lg rounded-tr-sm bg-[#10223d] px-3 py-2 text-sm leading-6 text-white shadow-sm">
                    {message.text}
                  </div>
                </motion.div>
              )
            )}
          </div>

          <form className="flex gap-2 border-t border-slate-200 p-4" onSubmit={askAssistant}>
            <input
              className="h-11 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#e6a400]"
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Pregunta sobre el portal..."
              value={question}
            />
            <button
              className="grid h-11 w-11 place-items-center rounded-md bg-[#10223d] text-white transition hover:bg-[#0f7c58]"
              type="submit"
              aria-label="Enviar pregunta"
            >
              <Icon name="send" />
            </button>
          </form>
        </motion.div>
      ) : null}

      <button
        className="flex h-14 items-center gap-3 rounded-md bg-[#10223d] px-4 text-sm font-semibold text-white shadow-[0_14px_35px_rgba(16,34,61,0.26)] transition hover:bg-[#0f7c58]"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Icon name="chat" />
        Preguntar
      </button>
    </div>
  );
}
