import { describe, it, expect } from "vitest";
import { panelIndexAt } from "./slideshow";

const panels = [
  { start_ms: 0, end_ms: 5000 },
  { start_ms: 5000, end_ms: 12000 },
  { start_ms: 12000, end_ms: 20000 },
];

describe("panelIndexAt", () => {
  it("picks the panel covering the moment", () => {
    expect(panelIndexAt(panels, 0)).toBe(0);
    expect(panelIndexAt(panels, 4999)).toBe(0);
    expect(panelIndexAt(panels, 5000)).toBe(1);
    expect(panelIndexAt(panels, 11999)).toBe(1);
    expect(panelIndexAt(panels, 12000)).toBe(2);
  });

  it("holds the last panel past the end instead of going blank", () => {
    expect(panelIndexAt(panels, 20000)).toBe(2);
    expect(panelIndexAt(panels, 99999)).toBe(2);
  });

  it("holds the first panel before the start", () => {
    expect(panelIndexAt(panels, -1000)).toBe(0);
  });

  it("reports nothing to show when there are no panels", () => {
    expect(panelIndexAt([], 1000)).toBe(-1);
  });
});
