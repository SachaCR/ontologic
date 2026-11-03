import { describe, it, expect } from "vitest";

import { colorsEnabled, emitterPaint, receiverPaint } from "../colors";

describe("colorsEnabled", () => {
  it("colors a terminal", () => {
    expect(colorsEnabled({ isTTY: true }, {})).toBe(true);
  });

  it("does not color a pipe", () => {
    expect(colorsEnabled({ isTTY: false }, {})).toBe(false);
  });

  it("honours NO_COLOR on a terminal", () => {
    expect(colorsEnabled({ isTTY: true }, { NO_COLOR: "1" })).toBe(false);
  });

  it("honours FORCE_COLOR in a pipe", () => {
    expect(colorsEnabled({ isTTY: false }, { FORCE_COLOR: "1" })).toBe(true);
  });
});

describe("paints", () => {
  it("leaves the text alone when colors are off", () => {
    expect(emitterPaint(0, false)("hello")).toBe("hello");
  });

  it("wraps the text in its color when colors are on", () => {
    expect(emitterPaint(0, true)("hello")).toBe("\u001b[36mhello\u001b[0m");
  });

  it("gives each emitter its own color", () => {
    const colors = new Set([0, 1, 2].map((i) => emitterPaint(i, true)("x")));

    expect(colors.size).toBe(3);
  });

  it("gives each receiver its own color", () => {
    const colors = new Set([0, 1, 2].map((i) => receiverPaint(i, true)("x")));

    expect(colors.size).toBe(3);
  });
});
