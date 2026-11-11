import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import ptBR from "@/locales/pt-BR";
import en from "@/locales/en";

// Para adicionar um idioma: crie src/locales/<codigo>.ts tipado como LocaleResource,
// registre-o em `resources` e inclua o código em SUPPORTED_LANGUAGES.
export const SUPPORTED_LANGUAGES = ["pt-BR", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_KEY = "aoc-monitor-language";

function isLanguage(v: unknown): v is Language {
  return typeof v === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(v);
}

/** Idioma padrão a partir do locale do sistema/webview: pt* → pt-BR, qualquer outro → en. */
export function detectLanguage(locale: string | undefined): Language {
  return locale?.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}

export function getStoredLanguage(): Language | null {
  try {
    const v = localStorage.getItem(LANGUAGE_KEY);
    const parsed: unknown = v ? JSON.parse(v) : null;
    return isLanguage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getInitialLanguage(): Language {
  const systemLocale = typeof navigator !== "undefined" ? navigator.language : undefined;
  return getStoredLanguage() ?? detectLanguage(systemLocale);
}

export function setLanguage(lng: Language) {
  try {
    localStorage.setItem(LANGUAGE_KEY, JSON.stringify(lng));
  } catch {
    // Sem localStorage: o idioma vale só para esta sessão
  }
  void i18n.changeLanguage(lng);
}

export function currentLanguage(): Language {
  return isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : "pt-BR";
}

// Mantém o atributo lang do documento e o menu da bandeja no idioma ativo
i18n.on("languageChanged", (lng) => {
  if (typeof document !== "undefined") document.documentElement.lang = lng;
  invoke("set_tray_labels", { show: i18n.t("tray.show"), quit: i18n.t("tray.quit") }).catch(
    () => {},
  );
});

void i18n.use(initReactI18next).init({
  resources: {
    "pt-BR": { translation: ptBR },
    en: { translation: en },
  },
  lng: getInitialLanguage(),
  fallbackLng: "pt-BR",
  supportedLngs: SUPPORTED_LANGUAGES,
  initAsync: false,
  interpolation: { escapeValue: false },
});

export default i18n;
