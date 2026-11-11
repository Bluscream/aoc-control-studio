import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import i18n from "@/i18n";

export type RunningAppInfo = {
  name: string;
  exeName: string;
};

export type Settings = {
  // Imagem
  brightness: number; // 0-100 (Std VCP 0x10)
  contrast: number; // 0-100 (Std VCP 0x12)
  gamma: string; // "Gamma 1", "Gamma 2", "Gamma 3" (TPV F8 E1 12: 0..2)
  ecoMode: string; // "Padrão", "Texto", "Internet", "Jogo", "Filme", "Esportes", "Leitura" (TPV F8 E1 11: 0..6)
  dcr: boolean; // Dynamic Contrast (TPV F8 E1 13: 0..1)

  // Cores
  colorTemp: string; // "sRGB", "Quente", "Normal", "Frio", "UserRGB" (Std VCP 0x14)
  r: number; // 0-100 (Std VCP 0x16)
  g: number; // 0-100 (Std VCP 0x18)
  b: number; // 0-100 (Std VCP 0x1A)
  gameColor: number; // 0-20 (TPV F8 E1 57, padrão 10)
  lowBlue: string; // "Desligado", "Multimídia", "Internet", "Escritório", "Leitura" (TPV F8 E1 59: 0..4)

  // Desempenho
  gameMode: string; // "Desligado", "FPS", "RTS", "Corrida", "Gamer 1", "Gamer 2", "Gamer 3" (Std VCP 0xDC)
  overdrive: string; // "Desligado", "Fraco", "Médio", "Forte", "Boost" (TPV F8 E1 51: 0..4)
  shadowControl: number; // 0-100 em passos de 10 (TPV F8 E1 58, padrão 50)
  adaptiveSync: boolean; // AMD FreeSync / VRR (via ADLX amdadlx64.dll)

  // Recursos
  crosshair: boolean; // Dial Point / Mira na Tela (TPV F8 E1 5A: 0..1)
  frameCounter: string; // "Desligado", "Sup. Direito", "Inf. Direito", "Inf. Esquerdo", "Sup. Esquerdo" (TPV F8 E1 5B: 0..4)
  hdrMode: string; // "Off", "HDR Picture", "HDR Movie", "HDR Game" (TPV F8 E1 52: 0..3)
};

export type MonitorInfo = {
  name: string;
  connection: string;
  ddcSupported: boolean;
  hdrSupported: boolean;
  hdrEnabled: boolean;
  adaptiveSyncSupported: boolean;
  adaptiveSyncEnabled: boolean;
};

export type ApplyResult = {
  appliedCount: number;
  warnings: string[];
};

export type Mode = {
  id: string;
  name: string;
  subtitle?: string | undefined;
  isBuiltIn?: boolean | undefined;
  settings: Settings;
  assignedExes?: string[] | undefined;
};

type RawSettings = {
  brightness?: unknown;
  contrast?: unknown;
  gamma?: unknown;
  ecoMode?: unknown;
  dcr?: unknown;
  colorTemp?: unknown;
  r?: unknown;
  g?: unknown;
  b?: unknown;
  gameColor?: unknown;
  lowBlue?: unknown;
  gameMode?: unknown;
  overdrive?: unknown;
  shadowControl?: unknown;
  adaptiveSync?: unknown;
  crosshair?: unknown;
  frameCounter?: unknown;
  hdrMode?: unknown;
  hdr?: unknown;
};

export const defaultSettings: Settings = {
  brightness: 80,
  contrast: 50,
  gamma: "Gamma 1",
  ecoMode: "Padrão",
  dcr: false,

  colorTemp: "Normal",
  r: 50,
  g: 50,
  b: 50,
  gameColor: 10,
  lowBlue: "Desligado",

  gameMode: "Desligado",
  overdrive: "Médio",
  shadowControl: 50,
  adaptiveSync: false,

  crosshair: false,
  frameCounter: "Desligado",
  hdrMode: "Off",
};

const VALID_GAMMAS = ["Gamma 1", "Gamma 2", "Gamma 3"];
const VALID_ECOS = ["Padrão", "Texto", "Internet", "Jogo", "Filme", "Esportes", "Leitura"];
const VALID_TEMPS = ["sRGB", "Quente", "Normal", "Frio", "UserRGB"];
const VALID_LOW_BLUE = ["Desligado", "Multimídia", "Internet", "Escritório", "Leitura"];
const VALID_GAME_MODES = ["Desligado", "FPS", "RTS", "Corrida", "Gamer 1", "Gamer 2", "Gamer 3"];
const VALID_OVERDRIVES = ["Desligado", "Fraco", "Médio", "Forte", "Boost"];
const VALID_FRAME_COUNTERS = ["Desligado", "Sup. Direito", "Inf. Direito", "Inf. Esquerdo", "Sup. Esquerdo"];
const VALID_HDR_MODES = ["Off", "HDR Picture", "HDR Movie", "HDR Game"];

export function normalizeSettings(raw: RawSettings | null | undefined): Settings {
  if (!raw || typeof raw !== "object") return { ...defaultSettings };

  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : def;
    return Math.min(max, Math.max(min, Math.round(n)));
  };

  // Migra perfis antigos onde gameColor era 0..100 para a escala real 0..20 do AOC 24G2S
  let gc = typeof raw.gameColor === "number" && Number.isFinite(raw.gameColor) ? raw.gameColor : defaultSettings.gameColor;
  if (gc > 20) {
    gc = Math.round(gc / 5);
  }
  gc = Math.min(20, Math.max(0, Math.round(gc)));

  // Garante Shadow Control em passos exatos de 10 (0..100)
  const rawSc = typeof raw.shadowControl === "number" && Number.isFinite(raw.shadowControl) ? raw.shadowControl : defaultSettings.shadowControl;
  const sc = Math.min(100, Math.max(0, Math.round(rawSc / 10) * 10));

  let ct = typeof raw.colorTemp === "string" ? raw.colorTemp : defaultSettings.colorTemp;
  if (ct === "Warm") ct = "Quente";
  if (ct === "Cool") ct = "Frio";
  if (!VALID_TEMPS.includes(ct)) ct = defaultSettings.colorTemp;

  const gamma = typeof raw.gamma === "string" && VALID_GAMMAS.includes(raw.gamma) ? raw.gamma : "Gamma 1";
  const ecoMode = typeof raw.ecoMode === "string" && VALID_ECOS.includes(raw.ecoMode) ? raw.ecoMode : "Padrão";
  const lowBlue = typeof raw.lowBlue === "string" && VALID_LOW_BLUE.includes(raw.lowBlue) ? raw.lowBlue : "Desligado";
  const gameMode = typeof raw.gameMode === "string" && VALID_GAME_MODES.includes(raw.gameMode) ? raw.gameMode : "Desligado";
  const overdrive = typeof raw.overdrive === "string" && VALID_OVERDRIVES.includes(raw.overdrive) ? raw.overdrive : "Médio";
  const frameCounter =
    typeof raw.frameCounter === "string" && VALID_FRAME_COUNTERS.includes(raw.frameCounter)
      ? raw.frameCounter
      : "Desligado";

  let hdrMode = "Off";
  if (typeof raw.hdrMode === "string" && VALID_HDR_MODES.includes(raw.hdrMode)) {
    hdrMode = raw.hdrMode;
  } else if (raw.hdr === true || raw.hdr === "true") {
    hdrMode = "HDR Picture";
  }

  return {
    brightness: num(raw.brightness, defaultSettings.brightness, 0, 100),
    contrast: num(raw.contrast, defaultSettings.contrast, 0, 100),
    gamma,
    ecoMode,
    dcr: Boolean(raw.dcr),

    colorTemp: ct,
    r: num(raw.r, defaultSettings.r, 0, 100),
    g: num(raw.g, defaultSettings.g, 0, 100),
    b: num(raw.b, defaultSettings.b, 0, 100),
    gameColor: gc,
    lowBlue,

    gameMode,
    overdrive,
    shadowControl: sc,
    adaptiveSync: Boolean(raw.adaptiveSync),

    crosshair: Boolean(raw.crosshair),
    frameCounter,
    hdrMode,
  };
}

export const builtInModes: Mode[] = [
  {
    id: "fps",
    name: "FPS Competitivo",
    subtitle: "Overdrive forte · Sombras 60",
    isBuiltIn: true,
    settings: {
      ...defaultSettings,
      brightness: 95,
      contrast: 55,
      gameMode: "FPS",
      overdrive: "Forte",
      shadowControl: 60,
      gameColor: 13,
      crosshair: false,
      frameCounter: "Desligado",
      adaptiveSync: false,
    },
  },
  {
    id: "rts",
    name: "RTS / MOBA",
    subtitle: "Cores vivas · Overdrive médio · FreeSync",
    isBuiltIn: true,
    settings: {
      ...defaultSettings,
      brightness: 85,
      contrast: 50,
      gameMode: "RTS",
      overdrive: "Médio",
      shadowControl: 50,
      gameColor: 13,
      crosshair: false,
      frameCounter: "Desligado",
      adaptiveSync: true,
    },
  },
  {
    id: "racing",
    name: "Corrida / Imersão",
    subtitle: "Game Color 14 · Overdrive forte · FreeSync",
    isBuiltIn: true,
    settings: {
      ...defaultSettings,
      brightness: 90,
      contrast: 55,
      gameMode: "Corrida",
      overdrive: "Forte",
      shadowControl: 50,
      gameColor: 14,
      crosshair: false,
      adaptiveSync: true,
    },
  },
  {
    id: "work",
    name: "Trabalho / Leitura",
    subtitle: "Low Blue Light · Brilho suave",
    isBuiltIn: true,
    settings: {
      ...defaultSettings,
      brightness: 35,
      contrast: 45,
      lowBlue: "Leitura",
      ecoMode: "Padrão",
      gameMode: "Desligado",
      overdrive: "Desligado",
      gameColor: 10,
      crosshair: false,
      frameCounter: "Desligado",
      adaptiveSync: false,
    },
  },
  {
    id: "cinema",
    name: "Cinema / Vídeo",
    subtitle: "Gamma 3 · Contraste 60 · Quente",
    isBuiltIn: true,
    settings: {
      ...defaultSettings,
      brightness: 75,
      contrast: 60,
      gamma: "Gamma 3",
      colorTemp: "Quente",
      ecoMode: "Padrão",
      gameColor: 11,
      gameMode: "Desligado",
      overdrive: "Fraco",
      crosshair: false,
      adaptiveSync: false,
    },
  },
];

const KEY = "aoc-monitor-modes";
const CUSTOM_KEY = "aoc-monitor-custom";
const BUILTIN_OVERRIDES_KEY = "aoc-monitor-builtin-overrides";
const ACTIVE_KEY = "aoc-monitor-active";
const DEFAULT_MODE_KEY = "aoc-monitor-default-mode";
const AUTO_PROFILE_ENABLED_KEY = "aoc-monitor-auto-profile-enabled";
const ASSIGNED_EXES_KEY = "aoc-monitor-assigned-exes";
const DISABLED_AUTO_PROFILES_KEY = "aoc-monitor-disabled-auto-profiles";

export const DEFAULT_ASSIGNED_EXES: Record<string, string[]> = {
  fps: ["cs2.exe", "valorant.exe", "r5apex.exe", "cod.exe", "overwatch.exe"],
  rts: ["dota2.exe", "league of legends.exe"],
  racing: ["forzahorizon5.exe", "f1_24.exe"],
  cinema: ["vlc.exe", "mpc-hc64.exe"],
  work: ["code.exe", "devenv.exe", "word.exe", "excel.exe"],
};

const read = <T,>(k: string, f: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : f;
  } catch {
    return f;
  }
};

export function isProfileAutoSwitchEnabled(id: string): boolean {
  const map = read<Record<string, boolean>>(DISABLED_AUTO_PROFILES_KEY, {});
  return map[id] !== false;
}

export function setProfileAutoSwitchEnabled(id: string, enabled: boolean) {
  const map = read<Record<string, boolean>>(DISABLED_AUTO_PROFILES_KEY, {});
  map[id] = enabled;
  localStorage.setItem(DISABLED_AUTO_PROFILES_KEY, JSON.stringify(map));
  syncAutoProfileConfig();
}

export function getAssignedExes(id: string): string[] {
  const map = read<Record<string, string[]>>(ASSIGNED_EXES_KEY, DEFAULT_ASSIGNED_EXES);
  return map[id] || [];
}

export function setAssignedExes(id: string, exes: string[]) {
  const map = read<Record<string, string[]>>(ASSIGNED_EXES_KEY, DEFAULT_ASSIGNED_EXES);
  map[id] = Array.from(new Set(exes.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  localStorage.setItem(ASSIGNED_EXES_KEY, JSON.stringify(map));
  syncAutoProfileConfig();
}

export function getDefaultModeId(): string {
  return read<string>(DEFAULT_MODE_KEY, "work");
}

export function setDefaultModeId(id: string) {
  localStorage.setItem(DEFAULT_MODE_KEY, JSON.stringify(id));
  syncAutoProfileConfig();
}

export function getAutoProfileEnabled(): boolean {
  return read<boolean>(AUTO_PROFILE_ENABLED_KEY, true);
}

export function setAutoProfileEnabled(enabled: boolean) {
  localStorage.setItem(AUTO_PROFILE_ENABLED_KEY, JSON.stringify(enabled));
  syncAutoProfileConfig();
}

export async function fetchRunningApps(): Promise<RunningAppInfo[]> {
  try {
    return await invoke<RunningAppInfo[]>("get_running_apps");
  } catch (err) {
    console.error("[Hardware] Erro ao listar aplicativos:", err);
    return [];
  }
}

export async function syncAutoProfileConfig() {
  try {
    const enabled = getAutoProfileEnabled();
    const defaultModeId = getDefaultModeId();
    const allModes = [...getMergedBuiltIns(), ...getStoredUserModes()];
    const defaultMode = allModes.find((m) => m.id === defaultModeId) || loadSettings("custom");
    const defaultSettingsVal = defaultMode?.settings || defaultSettings;

    const assignedMap = read<Record<string, string[]>>(ASSIGNED_EXES_KEY, DEFAULT_ASSIGNED_EXES);
    const disabledMap = read<Record<string, boolean>>(DISABLED_AUTO_PROFILES_KEY, {});

    const profiles = allModes
      .filter((m) => disabledMap[m.id] !== false)
      .map((m) => ({
        modeId: m.id,
        exes: assignedMap[m.id] || [],
        settings: m.settings,
      }))
      .filter((p) => p.exes.length > 0);

    await invoke("update_auto_profile_config", {
      config: {
        enabled,
        defaultModeId,
        defaultSettings: defaultSettingsVal,
        profiles,
      },
    });
  } catch (err) {
    console.error("Falha ao sincronizar configuração automática:", err);
  }
}

function getMergedBuiltIns(): Mode[] {
  const overrides = read<Record<string, RawSettings>>(BUILTIN_OVERRIDES_KEY, {});
  const assigned = read<Record<string, string[]>>(ASSIGNED_EXES_KEY, DEFAULT_ASSIGNED_EXES);
  return builtInModes.map((m) => {
    const s = overrides[m.id] ? normalizeSettings(overrides[m.id]) : m.settings;
    return { ...m, settings: s, assignedExes: assigned[m.id] || [] };
  });
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return `mode_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function getStoredUserModes(): Mode[] {
  const rawList = read<unknown[]>(KEY, []);
  if (!Array.isArray(rawList)) return [];
  const assigned = read<Record<string, string[]>>(ASSIGNED_EXES_KEY, DEFAULT_ASSIGNED_EXES);
  return rawList
    .filter((m): m is Mode => Boolean(m && typeof m === "object" && "id" in m))
    .map((m) => {
      const id = String(m.id || generateId());
      return {
        id,
        name: String(m.name || i18n.t("profiles.fallbackName")),
        subtitle: typeof m.subtitle === "string" ? m.subtitle : undefined,
        isBuiltIn: false,
        settings: normalizeSettings(m.settings as unknown as RawSettings),
        assignedExes: assigned[id] || [],
      };
    });
}

export function useModes() {
  const [modes, setModes] = useState<Mode[]>([]);
  const [active, setActiveState] = useState<string>("custom");
  const [defaultModeId, setDefaultModeIdState] = useState<string>(getDefaultModeId);
  const [autoProfileEnabled, setAutoProfileEnabledState] = useState<boolean>(getAutoProfileEnabled);
  const [disabledAutoProfiles, setDisabledAutoProfiles] = useState<Record<string, boolean>>(() =>
    read<Record<string, boolean>>(DISABLED_AUTO_PROFILES_KEY, {})
  );
  const [lastWarnings, setLastWarnings] = useState<string[]>([]);

  const refreshModes = () => {
    const assigned = read<Record<string, string[]>>(ASSIGNED_EXES_KEY, DEFAULT_ASSIGNED_EXES);
    const all = [...getMergedBuiltIns(), ...getStoredUserModes()].map((m) => ({
      ...m,
      assignedExes: assigned[m.id] || [],
    }));
    setModes(all);
  };

  useEffect(() => {
    refreshModes();
    setActiveState(read(ACTIVE_KEY, "custom"));
    syncAutoProfileConfig();

    let unlistenFn: (() => void) | undefined;
    listen<string>("auto-profile-changed", (event) => {
      console.log("[AutoProfile] Perfil alterado automaticamente para:", event.payload);
      setActiveState(event.payload);
      try {
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(event.payload));
      } catch {}
    }).then((unlisten) => {
      unlistenFn = unlisten;
    });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const saveUserModes = (all: Mode[]) => {
    const customOnly = all.filter((m) => !m.isBuiltIn);
    setModes(all);
    try {
      localStorage.setItem(KEY, JSON.stringify(customOnly));
    } catch (e) {
      console.error("Falha ao salvar modos no localStorage:", e);
    }
    syncAutoProfileConfig();
  };

  const toggleProfileAutoSwitch = (id: string) => {
    const current = disabledAutoProfiles[id] !== false;
    const next = !current;
    const updated = { ...disabledAutoProfiles, [id]: next };
    setDisabledAutoProfiles(updated);
    try {
      localStorage.setItem(DISABLED_AUTO_PROFILES_KEY, JSON.stringify(updated));
    } catch {}
    syncAutoProfileConfig();
  };

  return {
    modes,
    active,
    defaultModeId,
    autoProfileEnabled,
    disabledAutoProfiles,
    toggleProfileAutoSwitch,
    isProfileAutoSwitchEnabled: (id: string) => disabledAutoProfiles[id] !== false,
    lastWarnings,
    clearWarnings: () => setLastWarnings([]),
    refreshModes,
    setDefaultMode: (id: string) => {
      setDefaultModeId(id);
      setDefaultModeIdState(id);
    },
    setAutoProfileEnabled: (val: boolean) => {
      setAutoProfileEnabled(val);
      setAutoProfileEnabledState(val);
    },
    updateModeExes: (id: string, exes: string[]) => {
      setAssignedExes(id, exes);
      refreshModes();
    },
    setActive: async (id: string) => {
      setActiveState(id);
      try {
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(id));
      } catch {}
      const target = id === "custom" ? loadSettings("custom") : modes.find((m) => m.id === id);
      if (target?.settings) {
        const res = await applySettingsToHardware(target.settings);
        setLastWarnings(res?.warnings ?? []);
      }
    },
    create: (name: string): Mode => {
      const current = loadSettings("custom")?.settings || defaultSettings;
      const newId = generateId();
      const safeName = name.trim() || i18n.t("profiles.numberedName", { n: modes.length + 1 });
      const m: Mode = {
        id: newId,
        name: safeName,
        // O subtítulo salvo mantém o formato original; a interface exibe uma versão
        // traduzida gerada a partir das configurações (ver src/i18n/modes.ts).
        subtitle: `${current.brightness}% brilho · ${current.overdrive}`,
        isBuiltIn: false,
        settings: { ...current },
        assignedExes: [],
      };
      const updated = [...modes.filter((item) => item.id !== newId), m];
      saveUserModes(updated);
      return m;
    },
    remove: (id: string) => {
      saveUserModes(modes.filter((m) => m.id !== id || m.isBuiltIn));
    },
    resetAll: () => {
      resetAllToFactoryDefaults();
      refreshModes();
      setActiveState("custom");
      setDefaultModeIdState("work");
      setAutoProfileEnabledState(true);
      setDisabledAutoProfiles({});
    },
    resetBuiltIn: (id: string) => {
      const orig = resetBuiltInModeToDefault(id);
      refreshModes();
      return orig;
    },
  };
}

export function loadSettings(id: string): { name: string; settings: Settings } | null {
  if (id === "custom") {
    const raw = read<RawSettings | null>(CUSTOM_KEY, null);
    return { name: "Custom", settings: raw ? normalizeSettings(raw) : { ...defaultSettings } };
  }
  const m = [...getMergedBuiltIns(), ...getStoredUserModes()].find((x) => x.id === id);
  return m ? { name: m.name, settings: normalizeSettings(m.settings as unknown as RawSettings) } : null;
}

export function saveSettings(id: string, s: Settings, newName?: string) {
  const clean = normalizeSettings(s as unknown as RawSettings);
  if (id === "custom") {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(clean));
    return;
  }
  if (builtInModes.some((b) => b.id === id)) {
    const overrides = read<Record<string, Settings>>(BUILTIN_OVERRIDES_KEY, {});
    overrides[id] = clean;
    localStorage.setItem(BUILTIN_OVERRIDES_KEY, JSON.stringify(overrides));
    return;
  }
  const userModes = getStoredUserModes();
  const updated = userModes.map((m) =>
    m.id === id
      ? {
          ...m,
          name: newName && newName.trim() ? newName.trim() : m.name,
          subtitle: `${clean.brightness}% brilho · ${clean.overdrive}`,
          settings: clean,
        }
      : m
  );
  localStorage.setItem(KEY, JSON.stringify(updated));
  syncAutoProfileConfig();
}

export async function fetchMonitorInfo(): Promise<MonitorInfo | null> {
  try {
    return await invoke<MonitorInfo>("get_monitor_info");
  } catch (err) {
    console.error("[Hardware] Erro ao consultar info do monitor:", err);
    return null;
  }
}

export async function readHardwareSettings(): Promise<Settings | null> {
  try {
    const live = await invoke<Settings>("read_hardware_settings");
    return normalizeSettings(live as unknown as RawSettings);
  } catch (err) {
    console.error("[Hardware] Erro ao ler configurações atuais do monitor:", err);
    return null;
  }
}

// Aplica APENAS os campos que foram realmente alterados pelo usuário ao clicar em Salvar
export async function applyChangedSettingsToHardware(
  current: Settings,
  initial: Settings
): Promise<ApplyResult | null> {
  try {
    const res = await invoke<ApplyResult>("apply_changed_settings", { current, initial });
    console.log("[Hardware] Alterações aplicadas com sucesso:", res);
    return res;
  } catch (err) {
    console.error("[Hardware] Erro ao aplicar alterações:", err);
    return { appliedCount: 0, warnings: [String(err)] };
  }
}

// Dispara perfil completo ao selecionar um modo na tela inicial
export async function applySettingsToHardware(settings: Settings): Promise<ApplyResult | null> {
  try {
    const res = await invoke<ApplyResult>("apply_monitor_settings", { settings });
    console.log("[Hardware] Perfil enviado ao monitor com sucesso:", res);
    return res;
  } catch (err) {
    console.error("[Hardware] Erro ao aplicar perfil:", err);
    return { appliedCount: 0, warnings: [String(err)] };
  }
}

export type AocBackupData = {
  version: 1;
  app: "AOC Control Studio";
  exportedAt: string;
  autoProfileEnabled: boolean;
  defaultModeId: string;
  builtinOverrides: Record<string, Settings>;
  userModes: Mode[];
  assignedExes: Record<string, string[]>;
  disabledAutoProfiles: Record<string, boolean>;
  customSettings?: Settings;
};

export type AocSingleProfileData = {
  version: 1;
  app: "AOC Control Studio";
  type: "single_profile";
  exportedAt: string;
  profile: {
    id: string;
    name: string;
    subtitle?: string;
    isBuiltIn: boolean;
    settings: Settings;
    assignedExes?: string[];
  };
};

export async function exportJsonFile(filename: string, data: unknown): Promise<boolean> {
  const jsonStr = JSON.stringify(data, null, 2);
  try {
    const saved = await invoke<boolean>("export_json_dialog", {
      defaultFilename: filename,
      contents: jsonStr,
    });
    return saved;
  } catch (err) {
    console.warn("export_json_dialog indisponível ou falhou, usando fallback do navegador:", err);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }
}

export function pickAndReadJsonFile<T = unknown>(): Promise<{ filename: string; data: T }> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error(i18n.t("storage.noFileSelected")));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          resolve({ filename: file.name, data: parsed });
        } catch {
          reject(new Error(i18n.t("storage.invalidJson")));
        }
      };
      reader.onerror = () => reject(new Error(i18n.t("storage.readFailed")));
      reader.readAsText(file);
    };
    input.click();
  });
}

export async function exportSingleProfile(id: string): Promise<boolean> {
  let mode: Mode | undefined;
  if (id === "custom") {
    const customData = loadSettings("custom");
    mode = {
      id: "custom",
      name: "Custom",
      subtitle: `${customData?.settings.brightness}% brilho · ${customData?.settings.overdrive}`,
      isBuiltIn: false,
      settings: customData?.settings || defaultSettings,
      assignedExes: [],
    };
  } else {
    mode = [...getMergedBuiltIns(), ...getStoredUserModes()].find((m) => m.id === id);
  }
  if (!mode) throw new Error(i18n.t("storage.profileNotFound"));
  const assigned = getAssignedExes(id);
  const data: AocSingleProfileData = {
    version: 1,
    app: "AOC Control Studio",
    type: "single_profile",
    exportedAt: new Date().toISOString(),
    profile: {
      id: mode.id,
      name: mode.name,
      subtitle: mode.subtitle,
      isBuiltIn: Boolean(mode.isBuiltIn),
      settings: mode.settings,
      assignedExes: assigned,
    },
  };
  const safeName = mode.name.toLowerCase().replace(/[^a-z0-9_-]/gi, "_");
  return await exportJsonFile(`aoc-perfil-${safeName}.json`, data);
}

export async function exportAllConfigurations(): Promise<boolean> {
  const builtinOverrides = read<Record<string, Settings>>(BUILTIN_OVERRIDES_KEY, {});
  const userModes = getStoredUserModes();
  const assignedExes = read<Record<string, string[]>>(ASSIGNED_EXES_KEY, DEFAULT_ASSIGNED_EXES);
  const disabledAutoProfiles = read<Record<string, boolean>>(DISABLED_AUTO_PROFILES_KEY, {});
  const defaultModeId = getDefaultModeId();
  const autoProfileEnabled = getAutoProfileEnabled();
  const custom = read<RawSettings | null>(CUSTOM_KEY, null);

  const data: AocBackupData = {
    version: 1,
    app: "AOC Control Studio",
    exportedAt: new Date().toISOString(),
    autoProfileEnabled,
    defaultModeId,
    builtinOverrides,
    userModes,
    assignedExes,
    disabledAutoProfiles,
    customSettings: custom ? normalizeSettings(custom) : defaultSettings,
  };

  const dateStr = new Date().toISOString().split("T")[0];
  return await exportJsonFile(`aoc-control-studio-backup-${dateStr}.json`, data);
}

export function importSingleProfile(profileData: AocSingleProfileData["profile"]): Mode {
  const isBuiltIn = builtInModes.some((b) => b.id === profileData.id);
  const cleanSettings = normalizeSettings(profileData.settings as unknown as RawSettings);

  if (isBuiltIn) {
    const overrides = read<Record<string, Settings>>(BUILTIN_OVERRIDES_KEY, {});
    overrides[profileData.id] = cleanSettings;
    localStorage.setItem(BUILTIN_OVERRIDES_KEY, JSON.stringify(overrides));
    if (profileData.assignedExes) {
      setAssignedExes(profileData.id, profileData.assignedExes);
    }
    syncAutoProfileConfig();
    return {
      id: profileData.id,
      name: profileData.name,
      subtitle: profileData.subtitle,
      isBuiltIn: true,
      settings: cleanSettings,
      assignedExes: profileData.assignedExes || [],
    };
  } else {
    const userModes = getStoredUserModes();
    const exists = userModes.some((m) => m.id === profileData.id);
    const id = exists ? profileData.id : generateId();
    const newMode: Mode = {
      id,
      name: profileData.name || i18n.t("profiles.importedName"),
      subtitle: `${cleanSettings.brightness}% brilho · ${cleanSettings.overdrive}`,
      isBuiltIn: false,
      settings: cleanSettings,
      assignedExes: profileData.assignedExes || [],
    };
    const updated = [...userModes.filter((m) => m.id !== id), newMode];
    localStorage.setItem(KEY, JSON.stringify(updated));
    if (profileData.assignedExes) {
      setAssignedExes(id, profileData.assignedExes);
    }
    syncAutoProfileConfig();
    return newMode;
  }
}

export function importAllConfigurations(backup: Partial<AocBackupData>) {
  if (backup.builtinOverrides && typeof backup.builtinOverrides === "object") {
    const cleanOverrides: Record<string, Settings> = {};
    for (const [k, v] of Object.entries(backup.builtinOverrides)) {
      cleanOverrides[k] = normalizeSettings(v as unknown as RawSettings);
    }
    localStorage.setItem(BUILTIN_OVERRIDES_KEY, JSON.stringify(cleanOverrides));
  }

  if (Array.isArray(backup.userModes)) {
    const cleanUserModes: Mode[] = backup.userModes.map((m) => ({
      id: String(m.id || generateId()),
      name: String(m.name || i18n.t("profiles.fallbackName")),
      subtitle: typeof m.subtitle === "string" ? m.subtitle : undefined,
      isBuiltIn: false,
      settings: normalizeSettings(m.settings as unknown as RawSettings),
      assignedExes: Array.isArray(m.assignedExes) ? m.assignedExes : [],
    }));
    localStorage.setItem(KEY, JSON.stringify(cleanUserModes));
  }

  if (backup.assignedExes && typeof backup.assignedExes === "object") {
    localStorage.setItem(ASSIGNED_EXES_KEY, JSON.stringify(backup.assignedExes));
  }

  if (backup.disabledAutoProfiles && typeof backup.disabledAutoProfiles === "object") {
    localStorage.setItem(DISABLED_AUTO_PROFILES_KEY, JSON.stringify(backup.disabledAutoProfiles));
  }

  if (typeof backup.defaultModeId === "string") {
    localStorage.setItem(DEFAULT_MODE_KEY, JSON.stringify(backup.defaultModeId));
  }

  if (typeof backup.autoProfileEnabled === "boolean") {
    localStorage.setItem(AUTO_PROFILE_ENABLED_KEY, JSON.stringify(backup.autoProfileEnabled));
  }

  if (backup.customSettings) {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(normalizeSettings(backup.customSettings as unknown as RawSettings)));
  }

  syncAutoProfileConfig();
}

export async function handleFileImport(): Promise<{
  type: "all" | "single";
  message: string;
}> {
  const { filename, data } = await pickAndReadJsonFile<any>();
  if (!data || typeof data !== "object") {
    throw new Error(i18n.t("storage.emptyJson"));
  }

  // 1. Perfil individual encapsulado
  if (data.type === "single_profile" && data.profile) {
    const imported = importSingleProfile(data.profile);
    return {
      type: "single",
      message: i18n.t("storage.importedSingleFrom", { name: imported.name, filename }),
    };
  }

  // 2. Perfil individual direto
  if (data.settings && data.name) {
    const imported = importSingleProfile({
      id: data.id || generateId(),
      name: data.name,
      subtitle: data.subtitle,
      isBuiltIn: Boolean(data.isBuiltIn),
      settings: data.settings,
      assignedExes: data.assignedExes || [],
    });
    return {
      type: "single",
      message: i18n.t("storage.importedSingle", { name: imported.name }),
    };
  }

  // 3. Backup completo
  if (data.builtinOverrides || data.userModes || data.assignedExes || data.app === "AOC Control Studio") {
    importAllConfigurations(data);
    const count = (data.userModes?.length || 0) + Object.keys(data.builtinOverrides || {}).length;
    return {
      type: "all",
      message: i18n.t("storage.importedAll", { count, filename }),
    };
  }

  throw new Error(i18n.t("storage.unknownFormat"));
}

export function resetBuiltInModeToDefault(id: string): Settings | null {
  const original = builtInModes.find((b) => b.id === id);
  if (!original) return null;
  const overrides = read<Record<string, Settings>>(BUILTIN_OVERRIDES_KEY, {});
  delete overrides[id];
  localStorage.setItem(BUILTIN_OVERRIDES_KEY, JSON.stringify(overrides));

  const defaultExes = DEFAULT_ASSIGNED_EXES[id] || [];
  setAssignedExes(id, defaultExes);

  syncAutoProfileConfig();
  return original.settings;
}

export function resetAllToFactoryDefaults() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(CUSTOM_KEY);
  localStorage.removeItem(BUILTIN_OVERRIDES_KEY);
  localStorage.removeItem(ACTIVE_KEY);
  localStorage.removeItem(DEFAULT_MODE_KEY);
  localStorage.removeItem(AUTO_PROFILE_ENABLED_KEY);
  localStorage.removeItem(ASSIGNED_EXES_KEY);
  localStorage.removeItem(DISABLED_AUTO_PROFILES_KEY);
  syncAutoProfileConfig();
}
