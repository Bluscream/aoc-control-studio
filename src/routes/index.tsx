import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Monitor,
  Plus,
  SlidersHorizontal,
  Check,
  Trash2,
  Pencil,
  Crosshair,
  Gauge,
  BookOpen,
  Film,
  Swords,
  Sparkles,
  AlertCircle,
  X,
  Star,
  Gamepad2,
  Zap,
  Download,
  Upload,
  FolderArchive,
  FileJson,
  RotateCcw,
} from "lucide-react";
import {
  useModes,
  fetchMonitorInfo,
  exportAllConfigurations,
  exportSingleProfile,
  handleFileImport,
  type Mode,
  type MonitorInfo,
} from "@/lib/modes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Modos do monitor — AOC Control Studio" },
      {
        name: "description",
        content: "Escolha ou crie modos de imagem para o seu monitor AOC 24G2S.",
      },
    ],
  }),
  component: Index,
});

function getModeIcon(id: string) {
  switch (id) {
    case "fps":
      return <Crosshair className="h-5 w-5 text-red-400" />;
    case "rts":
      return <Swords className="h-5 w-5 text-amber-400" />;
    case "racing":
      return <Gauge className="h-5 w-5 text-blue-400" />;
    case "work":
      return <BookOpen className="h-5 w-5 text-emerald-400" />;
    case "cinema":
      return <Film className="h-5 w-5 text-purple-400" />;
    case "custom":
      return <SlidersHorizontal className="h-5 w-5 text-foreground" />;
    default:
      return <Sparkles className="h-5 w-5 text-primary" />;
  }
}

function Index() {
  const navigate = useNavigate();
  const {
    modes,
    active,
    defaultModeId,
    setDefaultMode,
    autoProfileEnabled,
    setAutoProfileEnabled,
    toggleProfileAutoSwitch,
    isProfileAutoSwitchEnabled,
    setActive,
    create,
    remove,
    resetAll,
    refreshModes,
    lastWarnings,
    clearWarnings,
  } = useModes();
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [monInfo, setMonInfo] = useState<MonitorInfo | null>(null);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [selectedExportProfile, setSelectedExportProfile] = useState<string>("all");
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    fetchMonitorInfo().then((info) => {
      if (info) setMonInfo(info);
    });
  }, []);

  const handleSelectMode = async (id: string) => {
    setApplyingId(id);
    await setActive(id);
    const info = await fetchMonitorInfo();
    if (info) setMonInfo(info);
    setApplyingId(null);
  };

  const handleCreateNewMode = () => {
    try {
      console.log("[Index] Clique em + Novo modo");
      const nextNum = modes.filter((m) => !m.isBuiltIn).length + 1;
      const newMode = create(`Modo Personalizado ${nextNum}`);
      console.log("[Index] Modo criado com sucesso:", newMode.id, newMode.name);
      console.log("[Index] Disparando navegação para /editor...");
      navigate({ to: "/editor", search: { id: newMode.id } });
    } catch (err) {
      console.error("[Index] Erro ao criar modo:", err);
    }
  };

  const handleExport = async () => {
    try {
      if (selectedExportProfile === "all") {
        const saved = await exportAllConfigurations();
        if (saved) {
          setFeedbackMsg({
            text: "Backup completo com todas as configurações exportado com sucesso!",
          });
          setTimeout(() => setFeedbackMsg(null), 4000);
        }
      } else {
        const saved = await exportSingleProfile(selectedExportProfile);
        if (saved) {
          const name =
            modes.find((m) => m.id === selectedExportProfile)?.name ||
            (selectedExportProfile === "custom" ? "Custom" : selectedExportProfile);
          setFeedbackMsg({ text: `Perfil "${name}" exportado em JSON com sucesso!` });
          setTimeout(() => setFeedbackMsg(null), 4000);
        }
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setFeedbackMsg({ text: e?.message || "Erro ao exportar JSON.", isError: true });
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  const handleImport = async () => {
    try {
      const res = await handleFileImport();
      refreshModes();
      setFeedbackMsg({ text: res.message });
      setTimeout(() => setFeedbackMsg(null), 5000);
      setShowBackupDialog(false);
    } catch (err: unknown) {
      const e = err as { message?: string };
      if (e?.message !== "Nenhum arquivo selecionado") {
        setFeedbackMsg({ text: e?.message || "Erro ao importar arquivo JSON.", isError: true });
        setTimeout(() => setFeedbackMsg(null), 6000);
      }
    }
  };

  const handleResetAll = () => {
    resetAll();
    setShowConfirmReset(false);
    setShowBackupDialog(false);
    setFeedbackMsg({
      text: "Todas as configurações e perfis foram restaurados aos padrões originais de fábrica!",
    });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  const defaultModeName =
    modes.find((m) => m.id === defaultModeId)?.name ||
    (defaultModeId === "custom" ? "Custom" : "Padrão");

  return (
    <main className="mx-auto max-w-3xl sm:max-w-4xl px-4 sm:px-6 py-10 sm:py-14 min-w-0">
      {/* Header com dados reais do monitor */}
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-secondary shadow-sm">
            <Monitor className="h-5 w-5 text-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">AOC Control Studio</h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                  monInfo?.ddcSupported === false
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                }`}
              >
                {monInfo?.ddcSupported === false ? "DDC Offline" : "DDC/CI Ativo"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {monInfo?.name || "AOC Monitor"} · {monInfo?.connection || "DisplayPort"} · DDC/CI I2C
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowConfirmReset(false);
            setShowBackupDialog(true);
          }}
          className="flex items-center gap-2 rounded-xl border border-border/80 bg-secondary/80 px-3.5 py-2 text-xs font-medium text-muted-foreground transition hover:border-foreground/40 hover:text-foreground hover:bg-secondary cursor-pointer shadow-sm shrink-0"
          title="Exportar/Importar perfis e gerenciar configurações"
        >
          <FolderArchive className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline">Backup & Perfis</span>
        </button>
      </header>

      {/* Painel de Automação de Perfil por Aplicativo */}
      <div className="mb-8 rounded-2xl border border-border/70 bg-secondary/30 p-4 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 min-w-0">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Troca Automática por Aplicativo
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                autoProfileEnabled
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-secondary text-muted-foreground border-border/40"
              }`}
            >
              {autoProfileEnabled ? "Ativo em 2º plano" : "Desativado"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Ao focar em um jogo ou executável vinculado, o monitor troca automaticamente para o
            perfil correspondente. Na Área de Trabalho, ele retorna para o padrão:{" "}
            <span className="font-semibold text-foreground underline decoration-primary/50 underline-offset-2">
              {defaultModeName}
            </span>
            .
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setAutoProfileEnabled(!autoProfileEnabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              autoProfileEnabled ? "bg-primary" : "bg-muted-foreground/30"
            }`}
            title={autoProfileEnabled ? "Desativar troca automática" : "Ativar troca automática"}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-lg ring-0 transition duration-200 ease-in-out ${
                autoProfileEnabled
                  ? "translate-x-5 bg-primary-foreground"
                  : "translate-x-0 bg-foreground"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h2 className="mb-1 text-2xl font-semibold tracking-tight">Modos de Imagem</h2>
          <p className="text-sm text-muted-foreground">
            Clique no card para ativar, na estrela para torná-lo o padrão do sistema, ou no lápis
            para vincular executáveis.
          </p>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`mb-6 flex items-start justify-between gap-3 rounded-xl border p-4 text-xs transition-all shadow-sm min-w-0 w-full overflow-hidden ${
            feedbackMsg.isError
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {feedbackMsg.isError ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            ) : (
              <Check className="h-4 w-4 shrink-0 text-emerald-400 stroke-[3] mt-0.5" />
            )}
            <span className="break-words min-w-0 flex-1">{feedbackMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="rounded-lg p-1 text-muted-foreground hover:text-foreground transition cursor-pointer shrink-0"
            aria-label="Fechar mensagem"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {lastWarnings.length > 0 && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 min-w-0 w-full overflow-hidden">
          <div className="space-y-1 min-w-0 flex-1">
            {lastWarnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 min-w-0">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <span className="break-words min-w-0 flex-1">{w}</span>
              </div>
            ))}
          </div>
          <button
            onClick={clearWarnings}
            className="rounded-lg p-1 text-amber-300/70 hover:text-amber-100 transition cursor-pointer shrink-0"
            aria-label="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* Modo Custom (Ajuste livre) */}
        <ModeCard
          id="custom"
          name="Custom"
          subtitle="Ajuste livre · Customizado"
          active={active === "custom"}
          isDefault={defaultModeId === "custom"}
          onSetDefault={() => setDefaultMode("custom")}
          applying={applyingId === "custom"}
          onSelect={() => handleSelectMode("custom")}
          onExport={async () => {
            const saved = await exportSingleProfile("custom");
            if (saved) {
              setFeedbackMsg({ text: "Perfil Custom exportado em JSON com sucesso!" });
              setTimeout(() => setFeedbackMsg(null), 4000);
            }
          }}
          icon={getModeIcon("custom")}
        />

        {/* Modos cadastrados (Built-in + Customizados do usuário) */}
        {modes.map((m: Mode) => (
          <ModeCard
            key={m.id}
            id={m.id}
            name={m.name}
            subtitle={m.subtitle || `${m.settings.brightness}% brilho · ${m.settings.overdrive}`}
            active={active === m.id}
            isDefault={defaultModeId === m.id}
            assignedExes={m.assignedExes}
            autoSwitchEnabled={isProfileAutoSwitchEnabled(m.id)}
            onToggleAutoSwitch={() => toggleProfileAutoSwitch(m.id)}
            onSetDefault={() => setDefaultMode(m.id)}
            applying={applyingId === m.id}
            onSelect={() => handleSelectMode(m.id)}
            onRemove={m.isBuiltIn ? undefined : () => remove(m.id)}
            onExport={async () => {
              const saved = await exportSingleProfile(m.id);
              if (saved) {
                setFeedbackMsg({ text: `Perfil "${m.name}" exportado em JSON com sucesso!` });
                setTimeout(() => setFeedbackMsg(null), 4000);
              }
            }}
            icon={getModeIcon(m.id)}
          />
        ))}

        {/* Adicionar novo modo */}
        <button
          type="button"
          onClick={handleCreateNewMode}
          className="flex aspect-square flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 text-sm font-medium text-muted-foreground transition hover:border-foreground/50 hover:text-foreground hover:bg-secondary/40 group cursor-pointer"
        >
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-secondary/80 text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-105">
            <Plus className="h-5 w-5" />
          </div>
          <span className="font-semibold tracking-tight">Novo modo</span>
        </button>
      </div>

      {/* Modal de Backup, Exportação, Importação e Restauração */}
      <Dialog open={showBackupDialog} onOpenChange={setShowBackupDialog}>
        <DialogContent className="max-w-lg w-[94vw] sm:w-full border-border/80 bg-background/95 backdrop-blur-xl p-4 sm:p-6 max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl shadow-2xl">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <FolderArchive className="h-5 w-5 text-primary shrink-0" />
              <span>Backup e Gerenciamento de Perfis</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Exporte, importe ou restaure as configurações e modos de imagem em arquivos JSON.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 pt-1">
            {/* 1. Exportação */}
            <div className="rounded-xl border border-border/70 bg-secondary/40 p-3 sm:p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Download className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Exportar Configurações (JSON)</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Gere um arquivo JSON com todas as configurações do aplicativo ou selecione apenas um
                perfil específico.
              </p>
              <div className="flex items-center gap-2 min-w-0 w-full">
                <div className="flex-1 min-w-0">
                  <Select
                    value={selectedExportProfile}
                    onValueChange={(val) => setSelectedExportProfile(val)}
                  >
                    <SelectTrigger className="w-full h-8 rounded-lg border border-border/80 bg-background/90 px-2.5 py-1 text-xs text-foreground cursor-pointer focus:ring-1 focus:ring-primary min-w-0 overflow-hidden">
                      <SelectValue
                        placeholder="Selecione um perfil..."
                        className="truncate block min-w-0"
                      />
                    </SelectTrigger>
                    <SelectContent className="border border-border/80 bg-popover text-popover-foreground z-[100] max-h-56">
                      <SelectItem value="all" className="text-xs py-1.5 cursor-pointer">
                        ★ Todas as configurações (Backup Completo)
                      </SelectItem>
                      <SelectItem value="custom" className="text-xs py-1.5 cursor-pointer">
                        Custom (Ajuste livre)
                      </SelectItem>
                      {modes.map((m) => (
                        <SelectItem
                          key={m.id}
                          value={m.id}
                          className="text-xs py-1.5 cursor-pointer"
                        >
                          {m.name} {m.isBuiltIn ? "(Padrão AOC)" : "(Personalizado)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={handleExport}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 transition cursor-pointer shrink-0 h-8 shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Exportar</span>
                </button>
              </div>
            </div>

            {/* 2. Importação */}
            <div className="rounded-xl border border-border/70 bg-secondary/40 p-3 sm:p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Upload className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>Importar Arquivo JSON</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Selecione um arquivo .json para restaurar um backup completo ou importar um perfil
                individual. O sistema detecta o formato automaticamente.
              </p>
              <button
                type="button"
                onClick={handleImport}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border/80 bg-background/80 hover:bg-background px-3 py-1.5 text-xs font-medium text-foreground transition cursor-pointer hover:border-emerald-500/40 h-8 shadow-sm"
              >
                <FileJson className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">Selecionar Arquivo JSON (.json)...</span>
              </button>
            </div>

            {/* 3. Limpar Tudo / Restaurar de Fábrica */}
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 sm:p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-red-400">
                <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                <span>Restaurar Configurações de Fábrica</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Apaga todos os perfis personalizados e desfaz quaisquer edições feitas nos perfis
                padrão da AOC, retornando o app ao estado de recém-instalado.
              </p>
              {showConfirmReset ? (
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-red-500/20">
                  <span className="text-[11px] font-medium text-amber-300">
                    Tem certeza absoluta?
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowConfirmReset(false)}
                      className="px-2.5 py-1 text-[11px] rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground cursor-pointer h-7"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleResetAll}
                      className="px-2.5 py-1 text-[11px] rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition cursor-pointer shadow-sm h-7"
                    >
                      Sim, Limpar Tudo
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowConfirmReset(true)}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 underline underline-offset-2 pt-0.5 cursor-pointer"
                >
                  <span>Limpar dados e restaurar padrões</span>
                </button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function ModeCard({
  id,
  name,
  subtitle,
  active,
  isDefault,
  assignedExes = [],
  autoSwitchEnabled = true,
  onToggleAutoSwitch,
  applying,
  onSelect,
  onSetDefault,
  onRemove,
  onExport,
  icon,
}: {
  id: string;
  name: string;
  subtitle: string;
  active: boolean;
  isDefault?: boolean;
  assignedExes?: string[] | undefined;
  autoSwitchEnabled?: boolean | undefined;
  onToggleAutoSwitch?: (() => void) | undefined;
  applying?: boolean | undefined;
  onSelect: () => void;
  onSetDefault?: (() => void) | undefined;
  onRemove?: (() => void) | undefined;
  onExport?: (() => void) | undefined;
  icon?: React.ReactNode | undefined;
}) {
  return (
    <div
      className={`panel group relative flex min-h-[170px] aspect-square flex-col p-4 transition-all min-w-0 ${
        active ? "bg-accent/80 ring-1 ring-foreground/20 shadow-glow" : "hover:bg-secondary/70"
      }`}
    >
      <button
        onClick={onSelect}
        disabled={applying}
        className="absolute inset-0 rounded-xl cursor-pointer"
        aria-label={`Usar ${name}`}
      />

      <div className="flex items-start justify-between relative z-10">
        <div
          className={`grid h-11 w-11 place-items-center rounded-xl transition ${
            active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
          }`}
        >
          {icon ?? <Monitor className="h-5 w-5" />}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            {isDefault && (
              <span
                className="flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[9px] font-semibold text-primary"
                title="Perfil padrão (quando nenhum app vinculado estiver em foco)"
              >
                <Star className="h-2.5 w-2.5 fill-current" />
                <span>Padrão</span>
              </span>
            )}
            {applying ? (
              <div className="grid h-6 w-6 place-items-center rounded-full bg-primary/20 text-primary">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              </div>
            ) : (
              active && (
                <div className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                </div>
              )
            )}
          </div>

          {onToggleAutoSwitch && (
            <div className="flex items-center pt-0.5" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleAutoSwitch();
                }}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium transition cursor-pointer ${
                  autoSwitchEnabled
                    ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                    : "bg-secondary/80 border-border/60 text-muted-foreground/60 hover:text-muted-foreground hover:border-border"
                }`}
                title={
                  autoSwitchEnabled
                    ? "Troca automática ATIVA para este perfil (clique para desativar)"
                    : "Troca automática DESATIVADA para este perfil (clique para ativar)"
                }
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    autoSwitchEnabled ? "bg-primary animate-pulse" : "bg-muted-foreground/40"
                  }`}
                />
                <span>Auto</span>
                <span
                  className={`relative inline-flex h-3 w-5 flex-shrink-0 rounded-full border border-transparent transition-colors duration-200 ease-in-out ${
                    autoSwitchEnabled ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-2 w-2 transform rounded-full shadow transition duration-200 ease-in-out mt-[1px] ${
                      autoSwitchEnabled
                        ? "translate-x-2 bg-primary-foreground"
                        : "translate-x-0.5 bg-foreground"
                    }`}
                  />
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none mt-auto min-w-0 w-full">
        <p className="truncate text-sm font-semibold tracking-tight">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        {assignedExes.length > 0 && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground/80 truncate">
            <Gamepad2
              className={`h-3 w-3 shrink-0 ${
                autoSwitchEnabled ? "text-primary/70" : "text-muted-foreground/40"
              }`}
            />
            <span
              className={`truncate ${
                !autoSwitchEnabled ? "line-through text-muted-foreground/50" : ""
              }`}
            >
              {assignedExes.slice(0, 2).join(", ")}
              {assignedExes.length > 2 ? ` +${assignedExes.length - 2}` : ""}
            </span>
            {!autoSwitchEnabled && (
              <span className="text-[9px] text-amber-400/90 font-medium ml-1">(pausado)</span>
            )}
          </div>
        )}
      </div>

      <div className="absolute bottom-3 right-3 flex gap-1 opacity-0 transition group-hover:opacity-100 z-10">
        {onSetDefault && !isDefault && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSetDefault();
            }}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-background/80 hover:text-amber-400 cursor-pointer"
            title="Definir como perfil padrão"
            aria-label="Definir como padrão"
          >
            <Star className="h-4 w-4" />
          </button>
        )}
        {onExport && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExport();
            }}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-background/80 hover:text-foreground cursor-pointer"
            title="Exportar este perfil em JSON"
            aria-label="Exportar"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-background/80 hover:text-red-400 cursor-pointer"
            title="Excluir modo"
            aria-label="Excluir"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <Link
          to="/editor"
          search={{ id }}
          onClick={(e) => e.stopPropagation()}
          className="rounded-lg p-2 text-muted-foreground transition hover:bg-background/80 hover:text-foreground cursor-pointer"
          title="Editar configurações e vincular executáveis"
          aria-label="Editar"
        >
          <Pencil className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
