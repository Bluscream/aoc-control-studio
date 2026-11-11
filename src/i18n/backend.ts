import type { TFunction } from "i18next";
import ptBR from "@/locales/pt-BR";

type FieldKey = keyof typeof ptBR.backend.fields;
type MessageKey = keyof typeof ptBR.backend.messages;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// O texto pt-BR de cada mensagem (idêntico ao do Rust) vira um padrão; os
// marcadores {{nome}} capturam a parte variável.
const MESSAGE_PATTERNS = (Object.keys(ptBR.backend.messages) as MessageKey[]).map((key) => {
  const source = ptBR.backend.messages[key];
  const names: string[] = [];
  const pattern = source
    .split(/(\{\{\w+\}\})/)
    .map((part) => {
      const m = /^\{\{(\w+)\}\}$/.exec(part);
      if (!m?.[1]) return escapeRegex(part);
      names.push(m[1]);
      return "(.+?)";
    })
    .join("");
  return { key, names, regex: new RegExp(`^${pattern}$`) };
});

const FIELD_KEYS = new Map<string, FieldKey>(
  (Object.keys(ptBR.backend.fields) as FieldKey[]).map((k) => [ptBR.backend.fields[k], k]),
);

function translateMessage(t: TFunction, text: string): string {
  for (const { key, names, regex } of MESSAGE_PATTERNS) {
    const match = regex.exec(text);
    if (!match) continue;
    const vars = Object.fromEntries(names.map((n, i) => [n, match[i + 1] ?? ""]));
    return t(`backend.messages.${key}`, { ...vars, defaultValue: text });
  }
  return text;
}

/**
 * Traduz avisos/erros conhecidos vindos do backend em Rust (que só os gera em pt-BR).
 * Formatos aceitos: "<mensagem>" ou "<campo>: <mensagem>". Texto desconhecido é
 * devolvido sem alteração.
 */
export function translateBackendMessage(t: TFunction, text: string): string {
  const whole = translateMessage(t, text);
  if (whole !== text) return whole;

  const sep = text.indexOf(": ");
  if (sep === -1) return text;
  const field = text.slice(0, sep);
  const rest = text.slice(sep + 2);
  const fieldKey = FIELD_KEYS.get(field);
  const label = fieldKey ? t(`backend.fields.${fieldKey}`) : field;
  return `${label}: ${translateMessage(t, rest)}`;
}
