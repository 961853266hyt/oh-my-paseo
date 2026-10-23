import { describe, expect, it } from "vitest";
import { wheelOffset, wheelRowLayout, wrappedAround } from "./wheel-layout";

describe("wheel offset", () => {
  it("counts rows after the selection as below it and rows before it as above", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((position) => wheelOffset(position, 3, 7))).toEqual([
      -3, -2, -1, 0, 1, 2, 3,
    ]);
  });

  it("goes around the loop, so the last session sits just above the first", () => {
    expect(wheelOffset(9, 0, 10)).toBe(-1);
    expect(wheelOffset(0, 9, 10)).toBe(1);
  });

  it("shows each session once when there are fewer than the wheel holds, the extra one below", () => {
    expect([0, 1, 2, 3].map((position) => wheelOffset(position, 1, 4))).toEqual([-1, 0, 1, 2]);
  });
});

describe("wheel row layout", () => {
  it("keeps the selection in place, sharp and in front", () => {
    for (const style of ["wheel", "focus", "depth"] as const) {
      const layout = wheelRowLayout(style, 0);
      expect(layout).toMatchObject({ translateY: 0, rotateX: 0, blur: 0, opacity: 1 });
      expect(layout.zIndex).toBeGreaterThan(wheelRowLayout(style, 1).zIndex);
    }
  });

  it("moves rows away from the selection and blurs and fades them more with distance", () => {
    const fade = (layout: ReturnType<typeof wheelRowLayout>) => layout.opacity * layout.brightness;
    for (const style of ["wheel", "focus", "depth"] as const) {
      const near = wheelRowLayout(style, 1);
      const far = wheelRowLayout(style, 2);
      expect(near.translateY).toBeGreaterThan(0);
      expect(far.translateY).toBeGreaterThan(near.translateY);
      expect(far.blur).toBeGreaterThan(near.blur);
      expect(fade(far)).toBeLessThan(fade(near));
      expect(wheelRowLayout(style, -1).translateY).toBe(-near.translateY);
    }
  });

  it("keeps the stacks' cards opaque, so the app behind does not show through them", () => {
    for (const style of ["focus", "depth"] as const) {
      expect(wheelRowLayout(style, 1).opacity).toBe(1);
      expect(wheelRowLayout(style, 2).opacity).toBe(1);
    }
  });

  it("tilts only the wheel's rows, away from the selection", () => {
    expect(wheelRowLayout("wheel", -1).rotateX).toBe(21);
    expect(wheelRowLayout("wheel", 1).rotateX).toBe(-21);
    expect(wheelRowLayout("focus", 1).rotateX).toBe(0);
  });

  it("hides rows beyond the third", () => {
    expect(wheelRowLayout("focus", 4).opacity).toBe(0);
    expect(wheelRowLayout("focus", -4).translateY).toBe(wheelRowLayout("focus", -3).translateY);
  });
});

describe("wrapped around", () => {
  it("tells a step along the wheel from a jump around its back", () => {
    expect(wrappedAround(1, 0, 10)).toBe(false);
    expect(wrappedAround(-1, 2, 4)).toBe(true);
    expect(wrappedAround(-5, 5, 10)).toBe(true);
  });
});
