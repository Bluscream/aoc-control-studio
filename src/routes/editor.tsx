import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Sun,
  Palette,
  Zap,
  Sparkles,
  Save,
  Check,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  Pencil,
  Gamepad2,
  Plus,
  X,
  Star,
  Laptop,
  Search,
  Lock,
  Download,
} from "lucide-react";
import {
  defaultSettings,
  builtInModes,
  loadSettings,
  saveSettings,
  applyChangedSettingsToHardware,
  fetchMonitorInfo,
  readHardwareSettings,
  getAssignedExes,
  setAssignedExes,
  getDefaultModeId,
  setDefaultModeId,
  fetchRunningApps,
  exportSingleProfile,
  resetBuiltInModeToDefault,
  type Settings,
  type MonitorInfo,
  type RunningAppInfo,
} from "@/lib/modes";
import i18n from "@/i18n";
import { translateBackendMessage } from "@/i18n/backend";
import { useModeLabels } from "@/i18n/modes";
import { useValueLabel } from "@/i18n/values";

export const Route = createFileRoute("/editor")({
  validateSearch: (s: Record<string, unknown>) => ({ id: typeof s["id"] === "string" ? s["id"] : "custom" }),
  head: () => ({
    meta: [
      { title: i18n.t("meta.editorTitle") },
      { name: "description", content: i18n.t("meta.editorDescription") },
    ],
  }),
  component: Editor,
});

const IS_LINUX = typeof navigator !== "undefined" && /linux/i.test(navigator.userAgent);

const tabs = [
  { id: "image", icon: Sun },
  { id: "color", icon: Palette },
  { id: "perf", icon: Zap },
  { id: "extra", icon: Sparkles },
  { id: "apps", icon: Gamepad2 },
] as const;

// Componentes usados nos textos com marcação (<strong>, <em>, ...) dos arquivos de idioma
const richText = {
  strong: <strong />,
  em: <em />,
  mono: <span className="font-mono text-primary" />,
  code: <span className="font-mono" />,
};

function Editor() {
  const { id } = Route.useSearch();
  const { t } = useTranslation();
  const { modeName } = useModeLabels();
  const valueLabel = useValueLabel();
  const [name, setName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [s, setS] = useState<Settings>(defaultSettings);
  const [initialSettings, setInitialSettings] = useState<Settings>(defaultSettings);
  const [assignedExes, setAssignedExesState] = useState<string[]>(() => getAssignedExes(id));
  const [initialExes, setInitialExes] = useState<string[]>(() => getAssignedExes(id));
  const [isDefault, setIsDefault] = useState(() => getDefaultModeId() === id);
  const [newExe, setNewExe] = useState("");
  const [runningApps, setRunningApps] = useState<RunningAppInfo[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [showAppsPicker, setShowAppsPicker] = useState(false);
  const [appsSearch, setAppsSearch] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("image");
  const [saving, setSaving] = useState(false);
  const [readingHw, setReadingHw] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [monInfo, setMonInfo] = useState<MonitorInfo | null>(null);

  useEffect(() => {
    console.log("[Editor] Montado para id:", id);
    const d = loadSettings(id);
    console.log("[Editor] loadSettings resultado:", d ? d.name : "null");
    if (d) {
      setName(d.name);
      setInitialName(d.name);
      setS(d.settings);
      setInitialSettings(d.settings);
    }
    const currentExes = getAssignedExes(id);
    setAssignedExesState(currentExes);
    setInitialExes(currentExes);
    setIsDefault(getDefaultModeId() === id);

    console.log("[Editor] Solicitando fetchMonitorInfo...");
    fetchMonitorInfo()
      .then((info) => {
        console.log("[Editor] fetchMonitorInfo recebido com sucesso:", info?.name);
        if (info) setMonInfo(info);
      })
      .catch((err) => {
        console.error("[Editor] fetchMonitorInfo erro:", err);
      });
  }, [id]);

  const hasChanges =
    JSON.stringify(s) !== JSON.stringify(initialSettings) ||
    name !== initialName ||
    JSON.stringify(assignedExes) !== JSON.stringify(initialExes);

  const handleSave = async () => {
    setSaving(true);
    setWarnings([]);
    saveSettings(id, s, name);
    setAssignedExes(id, assignedExes);
    setInitialExes(assignedExes);
    const res = await applyChangedSettingsToHardware(s, initialSettings);
    setInitialSettings(s);
    setInitialName(name);
    if (res?.warnings?.length) {
      setWarnings(res.warnings);
    }
    fetchMonitorInfo().then((info) => {
      if (info) setMonInfo(info);
    });
    setSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleToggleDefault = () => {
    if (!isDefault) {
      setDefaultModeId(id);
      setIsDefault(true);
    }
  };

  const handleAddExe = (exe: string) => {
    let clean = exe.trim().toLowerCase();
    if (!clean) return;
    if (!assignedExes.includes(clean)) {
      setAssignedExesState([...assignedExes, clean]);
    }
    setNewExe("");
  };

  const handleRemoveExe = (exe: string) => {
    setAssignedExesState(assignedExes.filter((e) => e !== exe));
  };

  const handleLoadRunningApps = async () => {
    setLoadingApps(true);
    setShowAppsPicker(true);
    const apps = await fetchRunningApps();
    setRunningApps(apps);
    setLoadingApps(false);
  };

  const filteredRunningApps = runningApps.filter(
    (app) =>
      app.name.toLowerCase().includes(appsSearch.toLowerCase()) ||
      app.exeName.toLowerCase().includes(appsSearch.toLowerCase())
  );

  const handleReadFromMonitor = async () => {
    setReadingHw(true);
    setWarnings([]);
    const live = await readHardwareSettings();
    const info = await fetchMonitorInfo();
    if (info) setMonInfo(info);
    if (live) {
      setS(live);
      // Mantém initialSettings diferente caso o perfil salvo seja diferente, permitindo salvar no perfil se quiser
    } else {
      setWarnings([t("editor.readFailed")]);
    }
    setReadingHw(false);
  };

  const handleDiscard = () => {
    setS(initialSettings);
    setWarnings([]);
  };

  const set =
    <K extends keyof Settings>(k: K) =>
    (v: Settings[K]) =>
      setS((p) => ({ ...p, [k]: v }));

  const isGameModeActive = s.gameMode !== "Desligado";
  const isHdrModeActive = s.hdrMode !== "Off";
  const isEcoModeActive = s.ecoMode !== "Padrão";

  const gameModeLabel = valueLabel(s.gameMode);
  const ecoModeLabel = valueLabel(s.ecoMode);
  const gameModeBlockReason = t("editor.blocked.gameMode", { mode: gameModeLabel });
  const hdrModeBlockReason = t("editor.blocked.hdr", { mode: s.hdrMode });
  const ecoModeBlockReason = t("editor.blocked.eco", { mode: ecoModeLabel });
  const dcrBlockReason = t("editor.blocked.dcr");

  const manualLumLocked = !isGameModeActive && !isEcoModeActive && s.dcr;

  const isBuiltIn = builtInModes.some((b) => b.id === id);

  const handleResetToDefault = () => {
    const orig = resetBuiltInModeToDefault(id);
    if (orig) {
      setS(orig);
      const origExes = getAssignedExes(id);
      setAssignedExesState(origExes);
      const b = builtInModes.find((x) => x.id === id);
      if (b) setName(b.name);
      setWarnings([t("editor.resetDone", { name: b ? modeName(b) : id })]);
    }
  };

  return (
    <main className="mx-auto max-w-3xl sm:max-w-4xl px-4 sm:px-6 py-8 sm:py-12 pb-28 min-w-0">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
      >
        <ArrowLeft className="h-4 w-4" /> {t("editor.back")}
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(35%,1fr)_auto] items-start sm:items-center justify-between gap-6 mb-6">
        <div className="min-w-0 pr-2">
          {builtInModes.some((b) => b.id === id) || id === "custom" ? (
            <h1 className="mb-1 text-2xl sm:text-3xl font-semibold tracking-tight break-words">
              {modeName({ id, name }) || t("profiles.fallbackName")}
            </h1>
          ) : (
            <div className="mb-1 flex items-center gap-2 group">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("editor.namePlaceholder")}
                className="w-full max-w-sm bg-transparent text-2xl sm:text-3xl font-semibold tracking-tight text-foreground border-b border-transparent hover:border-border/60 focus:border-primary pb-0.5 outline-none transition"
              />
              <Pencil className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground transition shrink-0" />
            </div>
          )}
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {t("editor.intro")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 shrink-0 w-full sm:w-auto">
          {isBuiltIn && (
            <button
              type="button"
              onClick={handleResetToDefault}
              title={t("editor.resetTitle")}
              className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-medium bg-secondary text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 border border-amber-500/20 transition cursor-pointer h-9 sm:h-10"
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t("editor.resetButton")}</span>
            </button>
          )}

          <button
            type="button"
            onClick={async () => {
              try {
                await exportSingleProfile(id);
              } catch (err: unknown) {
                const e = err as { message?: string };
                setWarnings([e?.message || t("editor.exportError")]);
              }
            }}
            title={t("editor.exportTitle")}
            className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition cursor-pointer h-9 sm:h-10"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t("editor.exportButton")}</span>
          </button>

          <button
            type="button"
            onClick={handleReadFromMonitor}
            disabled={readingHw || saving}
            title={t("editor.readTitle")}
            className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition cursor-pointer h-9 sm:h-10"
          >
            <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${readingHw ? "animate-spin" : ""}`} />
            <span className="truncate">
              {readingHw ? t("editor.reading") : t("editor.readButton")}
            </span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition shadow-sm h-9 sm:h-10 ${
              !isBuiltIn ? "col-span-2" : ""
            } ${
              savedSuccess
                ? "bg-emerald-600 text-white"
                : hasChanges
                  ? "bg-primary text-primary-foreground hover:opacity-90 shadow-glow cursor-pointer"
                  : "bg-secondary text-muted-foreground opacity-50 cursor-not-allowed"
            }`}
          >
            {saving ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent shrink-0" />
                <span className="truncate">{t("editor.applying")}</span>
              </>
            ) : savedSuccess ? (
              <>
                <Check className="h-3.5 w-3.5 stroke-[3] shrink-0" />
                <span className="truncate">{t("editor.saved")}</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {hasChanges ? t("editor.save") : t("editor.noChanges")}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 space-y-1 min-w-0 w-full overflow-hidden">
          {warnings.map((w, idx) => (
            <div key={idx} className="flex items-start gap-2 min-w-0">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <span className="break-words min-w-0 flex-1">{translateBackendMessage(t, w)}</span>
            </div>
          ))}
        </div>
      )}

      <nav className="mb-6 flex gap-1 rounded-xl bg-secondary p-1">
        {tabs.map(({ id: tabId, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition ${
              tab === tabId ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{t(`editor.tabs.${tabId}`)}</span>
          </button>
        ))}
      </nav>

      {tab === "image" && (
        <section className="space-y-6">
          {/* Alertas de bloqueio por Game Mode ou HDR Mode */}
          {isGameModeActive && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3 shadow-sm min-w-0 w-full overflow-hidden">
              <Lock className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1 min-w-0 flex-1">
                <p className="font-semibold text-amber-300 break-words">
                  {t("editor.lock.gameModeActive", { mode: gameModeLabel })}
                </p>
                <p className="leading-relaxed break-words">
                  <Trans i18nKey="editor.lock.imageGameMode" components={richText} />
                </p>
              </div>
            </div>
          )}

          {!isGameModeActive && isHdrModeActive && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3 shadow-sm min-w-0 w-full overflow-hidden">
              <Lock className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1 min-w-0 flex-1">
                <p className="font-semibold text-amber-300 break-words">
                  {t("editor.lock.hdrActive", { mode: s.hdrMode })}
                </p>
                <p className="leading-relaxed break-words">
                  <Trans i18nKey="editor.lock.imageHdr" components={richText} />
                </p>
              </div>
            </div>
          )}

          {!isGameModeActive && !isHdrModeActive && isEcoModeActive && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3 shadow-sm min-w-0 w-full overflow-hidden">
              <Lock className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1 min-w-0 flex-1">
                <p className="font-semibold text-amber-300 break-words">
                  {t("editor.lock.ecoActive", { mode: ecoModeLabel })}
                </p>
                <p className="leading-relaxed break-words">
                  <Trans
                    i18nKey="editor.lock.imageEco"
                    values={{ mode: ecoModeLabel }}
                    components={richText}
                  />
                </p>
              </div>
            </div>
          )}

          <Section title={t("editor.image.lightingTitle")}>
            <Slider
              label={t("editor.image.brightness")}
              value={s.brightness}
              min={0}
              max={100}
              unit="%"
              disabled={isGameModeActive || isEcoModeActive || s.dcr}
              disabledReason={
                isGameModeActive
                  ? gameModeBlockReason
                  : isEcoModeActive
                    ? ecoModeBlockReason
                    : dcrBlockReason
              }
              onChange={set("brightness")}
            />
            <Slider
              label={t("editor.image.contrast")}
              value={s.contrast}
              min={0}
              max={100}
              unit="%"
              disabled={isGameModeActive || isHdrModeActive || isEcoModeActive}
              disabledReason={
                isGameModeActive
                  ? gameModeBlockReason
                  : isHdrModeActive
                    ? hdrModeBlockReason
                    : ecoModeBlockReason
              }
              onChange={set("contrast")}
            />
            {manualLumLocked && (
              <p className="text-xs text-amber-400/90 pt-1">{t("editor.image.dcrNote")}</p>
            )}
          </Section>

          <Section title={t("editor.image.processingTitle")}>
            <Segmented
              label={t("editor.image.gamma")}
              value={s.gamma}
              options={["Gamma 1", "Gamma 2", "Gamma 3"]}
              disabled={isGameModeActive || isHdrModeActive}
              disabledReason={isGameModeActive ? gameModeBlockReason : hdrModeBlockReason}
              onChange={set("gamma")}
            />
            <Segmented
              label={t("editor.image.ecoMode")}
              value={s.ecoMode}
              options={["Padrão", "Texto", "Internet", "Jogo", "Filme", "Esportes", "Leitura"]}
              disabled={isGameModeActive || isHdrModeActive}
              disabledReason={isGameModeActive ? gameModeBlockReason : hdrModeBlockReason}
              onChange={set("ecoMode")}
            />
            <Toggle
              label={t("editor.image.dcr")}
              description={t("editor.image.dcrDescription")}
              on={s.dcr}
              disabled={isGameModeActive}
              disabledReason={gameModeBlockReason}
              onChange={set("dcr")}
            />
          </Section>
        </section>
      )}

      {tab === "color" && (
        <section className="space-y-6">
          {(isGameModeActive || isHdrModeActive) && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3 shadow-sm min-w-0 w-full overflow-hidden">
              <Lock className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1 min-w-0 flex-1">
                <p className="font-semibold text-amber-300 break-words">
                  {isGameModeActive
                    ? t("editor.lock.gameModeActive", { mode: gameModeLabel })
                    : t("editor.lock.hdrActive", { mode: s.hdrMode })}
                </p>
                <p className="leading-relaxed break-words">
                  {isGameModeActive ? t("editor.lock.colorGameMode") : t("editor.lock.colorHdr")}
                </p>
              </div>
            </div>
          )}

          <Section title={t("editor.color.tempTitle")}>
            <Segmented
              label={t("editor.color.preset")}
              value={s.colorTemp}
              options={["sRGB", "Quente", "Normal", "Frio", "UserRGB"]}
              disabled={isHdrModeActive}
              disabledReason={hdrModeBlockReason}
              onChange={set("colorTemp")}
            />
            {s.colorTemp === "UserRGB" && (
              <div className="space-y-4 pt-2">
                <Slider
                  label={t("editor.color.red")}
                  value={s.r}
                  min={0}
                  max={100}
                  disabled={isHdrModeActive}
                  disabledReason={hdrModeBlockReason}
                  onChange={set("r")}
                />
                <Slider
                  label={t("editor.color.green")}
                  value={s.g}
                  min={0}
                  max={100}
                  disabled={isHdrModeActive}
                  disabledReason={hdrModeBlockReason}
                  onChange={set("g")}
                />
                <Slider
                  label={t("editor.color.blue")}
                  value={s.b}
                  min={0}
                  max={100}
                  disabled={isHdrModeActive}
                  disabledReason={hdrModeBlockReason}
                  onChange={set("b")}
                />
              </div>
            )}
          </Section>

          <Section title={t("editor.color.enhanceTitle")}>
            <Slider
              label={t("editor.color.gameColor")}
              value={s.gameColor}
              min={0}
              max={20}
              step={1}
              description={t("editor.color.gameColorDescription")}
              disabled={isGameModeActive || isHdrModeActive}
              disabledReason={isGameModeActive ? gameModeBlockReason : hdrModeBlockReason}
              onChange={set("gameColor")}
            />
            <Segmented
              label={t("editor.color.lowBlue")}
              value={s.lowBlue}
              options={["Desligado", "Multimídia", "Internet", "Escritório", "Leitura"]}
              disabled={isHdrModeActive}
              disabledReason={hdrModeBlockReason}
              onChange={set("lowBlue")}
            />
          </Section>
        </section>
      )}

      {tab === "perf" && (
        <section className="space-y-6">
          {isHdrModeActive && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3 shadow-sm min-w-0 w-full overflow-hidden">
              <Lock className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1 min-w-0 flex-1">
                <p className="font-semibold text-amber-300 break-words">
                  {t("editor.lock.hdrActive", { mode: s.hdrMode })}
                </p>
                <p className="leading-relaxed break-words">
                  <Trans i18nKey="editor.lock.perfHdr" components={richText} />
                </p>
              </div>
            </div>
          )}

          {!isHdrModeActive && isGameModeActive && (
            <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-4 text-xs text-blue-200 flex items-start gap-3 shadow-sm min-w-0 w-full overflow-hidden">
              <Lock className="h-5 w-5 shrink-0 text-blue-400 mt-0.5" />
              <div className="space-y-1 min-w-0 flex-1">
                <p className="font-semibold text-blue-300 break-words">
                  {t("editor.lock.gameModeActive", { mode: gameModeLabel })}
                </p>
                <p className="leading-relaxed break-words">
                  <Trans i18nKey="editor.lock.perfGameMode" components={richText} />
                </p>
              </div>
            </div>
          )}

          <Section title={t("editor.perf.gamingTitle")}>
            <Segmented
              label={t("editor.perf.gameMode")}
              value={s.gameMode}
              options={["Desligado", "FPS", "RTS", "Corrida", "Gamer 1", "Gamer 2", "Gamer 3"]}
              disabled={isHdrModeActive}
              disabledReason={hdrModeBlockReason}
              onChange={set("gameMode")}
            />
            <Segmented
              label={t("editor.perf.overdrive")}
              value={s.overdrive}
              options={["Desligado", "Fraco", "Médio", "Forte", "Boost"]}
              disabled={isGameModeActive}
              disabledReason={gameModeBlockReason}
              onChange={set("overdrive")}
            />
            <Slider
              label={t("editor.perf.shadowControl")}
              value={s.shadowControl}
              min={0}
              max={100}
              step={10}
              description={t("editor.perf.shadowDescription")}
              disabled={isGameModeActive || isHdrModeActive}
              disabledReason={isGameModeActive ? gameModeBlockReason : hdrModeBlockReason}
              onChange={set("shadowControl")}
            />
          </Section>

          <Section title={t("editor.perf.syncTitle")}>
            <Toggle
              label={t("editor.perf.adaptiveSync")}
              description={
                monInfo && !monInfo.adaptiveSyncSupported
                  ? t("editor.perf.adaptiveSyncOsdHint")
                  : t("editor.perf.adaptiveSyncDescription")
              }
              badge={
                monInfo
                  ? monInfo.adaptiveSyncSupported
                    ? t("editor.perf.badgeSupported")
                    : t("editor.perf.badgeOsd")
                  : t("editor.perf.badgeVrr")
              }
              on={s.adaptiveSync}
              onChange={set("adaptiveSync")}
            />
            {IS_LINUX ? (
              <div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground/90 space-y-1">
                <p className="font-medium text-foreground">{t("editor.perf.linuxTitle")}</p>
                <p>
                  <Trans i18nKey="editor.perf.linuxVrr" components={richText} />
                </p>
                <p>
                  <Trans i18nKey="editor.perf.linuxOsd" components={richText} />
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground/90 space-y-1">
                <p className="font-medium text-foreground">{t("editor.perf.windowsTitle")}</p>
                <p>
                  <Trans i18nKey="editor.perf.windowsVrr" components={richText} />
                </p>
                <p>
                  <Trans i18nKey="editor.perf.windowsDrr" components={richText} />
                </p>
              </div>
            )}
          </Section>
        </section>
      )}

      {tab === "extra" && (
        <section className="space-y-6">
          {isGameModeActive && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3 shadow-sm min-w-0 w-full overflow-hidden">
              <Lock className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1 min-w-0 flex-1">
                <p className="font-semibold text-amber-300 break-words">
                  {t("editor.lock.gameModeActive", { mode: gameModeLabel })}
                </p>
                <p className="leading-relaxed break-words">
                  <Trans i18nKey="editor.lock.extraGameMode" components={richText} />
                </p>
              </div>
            </div>
          )}

          <Section title={t("editor.extra.osdTitle")}>
            <Toggle
              label={t("editor.extra.dialPoint")}
              description={t("editor.extra.dialPointDescription")}
              badge={t("editor.extra.crosshairBadge")}
              on={s.crosshair}
              onChange={set("crosshair")}
            />
            <Segmented
              label={t("editor.extra.frameCounter")}
              value={s.frameCounter}
              options={["Desligado", "Sup. Direito", "Inf. Direito", "Inf. Esquerdo", "Sup. Esquerdo"]}
              onChange={set("frameCounter")}
            />
          </Section>

          <Section title={t("editor.extra.hdrTitle")}>
            <Segmented
              label={t("editor.extra.hdrMode")}
              value={s.hdrMode}
              options={["Off", "HDR Picture", "HDR Movie", "HDR Game"]}
              disabled={isGameModeActive}
              disabledReason={gameModeBlockReason}
              onChange={set("hdrMode")}
            />
            <p className="text-xs text-muted-foreground/85">{t("editor.extra.hdrDescription")}</p>
          </Section>
        </section>
      )}

      {tab === "apps" && (
        <section className="space-y-6">
          {/* Perfil Padrão do Sistema */}
          <Section title={t("editor.apps.defaultTitle")}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl bg-secondary/40 p-4 border border-border/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Star className={`h-4 w-4 ${isDefault ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />
                  <span className="text-sm font-semibold text-foreground">
                    {t("editor.apps.setDefault")}
                  </span>
                  {isDefault && (
                    <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                      {t("editor.apps.currentDefault")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("editor.apps.defaultDescription")}
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleDefault}
                disabled={isDefault}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                  isDefault
                    ? "bg-secondary text-muted-foreground/60 cursor-default border border-border/40"
                    : "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
                }`}
              >
                {isDefault ? t("editor.apps.defaultActive") : t("editor.apps.makeDefault")}
              </button>
            </div>
          </Section>

          {/* Jogos e Executáveis Vinculados */}
          <Section title={t("editor.apps.linkedTitle")}>
            <p className="text-xs text-muted-foreground">{t("editor.apps.linkedDescription")}</p>

            {/* Lista de tags de executáveis */}
            <div className="flex flex-wrap gap-2 pt-1">
              {assignedExes.length === 0 ? (
                <div className="w-full rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
                  {t("editor.apps.noExes")}
                </div>
              ) : (
                assignedExes.map((exe) => (
                  <div
                    key={exe}
                    className="flex items-center gap-2 rounded-xl bg-secondary/80 border border-border/70 px-3 py-1.5 text-xs font-mono font-medium text-foreground shadow-sm group hover:border-primary/50 transition"
                  >
                    <Gamepad2 className="h-3.5 w-3.5 text-primary" />
                    <span>{exe}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveExe(exe)}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-red-400 transition"
                      title={t("editor.apps.removeExe", { exe })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Input para adicionar manualmente */}
            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={newExe}
                  onChange={(e) => setNewExe(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddExe(newExe);
                  }}
                  placeholder={t("editor.apps.exePlaceholder")}
                  className="w-full rounded-xl bg-secondary/60 border border-border/80 px-4 py-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary transition font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() => handleAddExe(newExe)}
                disabled={!newExe.trim()}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-secondary text-xs font-medium text-foreground hover:bg-primary hover:text-primary-foreground transition disabled:opacity-50 disabled:pointer-events-none"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t("editor.apps.add")}</span>
              </button>
              <button
                type="button"
                onClick={handleLoadRunningApps}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border/80 bg-secondary/40 text-xs font-medium text-foreground hover:bg-secondary transition"
                title={t("editor.apps.runningTitle")}
              >
                <Search className="h-3.5 w-3.5 text-primary" />
                <span>{t("editor.apps.runningButton")}</span>
              </button>
            </div>

            {/* Modal / Painel de Apps em Execução */}
            {showAppsPicker && (
              <div className="mt-4 rounded-xl border border-border/80 bg-card p-4 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <div className="flex items-center gap-2">
                    <Laptop className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">
                      {t("editor.apps.detectedTitle")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAppsPicker(false)}
                    className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <input
                  type="text"
                  value={appsSearch}
                  onChange={(e) => setAppsSearch(e.target.value)}
                  placeholder={t("editor.apps.filterPlaceholder")}
                  className="w-full rounded-lg bg-secondary/60 border border-border/60 px-3 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary transition"
                />

                {loadingApps ? (
                  <div className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>{t("editor.apps.detecting")}</span>
                  </div>
                ) : filteredRunningApps.length === 0 ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    {t("editor.apps.noMatch")}
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {filteredRunningApps.map((app, idx) => {
                      const alreadyAdded = assignedExes.includes(app.exeName);
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-3 p-2 rounded-lg bg-secondary/40 hover:bg-secondary transition"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">{app.name}</p>
                            <p className="text-[10px] font-mono text-muted-foreground truncate">{app.exeName}</p>
                          </div>
                          <button
                            type="button"
                            disabled={alreadyAdded}
                            onClick={() => handleAddExe(app.exeName)}
                            className={`px-3 py-1 rounded-md text-[11px] font-medium transition ${
                              alreadyAdded
                                ? "bg-secondary text-muted-foreground/50 cursor-default"
                                : "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
                            }`}
                          >
                            {alreadyAdded ? t("editor.apps.linked") : t("editor.apps.link")}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Section>
        </section>
      )}

      {/* Barra Flutuante de Salvamento quando houver alterações pendentes */}
      {hasChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl flex items-center justify-between rounded-2xl border border-border/80 bg-card/95 p-4 backdrop-blur-xl shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-4">
          <div className="text-sm">
            <span className="font-semibold text-foreground">{t("editor.pending.title")}</span>
            <p className="text-xs text-muted-foreground">{t("editor.pending.description")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDiscard}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t("editor.pending.discard")}</span>
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-glow hover:opacity-90 transition"
            >
              {saving ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span>{t("editor.pending.sending")}</span>
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  <span>{t("editor.pending.saveApply")}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel space-y-4 p-6">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  description,
  disabled = false,
  disabledReason,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number | undefined;
  unit?: string | undefined;
  description?: string | undefined;
  disabled?: boolean | undefined;
  disabledReason?: string | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <div className={`space-y-1.5 transition-opacity min-w-0 ${disabled ? "opacity-50 select-none" : ""}`}>
      <div className="flex items-center justify-between gap-3 text-sm min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="text-muted-foreground shrink-0">{label}</span>
            {disabled && disabledReason && (
              <span
                title={disabledReason}
                className="inline-flex items-center gap-1 text-[10px] text-amber-400/90 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md shrink-0 max-w-full"
              >
                <Lock className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{disabledReason}</span>
              </span>
            )}
          </div>
          {description && <p className="text-xs text-muted-foreground/80 break-words mt-0.5">{description}</p>}
        </div>
        <span className="font-mono text-xs font-medium shrink-0">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary disabled:cursor-not-allowed"
      />
    </div>
  );
}

function Segmented({
  label,
  value,
  options,
  disabled = false,
  disabledReason,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  disabled?: boolean | undefined;
  disabledReason?: string | undefined;
  onChange: (v: string) => void;
}) {
  const valueLabel = useValueLabel();
  return (
    <div className={`space-y-2 transition-opacity min-w-0 ${disabled ? "opacity-50 select-none" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <span className="text-sm text-muted-foreground shrink-0">{label}</span>
        {disabled && disabledReason && (
          <span
            title={disabledReason}
            className="inline-flex items-center gap-1 text-[10px] text-amber-400/90 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md shrink-0 max-w-full"
          >
            <Lock className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{disabledReason}</span>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-secondary p-1">
        {options.map((opt) => (
          <button
            key={opt}
            disabled={disabled}
            onClick={() => onChange(opt)}
            className={`flex-1 min-w-[50px] sm:min-w-[65px] rounded-lg py-1 sm:py-1.5 px-1.5 sm:px-2 text-[11px] sm:text-xs font-medium transition ${
              value === opt ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            } ${disabled ? "cursor-not-allowed pointer-events-none" : ""}`}
          >
            {valueLabel(opt)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  badge,
  on,
  disabled = false,
  disabledReason,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string | undefined;
  badge?: string | undefined;
  disabled?: boolean | undefined;
  disabledReason?: string | undefined;
}) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`flex w-full items-center justify-between gap-3 rounded-xl bg-secondary px-4 py-3 text-left transition min-w-0 ${
        disabled
          ? "opacity-50 cursor-not-allowed select-none"
          : "hover:bg-accent cursor-pointer"
      }`}
    >
      <div className="space-y-0.5 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="text-sm font-medium text-foreground shrink-0">{label}</span>
          {badge && (
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary shrink-0">
              {badge}
            </span>
          )}
          {disabled && disabledReason && (
            <span
              title={disabledReason}
              className="inline-flex items-center gap-1 text-[10px] text-amber-400/90 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md shrink-0 max-w-full"
            >
              <Lock className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{disabledReason}</span>
            </span>
          )}
        </div>
        {description && <p className="text-xs text-muted-foreground break-words mt-0.5">{description}</p>}
      </div>
      <span
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shrink-0 ${
          on ? "bg-primary" : "bg-muted-foreground/30"
        } ${disabled ? "pointer-events-none" : ""}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-lg ring-0 transition duration-200 ease-in-out ${
            on ? "translate-x-5 bg-primary-foreground" : "translate-x-0 bg-foreground"
          }`}
        />
      </span>
    </button>
  );
}
