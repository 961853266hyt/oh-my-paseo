import { useCallback, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { PressHighlight } from "@/components/ui/press-highlight";
import { isWeb } from "@/constants/platform";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { chooseAgentSwitcherSession, stepAgentSwitcherFromKeyboard } from "./switcher";
import {
  AgentSwitcherRowContent,
  rowProject,
  type AgentSwitcherProject,
  type AgentSwitcherRow,
} from "./rows";
import {
  WHEEL_VISIBLE_DISTANCE,
  wheelOffset,
  wheelRowLayout,
  wrappedAround,
  type AgentSwitcherWheelStyle,
} from "./wheel-layout";

const SELECTED_STATE = { selected: true } as const;
const UNSELECTED_STATE = { selected: false } as const;

// Each style's stage, and the height of the row at its centre.
const WHEEL_WIDTH = 560;
const WHEEL_HEIGHT = 300;
const WHEEL_ROW_HEIGHT = 56;
const WHEEL_LENS_HEIGHT = 64;
const FOCUS_WIDTH = 600;
const FOCUS_HEIGHT = 500;
const FOCUS_CARD_HEIGHT = 76;
const DEPTH_WIDTH = 600;
const DEPTH_HEIGHT = 360;
const DEPTH_CARD_HEIGHT = 80;

/** Trackpad and mouse-wheel travel that turns the wheel one row, and the fastest it turns. */
const SCROLL_STEP_DELTA = 45;
const SCROLL_STEP_INTERVAL_MS = 70;
/** How a row glides to its next place; web only, where CSS animates it. */
const ROW_TRANSITION = {
  transitionProperty: "transform, filter, opacity",
  transitionDuration: "320ms",
  transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
};

/**
 * The switcher drawn as a wheel at the centre of the screen: the selection sits large and sharp in
 * the middle, the sessions around it recede above and below, and the list loops, so the last
 * session sits just above the first.
 */
export function AgentSwitcherWheel({
  scopeRef,
  wheelStyle,
  rows,
  projectsByWorkspace,
  selectedIndex,
}: {
  /** Marks the stage as the switcher's overlay scope. */
  scopeRef: (node: unknown) => void;
  wheelStyle: AgentSwitcherWheelStyle;
  rows: readonly AgentSwitcherRow[];
  projectsByWorkspace: ReadonlyMap<string, AgentSwitcherProject>;
  selectedIndex: number;
}) {
  const animate = !useReducedMotion();
  useScrollToTurn();
  return (
    <View style={styles.overlay}>
      <View style={styles.backdrop} />
      {/* The modal focuses its first focusable descendant; the stage takes it, as the list's
          panel does, so no row opens with a focus ring. */}
      <View ref={scopeRef} style={stageStyle(wheelStyle)} testID="agent-switcher" focusable>
        {wheelStyle === "wheel" ? <View style={styles.wheelLens} /> : null}
        {rows.map((row, index) => (
          <AgentSwitcherWheelRow
            key={row.key}
            wheelStyle={wheelStyle}
            row={row}
            project={rowProject(row, projectsByWorkspace)}
            index={index}
            offset={wheelOffset(index, selectedIndex, rows.length)}
            count={rows.length}
            animate={animate}
          />
        ))}
      </View>
    </View>
  );
}

function AgentSwitcherWheelRow({
  wheelStyle,
  row,
  project,
  index,
  offset,
  count,
  animate,
}: {
  wheelStyle: AgentSwitcherWheelStyle;
  row: AgentSwitcherRow;
  project: AgentSwitcherProject | null;
  index: number;
  offset: number;
  count: number;
  animate: boolean;
}) {
  // Clicking a row opens it. Unlike the list, hovering does not select: the wheel turns to bring
  // the selection to the middle, so selecting on hover would slide the next row under the
  // pointer and keep turning while the pointer travels toward its target.
  const choose = useCallback(() => chooseAgentSwitcherSession(index), [index]);

  const previousOffset = useRef(offset);
  const jumped = wrappedAround(previousOffset.current, offset, count);
  useEffect(() => {
    previousOffset.current = offset;
  }, [offset]);

  const hidden = Math.abs(offset) > WHEEL_VISIBLE_DISTANCE;
  const frameStyle = useMemo(() => {
    const layout = wheelRowLayout(wheelStyle, offset);
    const transform =
      wheelStyle === "wheel"
        ? [
            { perspective: 900 },
            { translateY: layout.translateY },
            { rotateX: `${layout.rotateX}deg` },
            { scale: layout.scale },
          ]
        : [{ translateY: layout.translateY }, { scale: layout.scale }];
    return [
      rowFrameStyle(wheelStyle),
      inlineUnistylesStyle({
        transform,
        opacity: layout.opacity,
        zIndex: layout.zIndex,
        ...(isWeb ? { filter: `blur(${layout.blur}px) brightness(${layout.brightness})` } : null),
        // A row that went around the back jumps; sweeping it across the selection would read as
        // the wheel spinning the wrong way.
        ...(isWeb && animate && !jumped ? ROW_TRANSITION : null),
      }),
    ];
  }, [animate, jumped, offset, wheelStyle]);

  const selected = offset === 0;
  return (
    // As in the list, a click made while the shortcut's modifier is held only reaches pointerdown.
    <View
      style={frameStyle}
      onPointerDown={choose}
      pointerEvents={hidden ? "none" : "auto"}
      aria-hidden={hidden}
    >
      <PressHighlight
        testID={`agent-switcher-row-${row.key}`}
        accessibilityRole="button"
        accessibilityState={selected ? SELECTED_STATE : UNSELECTED_STATE}
        onPress={choose}
        style={wheelStyle === "wheel" ? styles.wheelRow : styles.card}
      >
        <AgentSwitcherRowContent
          row={row}
          project={project}
          large={wheelStyle !== "wheel"}
          onSurface2={wheelStyle === "wheel" && selected}
        />
      </PressHighlight>
    </View>
  );
}

/** Scrolling on a trackpad or with a mouse wheel turns the wheel, a row per notch. */
function useScrollToTurn() {
  useEffect(() => {
    if (!isWeb) {
      return undefined;
    }
    let pending = 0;
    let lastStepAt = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      pending += event.deltaY;
      const now = performance.now();
      if (Math.abs(pending) < SCROLL_STEP_DELTA || now - lastStepAt < SCROLL_STEP_INTERVAL_MS) {
        return;
      }
      // While the switcher is open this only moves the selection.
      stepAgentSwitcherFromKeyboard(pending > 0 ? 1 : -1);
      pending = 0;
      lastStepAt = now;
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);
}

const styles = StyleSheet.create((theme) => {
  const centredRow = (stageHeight: number, rowHeight: number, inset: number) =>
    ({
      position: "absolute",
      left: inset,
      right: inset,
      top: (stageHeight - rowHeight) / 2,
      height: rowHeight,
    }) as const;
  return {
    overlay: { flex: 1, justifyContent: "center", alignItems: "center" },
    // Darker than the list's backdrop to keep the eye on the wheel. Not blurred: a full-screen
    // backdrop blur over a streaming chat is redrawn every frame and froze the page in testing.
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.42)" },
    // The wheel is a card the rows turn inside; the stacks float free over the backdrop.
    stageWheel: {
      width: WHEEL_WIDTH,
      maxWidth: "92%",
      height: WHEEL_HEIGHT,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius["2xl"],
      backgroundColor: theme.colors.surface0,
      outlineWidth: 0,
      ...theme.shadow.lg,
    },
    stageFocus: { width: FOCUS_WIDTH, maxWidth: "92%", height: FOCUS_HEIGHT, outlineWidth: 0 },
    stageDepth: { width: DEPTH_WIDTH, maxWidth: "92%", height: DEPTH_HEIGHT, outlineWidth: 0 },
    // The band the selection turns into, in the list's selected-row fill.
    wheelLens: {
      ...centredRow(WHEEL_HEIGHT, WHEEL_LENS_HEIGHT, theme.spacing[2]),
      borderRadius: theme.borderRadius.xl,
      backgroundColor: theme.colors.surface2,
    },
    frameWheel: centredRow(WHEEL_HEIGHT, WHEEL_ROW_HEIGHT, theme.spacing[3]),
    frameFocus: centredRow(FOCUS_HEIGHT, FOCUS_CARD_HEIGHT, 0),
    frameDepth: centredRow(DEPTH_HEIGHT, DEPTH_CARD_HEIGHT, 0),
    wheelRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing[3],
      paddingHorizontal: theme.spacing[4],
    },
    card: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing[4],
      paddingHorizontal: theme.spacing[6],
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius["2xl"],
      backgroundColor: theme.colors.surface0,
      ...theme.shadow.lg,
    },
  };
});

function stageStyle(wheelStyle: AgentSwitcherWheelStyle) {
  if (wheelStyle === "wheel") return styles.stageWheel;
  return wheelStyle === "focus" ? styles.stageFocus : styles.stageDepth;
}

function rowFrameStyle(wheelStyle: AgentSwitcherWheelStyle) {
  if (wheelStyle === "wheel") return styles.frameWheel;
  return wheelStyle === "focus" ? styles.frameFocus : styles.frameDepth;
}
