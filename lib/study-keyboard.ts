"use client";

let keyboardBridge: HTMLInputElement | null = null;
let cleanupTimer: ReturnType<typeof setTimeout> | undefined;

export function usesMobileKeyboard() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

export function releaseStudyKeyboard() {
  if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
  cleanupTimer = undefined;
  keyboardBridge?.remove();
  keyboardBridge = null;
}

// Focus during the start-button gesture; hand focus to the real input after routing.
export function prepareStudyKeyboard() {
  if (!usesMobileKeyboard()) return;
  releaseStudyKeyboard();
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.tabIndex = -1;
  input.setAttribute("aria-label", "年号を入力");
  input.dataset.studyKeyboardBridge = "true";
  Object.assign(input.style, { position: "fixed", top: "0", left: "0", width: "1px", height: "1px", minHeight: "1px", minWidth: "1px", padding: "0", border: "0", opacity: "0.01", fontSize: "16px", pointerEvents: "none" });
  document.body.appendChild(input);
  keyboardBridge = input;
  input.focus({ preventScroll: true });
  cleanupTimer = setTimeout(releaseStudyKeyboard, 5000);
}

export function focusStudyInput(input: HTMLInputElement | null) {
  if (!input || input.readOnly) return;
  input.focus({ preventScroll: true });
  if (usesMobileKeyboard()) {
    const keyboard = (navigator as Navigator & { virtualKeyboard?: { show(): void } }).virtualKeyboard;
    try { keyboard?.show(); } catch { /* Native focus still works when the API is unavailable or restricted. */ }
  }
  releaseStudyKeyboard();
}
