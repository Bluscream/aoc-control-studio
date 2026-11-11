import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Minus, Square, Copy, X, Monitor } from "lucide-react";
import { useTranslation } from "react-i18next";

export function TitleBar() {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);

  const checkMax = async () => {
    try {
      const max = await invoke<boolean>("is_window_maximized");
      setIsMaximized(max);
    } catch {}
  };

  useEffect(() => {
    checkMax();
    window.addEventListener("resize", checkMax);
    return () => window.removeEventListener("resize", checkMax);
  }, []);

  const handleMinimize = () => invoke("minimize_window");
  const handleToggleMaximize = async () => {
    await invoke("toggle_maximize_window");
    checkMax();
  };
  const handleClose = () => invoke("close_window");

  return (
    <header
      data-tauri-drag-region
      onDoubleClick={handleToggleMaximize}
      className="sticky top-0 z-50 flex h-10 w-full shrink-0 select-none items-center justify-between border-b border-border/50 bg-background/85 px-3 backdrop-blur-xl"
    >
      {/* Lado Esquerdo: Identidade do App / Monitor */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2.5 pointer-events-none"
      >
        <div className="grid h-5 w-5 place-items-center rounded-md bg-secondary/80 border border-border/50 text-foreground shadow-sm">
          <Monitor className="h-3 w-3 text-primary" />
        </div>
        <span className="text-xs font-semibold tracking-tight text-foreground/90 font-display">
          AOC Control Studio
        </span>
        <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/40">
          24G2S
        </span>
      </div>

      {/* Lado Direito: Controles de Janela Personalizados */}
      <div className="flex items-center h-full -mr-3">
        <button
          type="button"
          onClick={handleMinimize}
          className="grid h-10 w-11 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          title={t("titleBar.minimize")}
          aria-label={t("titleBar.minimize")}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleToggleMaximize}
          className="grid h-10 w-11 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          title={isMaximized ? t("titleBar.restore") : t("titleBar.maximize")}
          aria-label={isMaximized ? t("titleBar.restore") : t("titleBar.maximize")}
        >
          {isMaximized ? (
            <Copy className="h-3 w-3 rotate-180" />
          ) : (
            <Square className="h-3 w-3" />
          )}
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="grid h-10 w-11 place-items-center text-muted-foreground hover:bg-red-600 hover:text-white transition-colors"
          title={t("titleBar.close")}
          aria-label={t("titleBar.close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
