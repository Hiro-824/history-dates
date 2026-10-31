"use client";

import { useSyncExternalStore } from "react";

const CHANGE_EVENT = "oboeyo:settings-modal";
const ENTRY_KEY = "oboeyoSettingsModal";
const isOpen = () => window.location.pathname === "/" && window.location.hash === "#settings";
const notify = () => window.dispatchEvent(new Event(CHANGE_EVENT));
function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener("hashchange", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener("hashchange", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}
function open() {
  if (isOpen()) return;
  const url = new URL(window.location.href);
  url.hash = "settings";
  window.history.pushState({ [ENTRY_KEY]: true }, "", url);
  notify();
}
function close() {
  if (!isOpen()) return;
  if (window.history.state?.[ENTRY_KEY]) {
    window.history.back();
  } else {
    // Direct links have no modal-only history entry to return from.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    notify();
  }
}
export function useSettingsModal() {
  const opened = useSyncExternalStore(subscribe, isOpen, () => false);
  return { opened, open, close };
}
