import type { AgentSwitcherStyle } from "./model";

export type AgentSwitcherWheelStyle = Exclude<AgentSwitcherStyle, "list">;

/** Rows up to this far from the selection show; further ones have faded out. */
export const WHEEL_VISIBLE_DISTANCE = 3;

/**
 * How far row `position` sits from the selected row, going around the loop. Ends meet, so the
 * last session sits just above the first. With an even count the row opposite the selection goes
 * below it, where the next press lands, so each session shows once.
 */
export function wheelOffset(position: number, selected: number, count: number): number {
  const ahead = (((position - selected) % count) + count) % count;
  return ahead > count / 2 ? ahead - count : ahead;
}

export interface WheelRowLayout {
  translateY: number;
  /** Tilt in degrees; only the wheel tilts its rows. */
  rotateX: number;
  scale: number;
  blur: number;
  opacity: number;
  brightness: number;
  zIndex: number;
}

// Each step is one row further from the selection, from the selection itself out to the last
// visible row.
interface WheelSteps {
  translateY: readonly number[];
  scale: readonly number[];
  blur: readonly number[];
  opacity: readonly number[];
  brightness: readonly number[];
}

/** The wheel: rows on a drum seen edge on, so each step tilts further away. */
const WHEEL_ROW_ANGLE = 21;
const WHEEL_RADIUS = 156;

// The stacks' cards float over the app, so they stay opaque and recede by dimming into the
// backdrop instead: a see-through card shows the app behind it, sharp, through its text.
const STEPS: Record<Exclude<AgentSwitcherWheelStyle, "wheel">, WheelSteps> = {
  // A flat stack: neighbours step down in size, focus and light.
  focus: {
    translateY: [0, 84, 150, 204],
    scale: [1, 0.86, 0.74, 0.64],
    blur: [0, 1.6, 3.6, 6],
    opacity: [1, 1, 1, 1],
    brightness: [1, 0.86, 0.72, 0.6],
  },
  // Cards tucked behind the selection, above and below it.
  depth: {
    translateY: [0, 52, 94, 126],
    scale: [1, 0.9, 0.8, 0.72],
    blur: [0, 2, 4.5, 7],
    opacity: [1, 1, 1, 1],
    brightness: [1, 0.88, 0.76, 0.66],
  },
};

const WHEEL_BLUR = [0, 1.2, 2.8, 4.5];
const WHEEL_OPACITY = [1, 0.72, 0.42, 0.16];

/** Where a row `offset` rows from the selection sits, and how much it recedes. */
export function wheelRowLayout(style: AgentSwitcherWheelStyle, offset: number): WheelRowLayout {
  const distance = Math.abs(offset);
  const step = Math.min(distance, WHEEL_VISIBLE_DISTANCE);
  const direction = Math.sign(offset);
  const hidden = distance > WHEEL_VISIBLE_DISTANCE;
  const zIndex = Math.max(0, 10 - distance);
  if (style === "wheel") {
    const angle = direction * step * WHEEL_ROW_ANGLE;
    return {
      translateY: Math.round(WHEEL_RADIUS * Math.sin((angle * Math.PI) / 180)),
      rotateX: angle === 0 ? 0 : -angle,
      scale: offset === 0 ? 1.06 : 1,
      blur: WHEEL_BLUR[step],
      opacity: hidden ? 0 : WHEEL_OPACITY[step],
      brightness: 1,
      zIndex,
    };
  }
  const steps = STEPS[style];
  return {
    translateY: direction * steps.translateY[step],
    rotateX: 0,
    scale: steps.scale[step],
    blur: steps.blur[step],
    opacity: hidden ? 0 : steps.opacity[step],
    brightness: steps.brightness[step],
    zIndex,
  };
}

/**
 * Whether a row went around the back of the wheel rather than stepping along it. It jumps
 * straight to its new place; animating it would sweep it across the selection.
 */
export function wrappedAround(previousOffset: number, offset: number, count: number): boolean {
  return Math.abs(offset - previousOffset) > count / 2;
}
