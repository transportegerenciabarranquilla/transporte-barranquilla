export function escapeHtml(value: unknown) {
  return String(value ?? "sin dato").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] || char));
}
