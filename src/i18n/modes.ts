import { useTranslation } from "react-i18next";
import type { Mode } from "@/lib/modes";
import { useValueLabel } from "./values";

const TRANSLATED_PROFILE_IDS = ["custom", "fps", "rts", "racing", "work", "cinema"] as const;
type TranslatedProfileId = (typeof TRANSLATED_PROFILE_IDS)[number];

export function isTranslatedProfileId(id: string): id is TranslatedProfileId {
  return (TRANSLATED_PROFILE_IDS as readonly string[]).includes(id);
}

/**
 * Nomes/subtítulos exibidos dos perfis. Perfis embutidos (e o Custom) são traduzidos
 * pelo id estável; nomes digitados pelo usuário são exibidos como estão.
 */
export function useModeLabels() {
  const { t } = useTranslation();
  const valueLabel = useValueLabel();

  const modeName = (m: Pick<Mode, "id" | "name">) =>
    isTranslatedProfileId(m.id) ? t(`profiles.${m.id}.name`) : m.name;

  const modeSubtitle = (m: Pick<Mode, "id" | "settings">) =>
    isTranslatedProfileId(m.id)
      ? t(`profiles.${m.id}.subtitle`)
      : t("profiles.userSubtitle", {
          brightness: m.settings.brightness,
          overdrive: valueLabel(m.settings.overdrive),
        });

  return { modeName, modeSubtitle };
}
