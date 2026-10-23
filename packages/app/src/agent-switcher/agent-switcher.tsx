import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { PressHighlight } from "@/components/ui/press-highlight";
import { isWeb } from "@/constants/platform";
import { useAppSettings } from "@/hooks/use-settings";
import {
  OverlayLayerProvider,
  useGlobalWebOverlayLayer,
  useWebOverlayRegistration,
} from "@/lib/overlay-root";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import {
  cancelAgentSwitcher,
  chooseAgentSwitcherSession,
  handleAgentSwitcherKey,
  highlightAgentSwitcherSession,
} from "./switcher";
import type { AgentSwitcherEntry } from "./model";
import {
  AgentSwitcherRowContent,
  buildAgentSwitcherRows,
  rowProject,
  useWorkspaceProjects,
  type AgentSwitcherProject,
  type AgentSwitcherRow,
} from "./rows";
import { AgentSwitcherWheel } from "./wheel";

// A quick press and release switches without the list ever showing, as with Cmd+Tab.
const AGENT_SWITCHER_SHOW_DELAY_MS = 150;
const SELECTED_STATE = { selected: true } as const;
const UNSELECTED_STATE = { selected: false } as const;

export function AgentSwitcher() {
  const { t } = useTranslation();
  const {
    settings: { agentSwitcher: preferences },
  } = useAppSettings();
  const switcher = useKeyboardShortcutsStore((state) => state.agentSwitcher);
  const sessions = switcher.status === "open" ? switcher.sessions : null;
  const projectsByWorkspace = useWorkspaceProjects(sessions !== null);
  const [shownSessions, setShownSessions] = useState<readonly AgentSwitcherEntry[] | null>(null);

  useEffect(() => {
    if (!sessions) {
      return;
    }
    const timer = setTimeout(() => setShownSessions(sessions), AGENT_SWITCHER_SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sessions]);

  // A snapshot of the sessions it opened with, so the list does not follow the hot session store.
  const rows = useMemo(() => (sessions ? buildAgentSwitcherRows(sessions, t) : []), [sessions, t]);

  // It opens over whatever is on screen, a dialog or menu included. Registering as the top overlay
  // stops that overlay pulling focus back from this modal's own focus trap, a tug of war that
  // froze the page. It leaves focus alone, so Tab still reaches the switcher's shortcut.
  const visible = switcher.status === "open" && shownSessions === switcher.sessions;
  const overlayLayer = useGlobalWebOverlayLayer("modal", isWeb && visible);
  const handleOverlayKey = useCallback((event: KeyboardEvent) => {
    if (!handleAgentSwitcherKey(event.key)) {
      return false;
    }
    event.preventDefault();
    return true;
  }, []);
  const setOverlayScope = useWebOverlayRegistration({
    active: isWeb && visible,
    layer: overlayLayer,
    onKeyDown: handleOverlayKey,
    manageFocus: false,
  });

  if (!visible) {
    return null;
  }
  return (
    <OverlayLayerProvider layer={isWeb ? overlayLayer : 0}>
      <Modal visible transparent animationType="none" onRequestClose={cancelAgentSwitcher}>
        {preferences.style === "list" ? (
          <View style={styles.overlay}>
            <View style={styles.backdrop} />
            {/* The modal focuses its first focusable descendant. Without a focusable panel that is
              the first row, and a keyboard-opened list draws the focus ring around it. */}
            <View ref={setOverlayScope} style={styles.panel} testID="agent-switcher" focusable>
              {rows.map((row, index) => (
                <AgentSwitcherListRow
                  key={row.key}
                  row={row}
                  project={rowProject(row, projectsByWorkspace)}
                  index={index}
                  selected={index === switcher.index}
                />
              ))}
            </View>
          </View>
        ) : (
          <AgentSwitcherWheel
            scopeRef={setOverlayScope}
            wheelStyle={preferences.style}
            rows={rows}
            projectsByWorkspace={projectsByWorkspace}
            selectedIndex={switcher.index}
          />
        )}
      </Modal>
    </OverlayLayerProvider>
  );
}

function AgentSwitcherListRow({
  row,
  project,
  index,
  selected,
}: {
  row: AgentSwitcherRow;
  project: AgentSwitcherProject | null;
  index: number;
  selected: boolean;
}) {
  const choose = useCallback(() => chooseAgentSwitcherSession(index), [index]);
  // Like Cmd+Tab, moving the pointer over a row selects it and releasing the modifier opens it.
  // Movement, not entry: a list that opens under a resting pointer keeps the keyboard's choice.
  const highlight = useCallback(() => highlightAgentSwitcherSession(index), [index]);
  return (
    // react-native-web drops onPress for Alt-clicks and macOS turns Ctrl-click into a right click,
    // so a click made while the shortcut's modifier is still held only reaches pointerdown.
    <View style={styles.rowHoverTarget} onPointerMove={highlight} onPointerDown={choose}>
      <PressHighlight
        testID={`agent-switcher-row-${row.key}`}
        accessibilityRole="button"
        accessibilityState={selected ? SELECTED_STATE : UNSELECTED_STATE}
        onPress={choose}
        style={selected ? styles.selectedRow : styles.row}
      >
        <AgentSwitcherRowContent row={row} project={project} onSurface2={selected} />
      </PressHighlight>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: theme.spacing[12],
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.3)" },
  panel: {
    width: 440,
    maxWidth: "92%",
    maxHeight: "80%",
    paddingVertical: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
    backgroundColor: theme.colors.surface0,
    outlineWidth: 0,
    ...theme.shadow.lg,
  },
  rowHoverTarget: { position: "relative" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface2,
  },
}));
