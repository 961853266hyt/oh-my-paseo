import { useMemo } from "react";
import type { TFunction } from "i18next";
import { Text, View, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ProjectIconView, projectIconRadius } from "@/components/project-icon-view";
import { useProjects } from "@/hooks/use-projects";
import { getStatusBucketLabel } from "@/hooks/sidebar-status-view-model";
import { useCompactTimeAgo } from "@/hooks/use-time-ago";
import { createProjectIconTarget } from "@/projects/icon-target";
import { useProjectIcons } from "@/projects/icons";
import { useSessionStore, type Agent } from "@/stores/session-store";
import {
  projectDisplayNameFromProjectId,
  projectIconPlaceholderLabelFromDisplayName,
} from "@/utils/project-display-name";
import { shortenPath } from "@/utils/shorten-path";
import { deriveSidebarStateBucket, type SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { getStatusDotColor } from "@/utils/status-dot-color";
import { workspaceAgentStatus } from "@/utils/workspace-agent-activity";
import type { AgentSwitcherEntry } from "./model";

const ICON_SIZE = 28;
const LARGE_ICON_SIZE = 36;
const STATUS_DOT_SIZE = 8;
const STATUS_DOT_RING = 2;

export interface AgentSwitcherProject {
  viewKey: string;
  name: string;
  iconDataUri: string | null;
}

export interface AgentSwitcherRow {
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

export function buildAgentSwitcherRows(
  sessions: readonly AgentSwitcherEntry[],
  t: TFunction,
): AgentSwitcherRow[] {
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
export function useWorkspaceProjects(open: boolean): ReadonlyMap<string, AgentSwitcherProject> {
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

/** The project a row's icon shows: its workspace's, or a stand-in for its folder. */
export function rowProject(
  row: AgentSwitcherRow,
  projectsByWorkspace: ReadonlyMap<string, AgentSwitcherProject>,
): AgentSwitcherProject | null {
  return (
    (row.workspaceKey ? projectsByWorkspace.get(row.workspaceKey) : undefined) ?? row.folderProject
  );
}

/**
 * What every switcher row shows, whatever the style: the project icon with the session's status,
 * its title, workspace and status, and when it was last viewed or active. `large` is for the
 * card styles; `onSurface2` says the row sits on the selected-row fill, for the status dot's ring.
 */
export function AgentSwitcherRowContent({
  row,
  project,
  large = false,
  onSurface2 = false,
}: {
  row: AgentSwitcherRow;
  project: AgentSwitcherProject | null;
  large?: boolean;
  onSurface2?: boolean;
}) {
  return (
    <>
      <ProjectIconWithStatus project={project} row={row} large={large} onSurface2={onSurface2} />
      <View style={styles.textContent}>
        <Text style={large ? styles.titleLarge : styles.title} numberOfLines={1}>
          {row.title}
        </Text>
        <View style={styles.subtitleLine}>
          <Text style={large ? styles.subtitleLarge : styles.subtitle} numberOfLines={1}>
            {row.subtitle}
          </Text>
          {/* Its own text, so a long workspace name truncates before the status does. */}
          {row.statusLabel ? (
            <Text
              style={large ? styles.statusLarge : styles.status}
              numberOfLines={1}
              testID="agent-switcher-status-label"
            >
              {row.subtitle ? ` · ${row.statusLabel}` : row.statusLabel}
            </Text>
          ) : null}
        </View>
      </View>
      {row.at === null ? null : <AgentSwitcherTimestamp at={row.at} large={large} />}
    </>
  );
}

/**
 * Its own component so the clock stops here, as with the sidebar's timestamps: a tick re-renders
 * this one `<Text>`, not the row.
 */
function AgentSwitcherTimestamp({ at, large }: { at: number; large: boolean }) {
  const date = useMemo(() => new Date(at), [at]);
  const label = useCompactTimeAgo(date);
  return (
    <Text
      style={large ? styles.timestampLarge : styles.timestamp}
      numberOfLines={1}
      testID="agent-switcher-timestamp"
    >
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
  large,
  onSurface2,
}: {
  project: AgentSwitcherProject | null;
  row: AgentSwitcherRow;
  large: boolean;
  onSurface2: boolean;
}) {
  const dotColorStyle = row.statusBucket ? getStatusDotColorStyle(row.statusBucket) : null;
  const badgeStyle = useMemo(
    () => [onSurface2 ? styles.statusBadgeOnSurface2 : styles.statusBadge, dotColorStyle],
    [dotColorStyle, onSurface2],
  );
  const initial = project
    ? projectIconPlaceholderLabelFromDisplayName(project.name).charAt(0).toUpperCase()
    : "";
  return (
    <View style={large ? styles.iconBoxLarge : styles.iconBox}>
      {/* Decorative: the fallback icon's initial must not prefix the row's accessible name. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        {project ? (
          <ProjectIconView
            iconDataUri={project.iconDataUri}
            initial={initial}
            projectViewKey={project.viewKey}
            size={large ? LARGE_ICON_SIZE : ICON_SIZE}
            textStyle={large ? styles.projectIconFallbackTextLarge : styles.projectIconFallbackText}
          />
        ) : (
          <View style={large ? styles.iconPlaceholderLarge : styles.iconPlaceholder} />
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

const styles = StyleSheet.create((theme) => {
  // A ring in the row's own color cuts the dot out of the icon behind it.
  const statusBadge = {
    position: "absolute",
    right: -STATUS_DOT_RING - 1,
    bottom: -STATUS_DOT_RING - 1,
    width: STATUS_DOT_SIZE + STATUS_DOT_RING * 2,
    height: STATUS_DOT_SIZE + STATUS_DOT_RING * 2,
    borderRadius: theme.borderRadius.full,
    borderWidth: STATUS_DOT_RING,
  } as const;
  const iconPlaceholder = (size: number) =>
    ({
      width: size,
      height: size,
      borderRadius: projectIconRadius(size),
      backgroundColor: theme.colors.surface2,
    }) as const;
  return {
    iconBox: { position: "relative", width: ICON_SIZE, height: ICON_SIZE },
    iconBoxLarge: { position: "relative", width: LARGE_ICON_SIZE, height: LARGE_ICON_SIZE },
    iconPlaceholder: iconPlaceholder(ICON_SIZE),
    iconPlaceholderLarge: iconPlaceholder(LARGE_ICON_SIZE),
    statusBadge: { ...statusBadge, borderColor: theme.colors.surface0 },
    statusBadgeOnSurface2: { ...statusBadge, borderColor: theme.colors.surface2 },
    // From the one bucket-to-color map, so these dots cannot drift from the sidebar's.
    statusDotNeedsInput: {
      backgroundColor: getStatusDotColor({ theme, bucket: "needs_input" }) ?? undefined,
    },
    statusDotFailed: {
      backgroundColor: getStatusDotColor({ theme, bucket: "failed" }) ?? undefined,
    },
    statusDotRunning: {
      backgroundColor: getStatusDotColor({ theme, bucket: "running" }) ?? undefined,
    },
    statusDotAttention: {
      backgroundColor: getStatusDotColor({ theme, bucket: "attention" }) ?? undefined,
    },
    textContent: { flex: 1, minWidth: 0 },
    title: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
    titleLarge: { color: theme.colors.foreground, fontSize: theme.fontSize.lg },
    subtitleLine: { flexDirection: "row", minWidth: 0 },
    subtitle: {
      flexShrink: 1,
      minWidth: 0,
      color: theme.colors.foregroundMuted,
      fontSize: theme.fontSize.sm,
    },
    subtitleLarge: {
      flexShrink: 1,
      minWidth: 0,
      color: theme.colors.foregroundMuted,
      fontSize: theme.fontSize.base,
    },
    status: { flexShrink: 0, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
    statusLarge: {
      flexShrink: 0,
      color: theme.colors.foregroundMuted,
      fontSize: theme.fontSize.base,
    },
    timestamp: {
      flexShrink: 0,
      color: theme.colors.foregroundExtraMuted,
      fontSize: theme.fontSize.sm,
    },
    timestampLarge: {
      flexShrink: 0,
      color: theme.colors.foregroundExtraMuted,
      fontSize: theme.fontSize.base,
    },
    projectIconFallbackText: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
    projectIconFallbackTextLarge: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.medium,
    },
  };
});
