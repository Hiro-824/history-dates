import type { HistoryEvent } from "@/lib/types";

export function EventNote({ event }: { event: Pick<HistoryEvent, "note"> }) {
  if (!event.note) return null;
  return <aside className="event-note" aria-label="語呂合わせ・備考"><h4>語呂合わせ・備考</h4><p>{event.note}</p></aside>;
}
