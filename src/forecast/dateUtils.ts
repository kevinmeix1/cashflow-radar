import type { ISODate } from "../types/domain";

const DAY_MS = 24 * 60 * 60 * 1000;

export function toDate(value: ISODate): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toISODate(value: Date): ISODate {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: ISODate, days: number): ISODate {
  return toISODate(new Date(toDate(value).getTime() + days * DAY_MS));
}

export function daysBetween(start: ISODate, end: ISODate): number {
  return Math.round((toDate(end).getTime() - toDate(start).getTime()) / DAY_MS);
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function dateRange(start: ISODate, days: number): ISODate[] {
  return Array.from({ length: days }, (_, index) => addDays(start, index));
}

export function formatMoney(value: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}
