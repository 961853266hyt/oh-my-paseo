import { useCallback, useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Modal, Text, View, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ProjectIconView, projectIconRadius } from "@/components/project-icon-view";
import { PressHighlight } from "@/components/ui/press-highlight";
import { useProjects } from "@/hooks/use-projects";
import { getStatusBucketLabel } from "@/hooks/sidebar-status-view-model";
import { useCompactTimeAgo } from "@/hooks/use-time-ago";
import { createProjectIconTarget } from "@/projects/icon-target";
import { useProjectIcons } from "@/projects/icons";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { useSessionStore, type Agent } from "@/stores/session-store";
import {
  projectDisplayNameFromProjectId,
  projectIconPlaceholderLabelFromDisplayName,
} from "@/utils/project-display-name";
import { shortenPath } from "@/utils/shorten-path";
import { deriveSidebarStateBucket, type SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { getStatusDotColor } from "@/utils/status-dot-color";
import { workspaceAgentStatus } from "@/utils/workspace-agent-activity";
import {
  cancelAgentSwitcher,
  chooseAgentSwitcherSession,
  highlightAgentSwitcherSession,
} from "./switcher";
import type { AgentSwitcherEntry } from "./model";

// A quick press and release switches without the list ever showing, as with Cmd+Tab.
const AGENT_SWITCHER_SHOW_DELAY_MS = 150;
const SELECTED_STATE = { selected: true } as const;
const UNSELECTED_STATE = { selected: false } as const;
const PROJECT_ICON_SIZE = 28;
const STATUS_DOT_SIZE = 8;
const STATUS_DOT_RING = 2;

interface AgentSwitcherProject {
  viewKey: string;
  name: string;
  iconDataUri: string | null;
}

interface AgentSwitcherRow {
  key: string;
  title: string;
  subtitle: string;
  /** `serverId:workspaceId` of the session's workspace, when it has one. */
  workspaceKey: string | null;
  /** Stands in for the project of a session outside any workspace: a lettered square for its folder. */
  folderProject: AgentSwitcherProject | null;
  statusBucket: SidebarStateBucket | null;
  statusLabel: string | null;
  /** When it was last viewed or last active, by the switcher's order; null shows no time. */
  at: number | null;
}

/** The state the sidebar shows the session in, permission requests included. */
function agentStatusBucket(agent: Agent): SidebarStateBucket {
  return deriveSidebarStateBucket({
    status: workspaceAgentStatus(agent),
    pendingPermissionCount: agent.pendingPermissions.length,
    requiresAttention: Boolean(agent.requiresAttention),
    attentionReason: agent.attentionReason ?? null,
  });
}

function buildRows(sessions: readonly AgentSwitcherEntry[], t: TFunction): AgentSwitcherRow[] {
  const hosts = useSessionStore.getState().sessions;
  return sessions.map(({ serverId, agentId, at }) => {
    const session = hosts[serverId];
    const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
    const workspace = agent?.workspaceId ? session?.workspaces.get(agent.workspaceId) : undefined;
    const statusBucket = agent ? agentStatusBucket(agent) : null;
    return {
      key: `${serverId}:${agentId}`,
      title: agent?.title || t("shell.commandCenter.newAgent"),
      subtitle: (workspace?.title ?? workspace?.name) || (agent ? shortenPath(agent.cwd) : ""),
      workspaceKey: workspace ? `${serverId}:${workspace.id}` : null,
      folderProject: agent
        ? {
            viewKey: agent.cwd,
            name: projectDisplayNameFromProjectId(agent.cwd),
            iconDataUri: null,
          }
        : null,
      statusBucket,
      statusLabel: statusBucket ? getStatusBucketLabel(statusBucket, t) : null,
      at,
    };
  });
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
  const [shownSessions, setShownSessions] = useState<readonly AgentSwitcherEntry[] | null>(null);

  useEffect(() => {
    if (!sessions) {
      return;
    }
    const timer = setTimeout(() => setShownSessions(sessions), AGENT_SWITCHER_SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sessions]);

  // A snapshot of the sessions it opened with, so the list does not follow the hot session store.
  const rows = useMemo(() => (sessions ? buildRows(sessions, t) : []), [sessions, t]);

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
                (row.workspaceKey ? projectsByWorkspace.get(row.workspaceKey) : undefined) ??
                row.folderProject
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
        <ProjectIconWithStatus project={project} row={row} selected={selected} />
        <View style={styles.textContent}>
          <Text style={styles.title} numberOfLines={1}>
            {row.title}
          </Text>
          <View style={styles.subtitleLine}>
            <Text style={styles.subtitle} numberOfLines={1}>
              {row.subtitle}
            </Text>
            {/* Its own text, so a long workspace name truncates before the status does. */}
            {row.statusLabel ? (
              <Text style={styles.status} numberOfLines={1} testID="agent-switcher-status-label">
                {row.subtitle ? `\u00a0· ${row.statusLabel}` : row.statusLabel}
              </Text>
            ) : null}
          </View>
        </View>
        {row.at === null ? null : <AgentSwitcherTimestamp at={row.at} />}
      </PressHighlight>
    </View>
  );
}

/**
 * Its own component so the clock stops here, as with the sidebar's timestamps: a tick re-renders
 * this one `<Text>`, not the row.
 */
function AgentSwitcherTimestamp({ at }: { at: number }) {
  const date = useMemo(() => new Date(at), [at]);
  const label = useCompactTimeAgo(date);
  return (
    <Text style={styles.timestamp} numberOfLines={1} testID="agent-switcher-timestamp">
      {label}
    </Text>
  );
}

/**
 * The project icon the sidebar shows the session's workspace with, its image or a lettered square,
 * leading the row as an app's icon leads Cmd+Tab. As on the sidebar's project icon, the session's
 * status hangs off its bottom-right corner in color, and a finished session shows none.
 */
function ProjectIconWithStatus({
  project,
  row,
  selected,
}: {
  project: AgentSwitcherProject | null;
  row: AgentSwitcherRow;
  selected: boolean;
}) {
  const dotColorStyle = row.statusBucket ? getStatusDotColorStyle(row.statusBucket) : null;
  const badgeStyle = useMemo(
    () => [selected ? styles.statusBadgeOnSelected : styles.statusBadge, dotColorStyle],
    [dotColorStyle, selected],
  );
  const initial = project
    ? projectIconPlaceholderLabelFromDisplayName(project.name).charAt(0).toUpperCase()
    : "";
  return (
    <View style={styles.iconBox}>
      {/* Decorative: the fallback icon's initial must not prefix the row's accessible name. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        {project ? (
          <ProjectIconView
            iconDataUri={project.iconDataUri}
            initial={initial}
            projectViewKey={project.viewKey}
            size={PROJECT_ICON_SIZE}
            textStyle={styles.projectIconFallbackText}
          />
        ) : (
          <View style={styles.iconPlaceholder} />
        )}
      </View>
      {dotColorStyle ? <View style={badgeStyle} testID="agent-switcher-status" /> : null}
    </View>
  );
}

/** The badge's fill for each state the sidebar colors; a finished session gets no badge. */
function getStatusDotColorStyle(bucket: SidebarStateBucket): ViewStyle | null {
  if (bucket === "needs_input") return styles.statusDotNeedsInput;
  if (bucket === "failed") return styles.statusDotFailed;
  if (bucket === "running") return styles.statusDotRunning;
  if (bucket === "attention") return styles.statusDotAttention;
  return null;
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
  iconBox: { position: "relative", width: PROJECT_ICON_SIZE, height: PROJECT_ICON_SIZE },
  iconPlaceholder: {
    width: PROJECT_ICON_SIZE,
    height: PROJECT_ICON_SIZE,
    borderRadius: projectIconRadius(PROJECT_ICON_SIZE),
    backgroundColor: theme.colors.surface2,
  },
  // A ring in the row's own color cuts the dot out of the icon behind it.
  statusBadge: {
    position: "absolute",
    right: -STATUS_DOT_RING - 1,
    bottom: -STATUS_DOT_RING - 1,
    width: STATUS_DOT_SIZE + STATUS_DOT_RING * 2,
    height: STATUS_DOT_SIZE + STATUS_DOT_RING * 2,
    borderRadius: theme.borderRadius.full,
    borderWidth: STATUS_DOT_RING,
    borderColor: theme.colors.surface0,
  },
  // From the one bucket-to-color map, so these dots cannot drift from the sidebar's.
  statusDotNeedsInput: {
    backgroundColor: getStatusDotColor({ theme, bucket: "needs_input" }) ?? undefined,
  },
  statusDotFailed: { backgroundColor: getStatusDotColor({ theme, bucket: "failed" }) ?? undefined },
  statusDotRunning: {
    backgroundColor: getStatusDotColor({ theme, bucket: "running" }) ?? undefined,
  },
  statusDotAttention: {
    backgroundColor: getStatusDotColor({ theme, bucket: "attention" }) ?? undefined,
  },
  statusBadgeOnSelected: {
    position: "absolute",
    right: -STATUS_DOT_RING - 1,
    bottom: -STATUS_DOT_RING - 1,
    width: STATUS_DOT_SIZE + STATUS_DOT_RING * 2,
    height: STATUS_DOT_SIZE + STATUS_DOT_RING * 2,
    borderRadius: theme.borderRadius.full,
    borderWidth: STATUS_DOT_RING,
    borderColor: theme.colors.surface2,
  },
  textContent: { flex: 1, minWidth: 0 },
  title: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
  subtitleLine: { flexDirection: "row", minWidth: 0 },
  subtitle: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  status: { flexShrink: 0, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  timestamp: {
    flexShrink: 0,
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
  },
  projectIconFallbackText: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
}));
