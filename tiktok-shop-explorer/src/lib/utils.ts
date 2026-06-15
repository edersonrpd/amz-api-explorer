import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TZ = "America/Sao_Paulo";

// TikTok Shop devolve timestamps em segundos (epoch). Converte para data local BR.
export function fmtEpoch(seconds?: number): string {
  if (!seconds) return "—";
  const d = new Date(seconds * 1000);
  if (isNaN(d.getTime())) return "—";
  return d
    .toLocaleString("pt-BR", {
      timeZone: TZ,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", " ·");
}

export function fmtMoney(value: any, currency = "BRL"): string {
  const num = parseFloat(value);
  if (isNaN(num)) return currency === "BRL" ? "R$ 0,00" : `${currency} 0,00`;
  if (currency === "BRL") {
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  return `${currency} ${num.toFixed(2)}`;
}
