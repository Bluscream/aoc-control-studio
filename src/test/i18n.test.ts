import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n, { detectLanguage, getStoredLanguage, setLanguage } from "@/i18n";
import { translateBackendMessage } from "@/i18n/backend";
import { valueLabel } from "@/i18n/values";
import ptBR from "@/locales/pt-BR";

const tFor = (lng: "pt-BR" | "en") => i18n.getFixedT(lng);

// Armazenamento em memória: versões recentes do Node expõem um localStorage global
// próprio que pode ficar indefinido e sobrepor o do jsdom.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe("i18n", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("picks pt-BR for any Portuguese locale and English otherwise", () => {
    expect(detectLanguage("pt-BR")).toBe("pt-BR");
    expect(detectLanguage("pt-PT")).toBe("pt-BR");
    expect(detectLanguage("pt")).toBe("pt-BR");
    expect(detectLanguage("en-US")).toBe("en");
    expect(detectLanguage("de-DE")).toBe("en");
    expect(detectLanguage(undefined)).toBe("en");
  });

  it("persists the chosen language", () => {
    expect(getStoredLanguage()).toBeNull();
    setLanguage("en");
    expect(getStoredLanguage()).toBe("en");
    expect(i18n.language).toBe("en");
    setLanguage("pt-BR");
    expect(getStoredLanguage()).toBe("pt-BR");
  });

  it("ignores invalid stored values", () => {
    localStorage.setItem("aoc-monitor-language", JSON.stringify("xx"));
    expect(getStoredLanguage()).toBeNull();
  });

  it("labels stored setting values without changing them", () => {
    expect(valueLabel(tFor("en"), "Médio")).toBe("Medium");
    expect(valueLabel(tFor("en"), "Sup. Direito")).toBe("Top Right");
    expect(valueLabel(tFor("en"), "Gamma 2")).toBe("Gamma 2");
    expect(valueLabel(tFor("pt-BR"), "Médio")).toBe("Médio");
  });

  it("translates known backend messages, with and without a field prefix", () => {
    const en = tFor("en");
    expect(translateBackendMessage(en, ptBR.backend.messages.ddcUnavailable)).toBe(
      "DDC/CI monitor not accessible",
    );
    expect(translateBackendMessage(en, "Brilho: VCP 0x10 não suportado")).toBe(
      "Brightness: VCP 0x10 not supported",
    );
    expect(
      translateBackendMessage(
        en,
        "Sem permissão para acessar /dev/i2c-3, /dev/i2c-4 — execute 'sudo ./scripts/setup-linux.sh' e faça logout/login",
      ),
    ).toBe(
      "No permission to access /dev/i2c-3, /dev/i2c-4 — run 'sudo ./scripts/setup-linux.sh' and log out/in",
    );
    expect(translateBackendMessage(en, "Overdrive: Monitor ocupado (len=0)")).toBe(
      "Overdrive: Monitor busy (len=0)",
    );
  });

  it("leaves unknown backend messages and Portuguese output untouched", () => {
    expect(translateBackendMessage(tFor("en"), "ADL I2C write falhou (rc=-1)")).toBe(
      "ADL I2C write falhou (rc=-1)",
    );
    const msg = "Brilho: Cabeçalho DDC/CI inválido";
    expect(translateBackendMessage(tFor("pt-BR"), msg)).toBe(msg);
  });
});
