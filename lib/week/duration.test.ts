import { describe, expect, it } from "vitest";
import { MAX_MINUTES, formatMinutes, parseDuration } from "./duration";

// The duration parser is the single source of truth for "what does typing X
// into a Cell mean" (ARCHITECTURE §2/§6). #10 adds more edge cases; the full
// rule is exercised here.

describe("parseDuration — the accepted format matrix", () => {
  it.each([
    ["1.5", 90], // decimal hours
    [".5", 30], // decimal hours, leading dot
    ["1:30", 90], // h:mm
    ["0:45", 45], // h:mm, zero hours
    [":45", 45], // minutes only
    ["90m", 90], // explicit minutes
    ["1h30", 90], // h + mm
    ["1h", 60], // whole hours
    ["1.5h", 90], // decimal hours + h suffix
    ["2:05", 125], // h:mm keeps a leading-zero minute
  ])("parses %s → %i minutes", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });
});

describe("parseDuration — the bare-integer ≥16 heuristic", () => {
  it("reads a bare integer ≥ 16 as MINUTES", () => {
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("16")).toBe(16);
  });
  it("reads a bare integer < 16 as HOURS", () => {
    expect(parseDuration("8")).toBe(480);
    expect(parseDuration("15")).toBe(900);
  });
});

describe("parseDuration — clear vs invalid", () => {
  it("treats empty / whitespace / 0 as 0 (clear)", () => {
    expect(parseDuration("")).toBe(0);
    expect(parseDuration("   ")).toBe(0);
    expect(parseDuration("0")).toBe(0);
  });
  it("returns null for unparseable input", () => {
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("1.2.3")).toBeNull();
    expect(parseDuration("h")).toBeNull();
    expect(parseDuration("1:60:00")).toBeNull();
  });
});

describe("parseDuration — clamping", () => {
  it("clamps a huge value to the Xero ceiling", () => {
    expect(parseDuration("100000m")).toBe(MAX_MINUTES);
  });
  it("trims surrounding whitespace and is case-insensitive", () => {
    expect(parseDuration("  90M ")).toBe(90);
    expect(parseDuration(" 1H30 ")).toBe(90);
  });
});

describe("formatMinutes", () => {
  it("renders integer minutes as decimal hours", () => {
    expect(formatMinutes(90)).toBe("1.5");
    expect(formatMinutes(480)).toBe("8");
    expect(formatMinutes(0)).toBe("0");
  });
});
