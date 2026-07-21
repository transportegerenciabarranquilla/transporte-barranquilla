import type { PinRecord } from "./types";

export function isValidPin(pin: string) {
  return /^\d{4,8}$/.test(pin);
}

export async function createPinRecord(pin: string): Promise<PinRecord> {
  if (!isValidPin(pin)) throw new Error("El PIN debe tener entre 4 y 8 dígitos.");
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = toBase64(saltBytes);
  return { salt, hash: await hashPin(pin, salt) };
}

export async function verifyPin(pin: string, record: PinRecord) {
  if (!isValidPin(pin)) return false;
  const candidate = await hashPin(pin, record.salt);
  return timingSafeEqual(candidate, record.hash);
}

async function hashPin(pin: string, salt: string) {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toBase64(new Uint8Array(digest));
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}
