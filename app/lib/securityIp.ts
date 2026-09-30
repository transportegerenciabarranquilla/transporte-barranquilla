import { isIP } from "node:net";

export function normalizeIp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ip = value.trim().toLowerCase();
  const version = isIP(ip);
  if (!version || ip.includes("%")) return null;
  if (version === 4) return ip;
  const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const mapped = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!mapped) return normalized;
  const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

export function requestIp(headers: { get(name: string): string | null }) {
  // Vercel sobrescribe x-forwarded-for. En otros despliegues el proxy de
  // confianza debe sobrescribir la cabecera configurada, nunca reenviarla.
  const header = process.env.VERCEL === "1" ? "x-forwarded-for" : process.env.TRUSTED_CLIENT_IP_HEADER;
  if (header) return normalizeIp(headers.get(header)?.split(",")[0]);
  if (process.env.NODE_ENV !== "production") return normalizeIp(headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1");
  return null;
}
