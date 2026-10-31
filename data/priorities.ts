export const priorities = [
  { value: 5, label: "最重要" }, { value: 4, label: "重要" }, { value: 3, label: "標準" },
  { value: 2, label: "やや発展" }, { value: 1, label: "発展・細目" },
] as const;
export function priorityStars(value: number) { return "★".repeat(value) + "☆".repeat(5 - value); }
