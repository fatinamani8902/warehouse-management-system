import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "./dateTimeFormatter";

describe("dateTimeFormatter", () => {
  it("formats date-only values without timezone drift", () => {
    expect(formatDate("2026-06-14")).toBe("14/06/2026");
  });

  it("formats timestamps in the browser local timezone with seconds", () => {
    const value = "2026-06-11T05:42:26.000Z";
    const expected = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value)).replace(",", "");

    expect(formatDateTime(value)).toBe(expected);
    expect(formatDateTime(value)).not.toContain("T");
    expect(formatDateTime(value)).not.toContain("Z");
  });

  it("returns a hyphen for null and invalid values", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate("not-a-date")).toBe("-");
    expect(formatDateTime(undefined)).toBe("-");
    expect(formatDateTime("not-a-date")).toBe("-");
  });
});
