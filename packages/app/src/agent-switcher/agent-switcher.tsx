import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AgentStatusDot } from "@/components/agent-status-dot";
import { ProjectIconView } from "@/components/project-icon-view";
import { PressHighlight } from "@/components/ui/press-highlight";
import { useProjects } from "@/hooks/use-projects";
import { createProjectIconTarget } from "@/projects/icon-target";
import { useProjectIcons } from "@/projects/icons";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import type { RecentAgentSession } from "@/stores/recent-agent-sessions/store";
import { useSessionStore } from "@/stores/session-store";
import { projectIconPlaceholderLabelFromDisplayName } from "@/utils/project-display-name";
import { shortenPath } from "@/utils/shorten-path";
import {
  cancelAgentSwitcher,
  chooseAgentSwitcherSession,
  highlightAgentSwitcherSession,
} from "./switcher";

// A quick press and release switches without the list ever showing, as with Cmd+Tab.
const AGENT_SWITCHER_SHOW_DELAY_MS = 150;
const SELECTED_STATE = { selected: true } as const;
const UNSELECTED_STATE = { selected: false } as const;

interface AgentSwitcherRow {
  key: string;
  title: string;
  subtitle: string;
  /** `serverId:workspaceId` of the session's workspace, when it has one. */
  workspaceKey: string | null;
  status: string | null;
  requiresAttention: boolean;
}

function buildRows(sessions: readonly RecentAgentSession[], untitled: string): AgentSwitcherRow[] {
  const hosts = useSessionStore.getState().sessions;
  return sessions.map(({ serverId, agentId }) => {
    const session = hosts[serverId];
    const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
    const workspace = agent?.workspaceId ? session?.workspaces.get(agent.workspaceId) : undefined;
    return {
      key: `${serverId}:${agentId}`,
      title: agent?.title || untitled,
      subtitle: (workspace?.title ?? workspace?.name) || (agent ? shortenPath(agent.cwd) : ""),
      workspaceKey: workspace ? `${serverId}:${workspace.id}` : null,
      status: agent?.status ?? null,
      requiresAttention: Boolean(agent?.requiresAttention),
    };
  });
}

interface AgentSwitcherProject {
  viewKey: string;
  name: string;
  iconDataUri: string | null;
}

/** Each workspace's project, keyed `serverId:workspaceId`, for the icon the sidebar shows it with. */
function useWorkspaceProjects(open: boolean): ReadonlyMap<string, AgentSwitcherProject> {
  const { projects } = useProjects({ enabled: open });
  const iconTargets = useMemo(
    () =>
      projects.flatMap((project) =>
        project.hosts.flatMap((host) => {
          const target = createProjectIconTarget({
            projectViewKey: project.viewKey,
            placement: { ...host, iconWorkingDir: host.repoRoot },
          });
          return target ? [target] : [];
        }),
      ),
    [projects],
  );
  const iconDataByProjectViewKey = useProjectIcons({ projects: iconTargets });

  return useMemo(() => {
    const byWorkspace = new Map<string, AgentSwitcherProject>();
    for (const project of projects) {
      const entry = {
        viewKey: project.viewKey,
        name: project.projectName,
        iconDataUri: iconDataByProjectViewKey.get(project.viewKey) ?? null,
      };
      for (const host of project.hosts) {
        for (const workspace of host.workspaces) {
          byWorkspace.set(`${host.serverId}:${workspace.id}`, entry);
        }
      }
    }
    return byWorkspace;
  }, [iconDataByProjectViewKey, projects]);
}

export function AgentSwitcher() {
  const { t } = useTranslation();
  const switcher = useKeyboardShortcutsStore((state) => state.agentSwitcher);
  const sessions = switcher.status === "open" ? switcher.sessions : null;
  const projectsByWorkspace = useWorkspaceProjects(sessions !== null);
  const [shownSessions, setShownSessions] = useState<readonly RecentAgentSession[] | null>(null);

  useEffect(() => {
    if (!sessions) {
      return;
    }
    const timer = setTimeout(() => setShownSessions(sessions), AGENT_SWITCHER_SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sessions]);

  // A snapshot of the sessions it opened with, so the list does not follow the hot session store.
  const rows = useMemo(
    () => (sessions ? buildRows(sessions, t("shell.commandCenter.newAgent")) : []),
    [sessions, t],
  );

  if (switcher.status !== "open" || shownSessions !== switcher.sessions) {
    return null;
  }
  return (
    <Modal visible transparent animationType="none" onRequestClose={cancelAgentSwitcher}>
      <View style={styles.overlay}>
        <View style={styles.backdrop} />
        {/* The modal focuses its first focusable descendant. Without a focusable panel that is the
            first row, and a keyboard-opened list draws the focus ring around it. */}
        <View style={styles.panel} testID="agent-switcher" focusable>
          {rows.map((row, index) => (
            <AgentSwitcherRowItem
              key={row.key}
              row={row}
              project={
                row.workspaceKey ? (projectsByWorkspace.get(row.workspaceKey) ?? null) : null
              }
              index={index}
              selected={index === switcher.index}
            />
          ))}
        </View>
      </View>
    </Modal>
  );
}

function AgentSwitcherRowItem({
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
        <View style={styles.iconSlot}>
          <AgentStatusDot
            status={row.status}
            requiresAttention={row.requiresAttention}
            showInactive
          />
        </View>
        <View style={styles.textContent}>
          <Text style={styles.title} numberOfLines={1}>
            {row.title}
          </Text>
          <View style={styles.subtitleLine}>
            {project ? (
              // Decorative: the fallback icon's initial must not prefix the row's accessible name.
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                aria-hidden
              >
                <WorkspaceProjectIcon project={project} />
              </View>
            ) : null}
            <Text style={styles.subtitle} numberOfLines={1}>
              {row.subtitle}
            </Text>
          </View>
        </View>
      </PressHighlight>
    </View>
  );
}

/** The same project icon the sidebar's workspace rows lead with: its image, or a lettered square. */
function WorkspaceProjectIcon({ project }: { project: AgentSwitcherProject }) {
  const initial = projectIconPlaceholderLabelFromDisplayName(project.name).charAt(0).toUpperCase();
  return (
    <ProjectIconView
      iconDataUri={project.iconDataUri}
      initial={initial}
      projectViewKey={project.viewKey}
      size={16}
      textStyle={styles.projectIconFallbackText}
    />
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
    alignItems: "flex-start",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface2,
  },
  iconSlot: { paddingTop: theme.spacing[1] },
  textContent: { flex: 1, minWidth: 0 },
  title: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
  subtitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    minWidth: 0,
  },
  subtitle: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  projectIconFallbackText: { fontSize: 9 },
}));
