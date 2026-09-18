export function isRrRole(value: unknown): boolean {
  const role = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  return /\bRR\b/.test(role) || /^RESPONSABLE (?:DE )?RUTA$/.test(role);
}
