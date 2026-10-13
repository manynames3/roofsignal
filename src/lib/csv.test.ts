import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("CSV export", () => {
  it.each(["=HYPERLINK(\"https://example.com\")", "+1+1", "-1+1", "@SUM(A1)", "\tformula", "\rformula", "  =1+1"])("neutralizes spreadsheet formulas: %s", (value) => {
    expect(csvCell(value).startsWith("\"'")).toBe(true);
  });
  it("preserves text and escapes embedded quotes", () => {
    expect(csvCell('Jordan, "Lee"')).toBe('"Jordan, ""Lee"""');
    expect(csvCell("742 Oak Dr")).toBe('"742 Oak Dr"');
  });
});
