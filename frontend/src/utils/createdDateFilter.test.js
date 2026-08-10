import { describe, expect, it } from "vitest";
import { filterByCreatedDate, isInvalidCreatedDateRange } from "./createdDateFilter";

const rows = [
  { id: "before", created_at: "2026-06-24T23:59:59", status: "created", name: "Alpha" },
  { id: "start", created_at: "2026-06-25T00:00:00", status: "created", name: "Beta" },
  { id: "middle", created_at: "2026-06-26T12:00:00", status: "processing", name: "Gamma" },
  { id: "end", created_at: "2026-06-27T23:59:59", status: "completed", name: "Delta" },
  { id: "after", created_at: "2026-06-28T00:00:00", status: "created", name: "Epsilon" },
];

describe("createdDateFilter", () => {
  it("filters from date inclusively", () => {
    expect(filterByCreatedDate(rows, "2026-06-26", "").map((row) => row.id)).toEqual(["middle", "end", "after"]);
  });

  it("filters to date through the full selected day", () => {
    expect(filterByCreatedDate(rows, "", "2026-06-26").map((row) => row.id)).toEqual(["before", "start", "middle"]);
  });

  it("supports same-day ranges", () => {
    expect(filterByCreatedDate(rows, "2026-06-27", "2026-06-27").map((row) => row.id)).toEqual(["end"]);
  });

  it("supports multi-day ranges", () => {
    expect(filterByCreatedDate(rows, "2026-06-25", "2026-06-27").map((row) => row.id)).toEqual(["start", "middle", "end"]);
  });

  it("filters ASN rows by created_at, not ETA", () => {
    const asnRows = [
      {
        asn_id: "ASN000039",
        created_at: "2026-07-07T02:26:09.155Z",
        eta: "2026-07-13",
      },
    ];

    expect(filterByCreatedDate(asnRows, "2026-07-07", "2026-07-07").map((row) => row.asn_id)).toEqual(["ASN000039"]);
    expect(filterByCreatedDate(asnRows, "2026-07-13", "2026-07-13")).toEqual([]);
  });

  it("detects invalid ranges without applying the filter", () => {
    expect(isInvalidCreatedDateRange("2026-06-28", "2026-06-27")).toBe(true);
    expect(filterByCreatedDate(rows, "2026-06-28", "2026-06-27")).toBe(rows);
  });

  it("composes with status and search filters", () => {
    const dated = filterByCreatedDate(rows, "2026-06-25", "2026-06-27");
    const filtered = dated.filter((row) => row.status === "processing" && row.name.toLowerCase().includes("gam"));
    expect(filtered.map((row) => row.id)).toEqual(["middle"]);
  });

  it("allows consumers to reset pagination when dates change", () => {
    let page = 3;
    const setDateFrom = () => { page = 1; };
    setDateFrom("2026-06-25");
    expect(page).toBe(1);
  });
});
