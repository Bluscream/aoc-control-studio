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
} from "lucide-react";
import { useModes, fetchMonitorInfo, type Mode, type MonitorInfo } from "@/lib/modes";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Modos do monitor — AOC Control Studio" },
      { name: "description", content: "Escolha ou crie modos de imagem para o seu monitor AOC 24G2S." },
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
    lastWarnings,
    clearWarnings,
  } = useModes();
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [monInfo, setMonInfo] = useState<MonitorInfo | null>(null);

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

  const defaultModeName =
    modes.find((m) => m.id === defaultModeId)?.name || (defaultModeId === "custom" ? "Custom" : "Padrão");

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      {/* Header com dados reais do monitor */}
      <header className="mb-8 flex items-center justify-between">
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
              {monInfo?.name || "AOC 24G2S"} · {monInfo?.connection || "DisplayPort"} · AMD Radeon I2C
            </p>
          </div>
        </div>
      </header>

      {/* Painel de Automação de Perfil por Aplicativo */}
      <div className="mb-8 rounded-2xl border border-border/70 bg-secondary/30 p-4 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Troca Automática por Aplicativo</span>
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
            Ao focar em um jogo ou executável (.exe) vinculado, o monitor troca automaticamente para o perfil correspondente.
            No Windows / Desktop, ele retorna para o padrão:{" "}
            <span className="font-semibold text-foreground underline decoration-primary/50 underline-offset-2">
              {defaultModeName}
            </span>.
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
                autoProfileEnabled ? "translate-x-5 bg-primary-foreground" : "translate-x-0 bg-foreground"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h2 className="mb-1 text-2xl font-semibold tracking-tight">Modos de Imagem</h2>
          <p className="text-sm text-muted-foreground">
            Clique no card para ativar, na estrela para torná-lo o padrão do Windows, ou no lápis para vincular executáveis.
          </p>
        </div>
      </div>

      {lastWarnings.length > 0 && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
          <div className="space-y-1">
            {lastWarnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}
          </div>
          <button
            onClick={clearWarnings}
            className="rounded-lg p-1 text-amber-300/70 hover:text-amber-100 transition"
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
  icon?: React.ReactNode | undefined;
}) {
  return (
    <div
      className={`panel group relative flex aspect-square flex-col p-4 transition-all ${
        active
          ? "bg-accent/80 ring-1 ring-foreground/20 shadow-glow"
          : "hover:bg-secondary/70"
      }`}
    >
      <button
        onClick={onSelect}
        disabled={applying}
        className="absolute inset-0 rounded-xl"
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
                title="Perfil padrão do Windows (quando nenhum app vinculado estiver em foco)"
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
            <div
              className="flex items-center pt-0.5"
              onClick={(e) => e.stopPropagation()}
            >
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
                      autoSwitchEnabled ? "translate-x-2 bg-primary-foreground" : "translate-x-0.5 bg-foreground"
                    }`}
                  />
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none mt-auto">
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
              <span className="text-[9px] text-amber-400/90 font-medium ml-1">
                (pausado)
              </span>
            )}
          </div>
        )}
      </div>

      <div className="absolute bottom-3 right-3 flex gap-1 opacity-0 transition group-hover:opacity-100 z-10">
        {onSetDefault && !isDefault && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSetDefault();
            }}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-background/80 hover:text-amber-400"
            title="Definir como perfil padrão do Windows"
            aria-label="Definir como padrão"
          >
            <Star className="h-4 w-4" />
          </button>
        )}
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-background/80 hover:text-red-400"
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
          className="rounded-lg p-2 text-muted-foreground transition hover:bg-background/80 hover:text-foreground"
          title="Editar configurações e vincular executáveis (.exe)"
          aria-label="Editar"
        >
          <Pencil className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
