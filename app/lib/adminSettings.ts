"use client";

import { notifyStorageChange } from "./storageEvents";

export const MANUAL_RESPONSABLE_EDIT_ENABLED_KEY = "bavaria.admin.seguimiento.manualResponsibleEditEnabled";

export function isManualResponsibleEditEnabled() {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(MANUAL_RESPONSABLE_EDIT_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setManualResponsibleEditEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(MANUAL_RESPONSABLE_EDIT_ENABLED_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore storage quota/private mode failures.
  } finally {
    notifyStorageChange(MANUAL_RESPONSABLE_EDIT_ENABLED_KEY);
  }
}
