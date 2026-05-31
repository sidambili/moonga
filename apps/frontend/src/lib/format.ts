import { format, formatDistanceToNow } from "date-fns";

export function formatDate(dateStr?: string | null) {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "MMM d, HH:mm:ss");
  } catch (e) {
    return dateStr;
  }
}

export function formatRelative(dateStr?: string | null) {
  if (!dateStr) return "-";
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch (e) {
    return dateStr;
  }
}

export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
