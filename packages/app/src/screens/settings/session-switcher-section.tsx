import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { AgentSwitcherOrder } from "@/agent-switcher/model";
import { SettingsCard, SettingsSection, SettingsSelect } from "@/components/settings";
import { useAppSettings } from "@/hooks/use-settings";
import {
  MAX_AGENT_SWITCHER_SESSIONS,
  MIN_AGENT_SWITCHER_SESSIONS,
} from "@/hooks/use-settings/storage";

const AGENT_SWITCHER_ORDERS: readonly AgentSwitcherOrder[] = ["lastViewed", "lastActivity"];

const MAX_SESSIONS_OPTIONS = Array.from(
  { length: MAX_AGENT_SWITCHER_SESSIONS - MIN_AGENT_SWITCHER_SESSIONS + 1 },
  (_, offset) => {
    const value = String(MIN_AGENT_SWITCHER_SESSIONS + offset);
    return { value, label: value };
  },
);

export function SessionSwitcherSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();

  const orderOptions = useMemo(
    () =>
      AGENT_SWITCHER_ORDERS.map((value) => ({
        value,
        label: t(`settings.sessionSwitcher.order.options.${value}`),
      })),
    [t],
  );

  const changeOrder = useCallback(
    (order: AgentSwitcherOrder) =>
      void updateSettings((current) => ({ agentSwitcher: { ...current.agentSwitcher, order } })),
    [updateSettings],
  );
  const changeMaxSessions = useCallback(
    (value: string) =>
      void updateSettings((current) => ({
        agentSwitcher: { ...current.agentSwitcher, maxSessions: Number(value) },
      })),
    [updateSettings],
  );

  return (
    <View>
      <SettingsSection
        title={t("settings.sessionSwitcher.title")}
        info={t("settings.sessionSwitcher.info")}
      >
        <SettingsCard>
          <SettingsSelect
            label={t("settings.sessionSwitcher.order.label")}
            hint={t("settings.sessionSwitcher.order.description")}
            value={settings.agentSwitcher.order}
            options={orderOptions}
            onValueChange={changeOrder}
          />
          <SettingsSelect
            label={t("settings.sessionSwitcher.maxSessions.label")}
            hint={t("settings.sessionSwitcher.maxSessions.description")}
            value={String(settings.agentSwitcher.maxSessions)}
            options={MAX_SESSIONS_OPTIONS}
            onValueChange={changeMaxSessions}
          />
        </SettingsCard>
      </SettingsSection>
    </View>
  );
}
