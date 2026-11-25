import type { CoordinatePrecision } from "../types/atlas";

export function formatYear(year: number | null, approximate = false): string {
  if (year === null) return "Date unknown";
  const label = year <= 0 ? `${1 - year} BCE` : `${year} CE`;
  return approximate ? `c. ${label}` : label;
}

export function formatYearRange(
  start: number | null,
  end: number | null,
  approximate = false,
): string {
  if (start === null) return "Date unknown";
  if (end === null || end === start) return formatYear(start, approximate);
  const prefix = approximate ? "c. " : "";
  return `${prefix}${formatYear(start)} – ${formatYear(end)}`;
}

export function formatCoordinate(
  latitude: number,
  longitude: number,
  precision: CoordinatePrecision,
): string {
  const ns = latitude >= 0 ? "N" : "S";
  const ew = longitude >= 0 ? "E" : "W";
  const position = `${Math.abs(latitude).toFixed(4)}° ${ns}, ${Math.abs(longitude).toFixed(4)}° ${ew}`;
  const qualifier = precision === "exact" ? "" : ` · ${precision.replaceAll("_", " ")}`;
  return `${position}${qualifier}`;
}
