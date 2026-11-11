import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { LocaleResource } from "@/locales/pt-BR";

type ValueKey = keyof LocaleResource["values"];

// Os valores das configurações (ex.: "Médio", "Padrão") são códigos estáveis: ficam
// salvos no localStorage e são enviados ao backend em Rust. Por isso nunca são
// traduzidos na origem; só o rótulo exibido é traduzido aqui. Valores sem entrada
// (FPS, Gamma 1, HDR Game, sRGB...) são iguais em todos os idiomas.
const VALUE_KEYS: Record<string, ValueKey> = {
  Desligado: "off",
  Padrão: "standard",
  Texto: "text",
  Jogo: "game",
  Filme: "movie",
  Esportes: "sports",
  Leitura: "reading",
  Quente: "warm",
  Frio: "cool",
  UserRGB: "user",
  Multimídia: "multimedia",
  Escritório: "office",
  Corrida: "racing",
  Fraco: "weak",
  Médio: "medium",
  Forte: "strong",
  "Sup. Direito": "topRight",
  "Inf. Direito": "bottomRight",
  "Inf. Esquerdo": "bottomLeft",
  "Sup. Esquerdo": "topLeft",
};

export function valueLabel(t: TFunction, value: string): string {
  const key = VALUE_KEYS[value];
  return key ? t(`values.${key}`) : value;
}

export function useValueLabel() {
  const { t } = useTranslation();
  return (value: string) => valueLabel(t, value);
}
