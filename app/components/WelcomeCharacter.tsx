"use client";

import { motion } from "framer-motion";

export function WelcomeCharacter() {
  return (
    <motion.div
      className="relative mx-auto w-full max-w-[360px] pb-5"
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
    >
      <motion.div
        className="relative z-10 mx-auto mb-[-8px] w-[min(318px,100%)] rounded-xl border border-slate-200 bg-white/95 px-5 py-4 text-center shadow-[0_18px_45px_rgba(16,34,61,0.16)] backdrop-blur"
        initial={{ opacity: 0, y: -10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.45, ease: "easeOut" }}
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f7c58]">Asistente </p>
        <p className="mt-1 text-lg font-semibold leading-snug text-[#10223d]">
          Hola, bienvenido a tu portal web de seguimiento de vehiculos
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">Estoy aqui para guiarte por tus modulos.</p>
        <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-slate-200 bg-white" />
      </motion.div>

      <svg className="h-auto w-full" viewBox="0 0 380 360" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="bgGlow" x1="78" y1="42" x2="304" y2="300" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F7FBFF" />
            <stop offset="1" stopColor="#DCEEFF" />
          </linearGradient>
          <linearGradient id="botBody" x1="103" y1="141" x2="270" y2="307" gradientUnits="userSpaceOnUse">
            <stop stopColor="#173B68" />
            <stop offset="1" stopColor="#10223D" />
          </linearGradient>
          <linearGradient id="screen" x1="124" y1="83" x2="252" y2="211" gradientUnits="userSpaceOnUse">
            <stop stopColor="#163B66" />
            <stop offset="1" stopColor="#0F223D" />
          </linearGradient>
          <linearGradient id="goldAccent" x1="114" y1="72" x2="255" y2="250" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFD75B" />
            <stop offset="1" stopColor="#F5BD19" />
          </linearGradient>
          <filter id="botShadow" x="48" y="38" width="284" height="300" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="22" stdDeviation="18" floodColor="#10223D" floodOpacity="0.18" />
          </filter>
        </defs>

        <ellipse cx="190" cy="320" rx="96" ry="18" fill="#10223D" opacity="0.12" />
        <circle cx="190" cy="190" r="118" fill="url(#bgGlow)" />

        <motion.g
          initial={{ opacity: 0, x: 16, y: -6 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ delay: 0.35, duration: 0.48, ease: "easeOut" }}
        >
          <rect x="260" y="92" width="70" height="56" rx="20" fill="white" stroke="#D7E0EA" strokeWidth="4" />
          <path d="M278 148L260 165V148H278Z" fill="white" stroke="#D7E0EA" strokeWidth="4" strokeLinejoin="round" />
          <path d="M280 116h31M280 132h18" stroke="#10223D" strokeWidth="6" strokeLinecap="round" />
          <circle cx="315" cy="132" r="6" fill="#F5BD19" />
        </motion.g>

        <g filter="url(#botShadow)">
          <motion.g
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <path d="M112 222c0-39.212 31.788-71 71-71h14c39.212 0 71 31.788 71 71v66H112v-66Z" fill="url(#botBody)" />
            <path d="M139 218h102v70H139v-70Z" fill="white" opacity="0.96" />
            <path d="M171 218h38v70h-38v-70Z" fill="url(#goldAccent)" />
            <path d="M122 234h17v54h-17v-54ZM241 234h17v54h-17v-54Z" fill="#F5BD19" />
            <rect x="219" y="250" width="33" height="34" rx="8" fill="#0F7C58" />
            <path d="M228 260h15M228 272h11" stroke="white" strokeWidth="5" strokeLinecap="round" opacity="0.9" />

            <path d="M119 208c-28 9-49 31-58 58" stroke="#F5BD19" strokeWidth="20" strokeLinecap="round" />
            <circle cx="57" cy="271" r="17" fill="#F5BD19" stroke="#10223D" strokeWidth="7" />

            <motion.g
              animate={{ rotate: [0, -12, 8, -8, 0] }}
              transition={{ delay: 0.75, duration: 1.45, ease: "easeInOut" }}
              style={{ transformOrigin: "263px 214px" }}
            >
              <path d="M261 208c28 9 49 31 58 58" stroke="#F5BD19" strokeWidth="20" strokeLinecap="round" />
              <circle cx="323" cy="271" r="17" fill="#F5BD19" stroke="#10223D" strokeWidth="7" />
            </motion.g>

            <rect x="107" y="92" width="166" height="124" rx="46" fill="url(#screen)" />
            <rect x="116" y="101" width="148" height="106" rx="38" fill="#112944" stroke="#F5BD19" strokeWidth="5" />
            <path d="M151 85h78c9.389 0 17 7.611 17 17H134c0-9.389 7.611-17 17-17Z" fill="#10223D" />
            <path d="M164 76h52" stroke="#F5BD19" strokeWidth="9" strokeLinecap="round" />

            <circle cx="128" cy="153" r="17" fill="#10223D" />
            <circle cx="252" cy="153" r="17" fill="#10223D" />
            <path d="M107 148c-14 4-24 17-24 33s10 29 24 33" stroke="#10223D" strokeWidth="7" strokeLinecap="round" />
            <path d="M273 148c14 4 24 17 24 33s-10 29-24 33" stroke="#10223D" strokeWidth="7" strokeLinecap="round" />

            <motion.g animate={{ scaleY: [1, 0.18, 1] }} transition={{ delay: 1.7, duration: 0.16 }}>
              <rect x="145" y="140" width="28" height="32" rx="14" fill="#F5BD19" />
              <rect x="207" y="140" width="28" height="32" rx="14" fill="#F5BD19" />
              <circle cx="159" cy="156" r="5" fill="#10223D" />
              <circle cx="221" cy="156" r="5" fill="#10223D" />
            </motion.g>

            <path d="M161 184c18 18 41 18 59 0" stroke="#F5BD19" strokeWidth="8" strokeLinecap="round" />
            <path d="M143 124c10-8 25-8 35 0M203 124c10-8 25-8 35 0" stroke="#DCEEFF" strokeWidth="6" strokeLinecap="round" opacity="0.85" />
            <path d="M132 196c17 10 38 15 58 15s41-5 58-15" stroke="#DCEEFF" strokeWidth="4" strokeLinecap="round" opacity="0.24" />

            <path d="M133 288h34v29h-34v-29ZM213 288h34v29h-34v-29Z" fill="#F5BD19" />
            <path d="M111 310h63c7.732 0 14 6.268 14 14h-77v-14ZM206 310h63v14h-77c0-7.732 6.268-14 14-14Z" fill="#10223D" />
          </motion.g>
        </g>

        <motion.circle
          cx="78"
          cy="112"
          r="5"
          fill="#F5BD19"
          animate={{ scale: [1, 1.35, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.circle
          cx="293"
          cy="218"
          r="5"
          fill="#0F7C58"
          animate={{ scale: [1, 1.3, 1], opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
    </motion.div>
  );
}
