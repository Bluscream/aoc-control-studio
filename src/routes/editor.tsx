import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
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

export const Route = createFileRoute("/editor")({
  validateSearch: (s: Record<string, unknown>) => ({ id: typeof s["id"] === "string" ? s["id"] : "custom" }),
  head: () => ({
    meta: [
      { title: "Editar modo — AOC Control Studio" },
      { name: "description", content: "Ajuste brilho, cor, overdrive, freesync e recursos do monitor AOC 24G2S." },
    ],
  }),
  component: Editor,
});

const IS_LINUX = typeof navigator !== "undefined" && /linux/i.test(navigator.userAgent);

const tabs = [
  { id: "image", label: "Imagem", icon: Sun },
  { id: "color", label: "Cor", icon: Palette },
  { id: "perf", label: "Desempenho", icon: Zap },
  { id: "extra", label: "Recursos", icon: Sparkles },
  { id: "apps", label: "Aplicativos", icon: Gamepad2 },
] as const;

function Editor() {
  const { id } = Route.useSearch();
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
      setWarnings(["Não foi possível ler os valores atuais do monitor via DDC/CI."]);
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

  const gameModeBlockReason = `Bloqueado pelo Modo de Jogo AOC (${s.gameMode})`;
  const hdrModeBlockReason = `Bloqueado pelo Modo HDR (${s.hdrMode})`;
  const ecoModeBlockReason = `Bloqueado pelo Modo ECO (${s.ecoMode})`;
  const dcrBlockReason = "Bloqueado pelo DCR (Contraste Dinâmico)";

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
      setWarnings([
        `Valores do perfil "${b?.name || id}" restaurados para o padrão original de fábrica da AOC. Clique em "Salvar no Monitor" para aplicar ao hardware.`,
      ]);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 pb-28">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar aos Modos
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(35%,1fr)_auto] items-start sm:items-center justify-between gap-6 mb-6">
        <div className="min-w-0 pr-2">
          {builtInModes.some((b) => b.id === id) || id === "custom" ? (
            <h1 className="mb-1 text-2xl sm:text-3xl font-semibold tracking-tight break-words">
              {name || "Modo"}
            </h1>
          ) : (
            <div className="mb-1 flex items-center gap-2 group">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do modo..."
                className="w-full max-w-sm bg-transparent text-2xl sm:text-3xl font-semibold tracking-tight text-foreground border-b border-transparent hover:border-border/60 focus:border-primary pb-0.5 outline-none transition"
              />
              <Pencil className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground transition shrink-0" />
            </div>
          )}
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Ajuste os controles livremente. Os comandos só são enviados ao monitor ao clicar em Salvar.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 shrink-0 w-full sm:w-auto">
          {isBuiltIn && (
            <button
              type="button"
              onClick={handleResetToDefault}
              title="Restaurar este perfil para as configurações originais de fábrica da AOC"
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-secondary text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 border border-amber-500/20 transition cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Restaurar Padrão</span>
            </button>
          )}

          <button
            type="button"
            onClick={async () => {
              try {
                await exportSingleProfile(id);
              } catch (err: unknown) {
                const e = err as { message?: string };
                setWarnings([e?.message || "Erro ao exportar perfil."]);
              }
            }}
            title="Escolher onde salvar as configurações deste perfil em arquivo JSON"
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Exportar JSON</span>
          </button>

          <button
            type="button"
            onClick={handleReadFromMonitor}
            disabled={readingHw || saving}
            title="Carregar os valores que estão ativos agora no monitor"
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${readingHw ? "animate-spin" : ""}`} />
            <span className="truncate">{readingHw ? "Lendo..." : "Ler do Monitor"}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition shadow-sm ${
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
                <span className="truncate">Aplicando...</span>
              </>
            ) : savedSuccess ? (
              <>
                <Check className="h-3.5 w-3.5 stroke-[3] shrink-0" />
                <span className="truncate">Salvo e Aplicado!</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{hasChanges ? "Salvar no Monitor" : "Sem alterações"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 space-y-1">
          {warnings.map((w, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <nav className="mb-6 flex gap-1 rounded-xl bg-secondary p-1">
        {tabs.map(({ id: t, label, icon: Icon }) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition ${
              tab === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </nav>

      {tab === "image" && (
        <section className="space-y-6">
          {/* Alertas de bloqueio por Game Mode ou HDR Mode */}
          {isGameModeActive && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3 shadow-sm">
              <Lock className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-300">
                  Modo de Jogo AOC ativo ({s.gameMode})
                </p>
                <p className="leading-relaxed">
                  O firmware do monitor AOC assume o controle e bloqueia os ajustes manuais de <strong>Brilho</strong>, <strong>Contraste</strong>, <strong>Gama</strong>, <strong>Modo ECO</strong> e <strong>DCR</strong> enquanto um Modo de Jogo pré-calibrado estiver ativo. Para ajustá-los livremente, defina o Modo de Jogo como <em>"Desligado"</em> na aba <strong>Desempenho</strong>.
                </p>
              </div>
            </div>
          )}

          {!isGameModeActive && isHdrModeActive && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3 shadow-sm">
              <Lock className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-300">
                  Modo HDR ativo ({s.hdrMode})
                </p>
                <p className="leading-relaxed">
                  O perfil HDR em execução calibra dinamicamente a curva de imagem e bloqueia <strong>Contraste</strong>, <strong>Gama</strong> e <strong>Modo ECO</strong>. Para liberar esses controles, defina o Modo HDR como <em>"Off"</em> na aba <strong>Recursos</strong>.
                </p>
              </div>
            </div>
          )}

          {!isGameModeActive && !isHdrModeActive && isEcoModeActive && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3 shadow-sm">
              <Lock className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-300">
                  Modo ECO ativo ({s.ecoMode})
                </p>
                <p className="leading-relaxed">
                  O perfil de economia de energia ECO ({s.ecoMode}) assume a calibração do monitor e bloqueia os ajustes manuais de <strong>Brilho</strong> e <strong>Contraste</strong>. Para ajustá-los livremente, defina o Modo ECO como <em>"Padrão"</em> abaixo.
                </p>
              </div>
            </div>
          )}

          <Section title="Iluminação & Contraste">
            <Slider
              label="Brilho"
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
              label="Contraste"
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
              <p className="text-xs text-amber-400/90 pt-1">
                Nota: No firmware AOC, enquanto o DCR estiver ligado ou o Modo ECO não estiver em "Padrão", o monitor controla o brilho e o contraste automaticamente.
              </p>
            )}
          </Section>

          <Section title="Processamento de Imagem">
            <Segmented
              label="Curva de Gamma"
              value={s.gamma}
              options={["Gamma 1", "Gamma 2", "Gamma 3"]}
              disabled={isGameModeActive || isHdrModeActive}
              disabledReason={isGameModeActive ? gameModeBlockReason : hdrModeBlockReason}
              onChange={set("gamma")}
            />
            <Segmented
              label="Modo ECO"
              value={s.ecoMode}
              options={["Padrão", "Texto", "Internet", "Jogo", "Filme", "Esportes", "Leitura"]}
              disabled={isGameModeActive || isHdrModeActive}
              disabledReason={isGameModeActive ? gameModeBlockReason : hdrModeBlockReason}
              onChange={set("ecoMode")}
            />
            <Toggle
              label="DCR (Contraste Dinâmico)"
              description="Ajusta o contraste automaticamente com base na cena exibida"
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
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3 shadow-sm">
              <Lock className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-300">
                  {isGameModeActive
                    ? `Modo de Jogo AOC ativo (${s.gameMode})`
                    : `Modo HDR ativo (${s.hdrMode})`}
                </p>
                <p className="leading-relaxed">
                  {isGameModeActive
                    ? `O Modo de Jogo AOC calibra e bloqueia o controle manual de Game Color (saturação).`
                    : `O Modo HDR ativo assume a colorimetria do painel e bloqueia a Temperatura de Cor, Game Color e o Filtro de Luz Azul (Low Blue Light).`}
                </p>
              </div>
            </div>
          )}

          <Section title="Temperatura de Cor">
            <Segmented
              label="Predefinição"
              value={s.colorTemp}
              options={["sRGB", "Quente", "Normal", "Frio", "UserRGB"]}
              disabled={isHdrModeActive}
              disabledReason={hdrModeBlockReason}
              onChange={set("colorTemp")}
            />
            {s.colorTemp === "UserRGB" && (
              <div className="space-y-4 pt-2">
                <Slider
                  label="Vermelho (R)"
                  value={s.r}
                  min={0}
                  max={100}
                  disabled={isHdrModeActive}
                  disabledReason={hdrModeBlockReason}
                  onChange={set("r")}
                />
                <Slider
                  label="Verde (G)"
                  value={s.g}
                  min={0}
                  max={100}
                  disabled={isHdrModeActive}
                  disabledReason={hdrModeBlockReason}
                  onChange={set("g")}
                />
                <Slider
                  label="Azul (B)"
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

          <Section title="Realce & Conforto Visual">
            <Slider
              label="Game Color (Saturação Gamer)"
              value={s.gameColor}
              min={0}
              max={20}
              step={1}
              description="Escala real do hardware AOC (0 = P&B, 10 = Padrão, 20 = Saturação máxima)"
              disabled={isGameModeActive || isHdrModeActive}
              disabledReason={isGameModeActive ? gameModeBlockReason : hdrModeBlockReason}
              onChange={set("gameColor")}
            />
            <Segmented
              label="Low Blue Light (Filtro de Luz Azul)"
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
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3 shadow-sm">
              <Lock className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-300">
                  Modo HDR ativo ({s.hdrMode})
                </p>
                <p className="leading-relaxed">
                  O monitor bloqueia o <strong>Modo de Jogo AOC</strong> e o <strong>Shadow Control</strong> enquanto um perfil HDR estiver em execução. Para usar os Modos de Jogo, desligue o Modo HDR na aba <strong>Recursos</strong>.
                </p>
              </div>
            </div>
          )}

          {!isHdrModeActive && isGameModeActive && (
            <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-4 text-xs text-blue-200 flex items-start gap-3 shadow-sm">
              <Lock className="h-5 w-5 shrink-0 text-blue-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-blue-300">
                  Modo de Jogo AOC ativo ({s.gameMode})
                </p>
                <p className="leading-relaxed">
                  Com o Modo de Jogo ativo, o firmware define automaticamente o <strong>Overdrive</strong> e o <strong>Shadow Control</strong> ideais para esse tipo de jogo, bloqueando alterações manuais.
                </p>
              </div>
            </div>
          )}

          <Section title="Otimização para Jogos">
            <Segmented
              label="Modo de Jogo AOC"
              value={s.gameMode}
              options={["Desligado", "FPS", "RTS", "Corrida", "Gamer 1", "Gamer 2", "Gamer 3"]}
              disabled={isHdrModeActive}
              disabledReason={hdrModeBlockReason}
              onChange={set("gameMode")}
            />
            <Segmented
              label="Overdrive"
              value={s.overdrive}
              options={["Desligado", "Fraco", "Médio", "Forte", "Boost"]}
              disabled={isGameModeActive}
              disabledReason={gameModeBlockReason}
              onChange={set("overdrive")}
            />
            <Slider
              label="Shadow Control"
              value={s.shadowControl}
              min={0}
              max={100}
              step={10}
              description="Ajusta áreas escuras em passos de 10 (50 = Neutro)"
              disabled={isGameModeActive || isHdrModeActive}
              disabledReason={isGameModeActive ? gameModeBlockReason : hdrModeBlockReason}
              onChange={set("shadowControl")}
            />
          </Section>

          <Section title="Sincronização Gamer">
            <Toggle
              label="AMD FreeSync / Taxa Variável (VRR)"
              description={
                monInfo && !monInfo.adaptiveSyncSupported
                  ? "Deixe 'Adaptive-Sync' ligado uma única vez nos botões físicos do monitor (Config. Jogo → Adaptive-Sync) para liberar o controle via software."
                  : "Ativa o AMD FreeSync no driver Radeon e a Taxa de Atualização Variável (VRR) nas configurações de tela do sistema para eliminar tearing"
              }
              badge={
                monInfo
                  ? monInfo.adaptiveSyncSupported
                    ? "FreeSync + VRR"
                    : "Requer OSD Ativo"
                  : "VRR"
              }
              on={s.adaptiveSync}
              onChange={set("adaptiveSync")}
            />
            {IS_LINUX ? (
              <div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground/90 space-y-1">
                <p className="font-medium text-foreground">💡 Informação sobre o Linux:</p>
                <p>
                  No Linux o VRR é controlado pelo compositor (COSMIC via <span className="font-mono text-primary">cosmic-randr</span>, KDE via <span className="font-mono text-primary">kscreen-doctor</span>). Confira o estado em Configurações → Telas.
                </p>
                <p>
                  Se aparecer "Requer OSD Ativo", ligue <em>Adaptive-Sync</em> nos botões físicos do monitor e verifique se o driver <span className="font-mono">amdgpu</span> anuncia suporte para a saída.
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground/90 space-y-1">
                <p className="font-medium text-foreground">💡 Informação sobre o Windows 11:</p>
                <p>
                  A linha <span className="font-mono text-primary">"Taxa de atualização variável: Com suporte (48 Hz - 165 Hz)"</span> no Windows confirma que o FreeSync está 100% ativo.
                </p>
                <p>
                  A opção <em>"Taxa de atualização dinâmica"</em> exibida nas configurações do Windows é o DRR (exclusivo para economia de bateria de laptops) e não se aplica a placas de vídeo desktop como a RX 6600.
                </p>
              </div>
            )}
          </Section>
        </section>
      )}

      {tab === "extra" && (
        <section className="space-y-6">
          {isGameModeActive && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3 shadow-sm">
              <Lock className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-300">
                  Modo de Jogo AOC ativo ({s.gameMode})
                </p>
                <p className="leading-relaxed">
                  O <strong>Modo HDR</strong> está bloqueado porque ativar o HDR cancela automaticamente o Modo de Jogo no firmware do monitor AOC. Para ativar o HDR, defina o Modo de Jogo como <em>"Desligado"</em> na aba <strong>Desempenho</strong>.
                </p>
              </div>
            </div>
          )}

          <Section title="Assistência em Tela">
            <Toggle
              label="Dial Point (Mira na Tela)"
              description="Exibe a mira nativa de hardware do monitor no centro da tela"
              badge="Crosshair"
              on={s.crosshair}
              onChange={set("crosshair")}
            />
            <Segmented
              label="Contador de Quadros (Frame Counter)"
              value={s.frameCounter}
              options={["Desligado", "Sup. Direito", "Inf. Direito", "Inf. Esquerdo", "Sup. Esquerdo"]}
              onChange={set("frameCounter")}
            />
          </Section>

          <Section title="Perfis HDR (HDR Mode)">
            <Segmented
              label="Modo HDR do Monitor"
              value={s.hdrMode}
              options={["Off", "HDR Picture", "HDR Movie", "HDR Game"]}
              disabled={isGameModeActive}
              disabledReason={gameModeBlockReason}
              onChange={set("hdrMode")}
            />
            <p className="text-xs text-muted-foreground/85">
              O AOC 24G2S conta com perfis avançados integrados no firmware (Off, HDR Picture, HDR Movie e HDR Game) que expandem dinamicamente o contraste e saturação de cores sem distorcer o sinal SDR.
            </p>
          </Section>
        </section>
      )}

      {tab === "apps" && (
        <section className="space-y-6">
          {/* Perfil Padrão do Sistema */}
          <Section title="Padrão do Sistema Operacional">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl bg-secondary/40 p-4 border border-border/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Star className={`h-4 w-4 ${isDefault ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />
                  <span className="text-sm font-semibold text-foreground">Definir como Perfil Padrão do Sistema</span>
                  {isDefault && (
                    <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                      Padrão Atual
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Quando você fechar os jogos vinculados ou simplesmente estiver navegando na Área de Trabalho, o monitor aplicará automaticamente este perfil.
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
                {isDefault ? "Padrão Ativo" : "Tornar Padrão"}
              </button>
            </div>
          </Section>

          {/* Jogos e Executáveis Vinculados */}
          <Section title="Jogos e Executáveis Vinculados">
            <p className="text-xs text-muted-foreground">
              Sempre que qualquer um dos executáveis abaixo entrar em primeiro plano, o monitor alternará para este perfil automaticamente.
            </p>

            {/* Lista de tags de executáveis */}
            <div className="flex flex-wrap gap-2 pt-1">
              {assignedExes.length === 0 ? (
                <div className="w-full rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
                  Nenhum executável vinculado a este perfil. Digite o nome do executável abaixo ou escolha entre os aplicativos atualmente abertos no sistema.
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
                      title={`Remover ${exe}`}
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
                  placeholder="Ex: cs2.exe, valorant.exe, firefox, steam..."
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
                <span>Adicionar</span>
              </button>
              <button
                type="button"
                onClick={handleLoadRunningApps}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border/80 bg-secondary/40 text-xs font-medium text-foreground hover:bg-secondary transition"
                title="Detectar janelas e jogos abertos agora"
              >
                <Search className="h-3.5 w-3.5 text-primary" />
                <span>Apps Abertos Agora</span>
              </button>
            </div>

            {/* Modal / Painel de Apps em Execução */}
            {showAppsPicker && (
              <div className="mt-4 rounded-xl border border-border/80 bg-card p-4 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <div className="flex items-center gap-2">
                    <Laptop className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">
                      Aplicativos e Jogos detectados
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
                  placeholder="Filtrar aplicativos abertos..."
                  className="w-full rounded-lg bg-secondary/60 border border-border/60 px-3 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary transition"
                />

                {loadingApps ? (
                  <div className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Detectando janelas ativas...</span>
                  </div>
                ) : filteredRunningApps.length === 0 ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    Nenhum aplicativo encontrado com este filtro.
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
                            {alreadyAdded ? "Vinculado" : "+ Vincular"}
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
            <span className="font-semibold text-foreground">Alterações pendentes</span>
            <p className="text-xs text-muted-foreground">Clique para enviar as configurações para o monitor.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDiscard}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Descartar</span>
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-glow hover:opacity-90 transition"
            >
              {saving ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  <span>Salvar e Aplicar</span>
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
    <div className={`space-y-1.5 transition-opacity ${disabled ? "opacity-50 select-none" : ""}`}>
      <div className="flex items-center justify-between text-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{label}</span>
            {disabled && disabledReason && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400/90 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                <Lock className="h-2.5 w-2.5" />
                <span>{disabledReason}</span>
              </span>
            )}
          </div>
          {description && <p className="text-xs text-muted-foreground/80">{description}</p>}
        </div>
        <span className="font-mono text-xs font-medium">
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
  return (
    <div className={`space-y-2 transition-opacity ${disabled ? "opacity-50 select-none" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {disabled && disabledReason && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400/90 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
            <Lock className="h-2.5 w-2.5" />
            <span>{disabledReason}</span>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-secondary p-1">
        {options.map((opt) => (
          <button
            key={opt}
            disabled={disabled}
            onClick={() => onChange(opt)}
            className={`flex-1 min-w-[70px] rounded-lg py-1.5 px-3 text-xs font-medium transition ${
              value === opt ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            } ${disabled ? "cursor-not-allowed pointer-events-none" : ""}`}
          >
            {opt}
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
      className={`flex w-full items-center justify-between rounded-xl bg-secondary px-4 py-3 text-left transition ${
        disabled
          ? "opacity-50 cursor-not-allowed select-none"
          : "hover:bg-accent"
      }`}
    >
      <div className="space-y-0.5 pr-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {badge && (
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {badge}
            </span>
          )}
          {disabled && disabledReason && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400/90 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
              <Lock className="h-2.5 w-2.5" />
              <span>{disabledReason}</span>
            </span>
          )}
        </div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <span
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
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
