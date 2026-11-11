import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { SUPPORTED_LANGUAGES, currentLanguage, setLanguage, type Language } from "@/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LanguageSwitcher() {
  const { t } = useTranslation();

  return (
    <Select value={currentLanguage()} onValueChange={(val) => setLanguage(val as Language)}>
      <SelectTrigger
        className="h-9 w-auto gap-1.5 rounded-xl border border-border/80 bg-secondary/80 px-3 text-xs font-medium text-muted-foreground shadow-sm hover:text-foreground"
        title={t("language.label")}
        aria-label={t("language.label")}
      >
        <Languages className="h-4 w-4 text-primary shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border border-border/80 bg-popover text-popover-foreground z-[100]">
        {SUPPORTED_LANGUAGES.map((lng) => (
          <SelectItem key={lng} value={lng} className="text-xs py-1.5 cursor-pointer">
            {t(`language.${lng}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
