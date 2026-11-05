export interface DevelopmentLogEntry {
  id: string;
  date: string;
  title: string;
  body: string;
}

// Add entries only when explicitly requested by the project owner (see AGENTS.md).
// Use a unique ID for each new entry; existing IDs keep their read status.
export const developmentLog: DevelopmentLogEntry[] = [];
