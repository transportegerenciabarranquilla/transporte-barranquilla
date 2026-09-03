export function formatPersonName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("es-CO")
    .replace(/(^|[\s'-])([\p{L}])/gu, (_, separator: string, letter: string) =>
      `${separator}${letter.toLocaleUpperCase("es-CO")}`,
    );
}
