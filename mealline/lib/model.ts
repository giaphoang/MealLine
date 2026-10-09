/**
 * Model port: the conversation controller asks a language model to interpret
 * one applicant turn into structured fields. The controller validates the
 * result and dispatches only allow-listed tools; the model never touches the
 * database.
 *
 * Default implementation is deterministic (no network, reproducible tests and
 * demo). An HTTP-backed model can be plugged in via MEALLINE_MODEL_URL for
 * real deployments; if it fails, the controller falls back to fixed questions.
 */
import type { DraftFields, IntakeStep } from "./types";
import type { Locale } from "./i18n";

export type TurnIntent =
  | "answer" | "confirm" | "deny" | "correct" | "repeat"
  | "human" | "unsupported_language" | "skip";

export interface ExtractResult {
  intent: TurnIntent;
  fields: Partial<DraftFields>;
  unknowns: string[];
  languageHint?: Locale;
  neededLanguage?: string;
  confidence: number;
}

export interface ModelPort {
  name: string;
  interpret(step: IntakeStep, input: string, locale: Locale): Promise<ExtractResult>;
}

const VI_DIACRITICS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const EN_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const VI_NUMBERS: Record<string, number> = {
  "một": 1, "mot": 1, hai: 2, ba: 3, "bốn": 4, bon: 4, "năm": 5, nam: 5,
  "sáu": 6, sau: 6, "bảy": 7, bay: 7, "tám": 8, tam: 8, "chín": 9, chin: 9,
  "mười": 10, muoi: 10,
};

const DAY_KEYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
const DAY_ALIASES: [RegExp, string][] = [
  [/monday|lunes|thứ hai|thu 2/i, "monday"],
  [/tuesday|martes|thứ ba|thu 3/i, "tuesday"],
  [/wednesday|miércoles|miercoles|thứ tư|thu 4/i, "wednesday"],
  [/thursday|jueves|thứ năm|thu 5/i, "thursday"],
  [/friday|viernes|thứ sáu|thu 6/i, "friday"],
  [/saturday|sábado|sabado|thứ bảy|thu 7/i, "saturday"],
  [/sunday|domingo|chủ nhật|chu nhat/i, "sunday"],
];
const TIME_ALIASES: [RegExp, string][] = [
  [/morning|mañana|manana|buổi sáng|\bsáng\b/i, "morning"],
  [/afternoon|tarde|buổi chiều|\bchiều\b/i, "afternoon"],
  [/evening|noche|buổi tối|\btối\b/i, "evening"],
];

function cleanDigits(s: string): string {
  return s.replace(/\D/g, "");
}

function parseHouseholdSize(s: string): number | null {
  const d = s.match(/\b(\d{1,2})\b/);
  if (d) {
    const n = parseInt(d[1], 10);
    if (n >= 1 && n <= 30) return n;
  }
  const lower = s.toLowerCase();
  for (const [w, n] of Object.entries(EN_NUMBERS)) {
    if (new RegExp(`\\b${w}\\b`).test(lower)) return n;
  }
  for (const [w, n] of Object.entries(VI_NUMBERS)) {
    if (lower.includes(w)) return n;
  }
  return null;
}

/** Unicode-aware whole-word match (JS \b is ASCII-only and misses diacritics). */
function wordIn(s: string, words: string[]): boolean {
  const pat = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${words.join("|")})(?=[^\\p{L}\\p{N}]|$)`, "iu"
  );
  return pat.test(s);
}

function detectIntent(raw: string, locale: Locale): TurnIntent | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/^0$/.test(s) || wordIn(s, ["person", "agent", "persona"]) ||
      s.includes("gặp nhân viên") || s === "nhân viên")
    return "human";
  if (wordIn(s, ["correct", "sửa", "corregir", "cambiar", "change it", "thay đổi", "go back", "quay lại"])) return "correct";
  if (wordIn(s, ["repeat", "lặp lại", "repetir", "say again", "nói lại"])) return "repeat";
  if (wordIn(s, ["yes", "yeah", "yep", "correct", "confirm", "ok", "okay", "sí", "si", "correcto",
                 "đúng rồi", "đúng", "vâng", "xác nhận", "đồng ý"])) return "confirm";
  if (wordIn(s, ["no", "nope", "không", "sai", "wrong"])) return "deny";
  if (wordIn(s, ["none", "no need", "không cần", "không có"])) return "skip";
  return null;
}

export class DeterministicModel implements ModelPort {
  name = "deterministic-v1";

  async interpret(step: IntakeStep, input: string, locale: Locale): Promise<ExtractResult> {
    const raw = input.trim();
    const s = raw.toLowerCase();
    const base: ExtractResult = { intent: "answer", fields: {}, unknowns: [], confidence: 0.9 };

    // Global intents apply on every step.
    const intent = detectIntent(raw, locale);
    if (intent === "human" || intent === "repeat" || intent === "correct" || intent === "unsupported_language") {
      return { ...base, intent, confidence: 0.95 };
    }
    if (step === "review") {
      // Numbered options: 1 = yes/confirm, 2 = correct.
      if (/^1$/.test(s)) return { ...base, intent: "confirm", confidence: 0.99 };
      if (/^2$/.test(s)) return { ...base, intent: "correct", confidence: 0.99 };
      if (intent === "confirm") return { ...base, intent: "confirm", confidence: 0.95 };
      if (intent === "deny") return { ...base, intent: "deny", confidence: 0.95 };
      return { ...base, intent: "answer", confidence: 0.4, unknowns: ["confirmation"] };
    }

    switch (step) {
      case "language": {
        if (s === "1") return { ...base, languageHint: "en", confidence: 0.99 };
        if (s === "2") return { ...base, languageHint: "vi", confidence: 0.99 };
        if (s === "9") return { ...base, languageHint: "es", confidence: 0.99 };
        // Voice-only selection: the caller says the language name.
        // (No numbered options — the language list will grow.)
        // Vietnamese matching is fuzzy: the first turn uses the en-US speech
        // model, which mangles "tiếng Việt" into approximations.
        if (VI_DIACRITICS.test(raw) ||
            /tiếng việt|vietnamese|viet\b/.test(s) ||
            /t[iy]ng?\s*v[iy][eê]t\b/i.test(s) ||
            /v[iy][eê]t\s*nam/i.test(s))
          return { ...base, languageHint: "vi", confidence: 0.95 };
        if (wordIn(s, ["spanish", "español", "espanol"]))
          return { ...base, languageHint: "es", confidence: 0.95 };
        if (/\benglish\b|tiếng anh/.test(s) || wordIn(s, ["inglés", "ingles"]))
          return { ...base, languageHint: "en", confidence: 0.95 };
        // Natural speech: the caller just talks, we identify the language
        // from vocabulary. (First-turn transcription uses the en-US model,
        // so we match words it transcribes reliably.)
        if (wordIn(s, ["hola", "necesito", "quiero", "ayuda", "gracias", "comida",
                       "alimentos", "entrega", "favor", "buenos", "buenas", "dias",
                       "tardes", "llameme", "llamar", "estoy", "tengo", "necesita"]))
          return { ...base, languageHint: "es", confidence: 0.8 };
        if (/xin chao|cam on|sin chao|sin chow/i.test(s) ||
            wordIn(s, ["khong", "giup", "duoc", "nha"]))
          return { ...base, languageHint: "vi", confidence: 0.75 };
        // Non-latin script or unrecognized -> route to staff, record what we saw.
        if (/[^\u0000-\u024F\u1E00-\u1EFF\s\d.,'’-]/.test(raw))
          return { ...base, intent: "unsupported_language", neededLanguage: raw.slice(0, 40), confidence: 0.8 };
        return { ...base, intent: "unsupported_language", neededLanguage: raw.slice(0, 40), confidence: 0.6 };
      }
      case "address": {
        const zip = (raw.match(/\b\d{5}(?:-\d{4})?\b/) || [])[0];
        const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
        const fields: Partial<DraftFields> = {
          address: {
            raw,
            street: parts[0] || undefined,
            city: parts.length > 1 ? parts[1] : undefined,
            zip: zip || undefined,
          },
        };
        const unknowns = zip ? [] : ["zip"];
        return { ...base, fields, unknowns, confidence: zip ? 0.9 : 0.6 };
      }
      case "household": {
        const size = parseHouseholdSize(raw);
        const notes = size != null ? raw.replace(String(size), "").replace(/[^a-zA-Zà-ỹÀ-Ỹ\s]/g, "").trim() : raw;
        const fields: Partial<DraftFields> = {
          household: { size: size ?? undefined, notes: notes || undefined },
        };
        return { ...base, fields, unknowns: size == null ? ["household_size"] : [], confidence: size != null ? 0.9 : 0.4 };
      }
      case "availability": {
        const days = DAY_ALIASES.filter(([re]) => re.test(s)).map(([, k]) => k);
        const times = TIME_ALIASES.filter(([re]) => re.test(s)).map(([, k]) => k);
        if (/\bweekdays?\b|ngày thường/.test(s)) days.push("monday","tuesday","wednesday","thursday","friday");
        if (/\bweekends?\b|cuối tuần/.test(s)) days.push("saturday","sunday");
        const uniq = [...new Set(days)];
        return {
          ...base,
          fields: { availability: { days: uniq, times: [...new Set(times)], raw } },
          unknowns: uniq.length === 0 ? ["days"] : [],
          confidence: uniq.length > 0 ? 0.85 : 0.4,
        };
      }
      case "contact": {
        const digits = cleanDigits(raw);
        // Numbered options: 1 = callback (phone needed), 2 = status link.
        if (/^1$/.test(s)) {
          return { ...base, fields: { contactPreference: "callback" }, unknowns: ["phone_number"], confidence: 0.9 };
        }
        if (/^2$/.test(s)) {
          return { ...base, fields: { contactPreference: "status_link" }, confidence: 0.99 };
        }
        let phone: string | undefined;
        if (digits.length === 11 && digits.startsWith("1")) phone = digits.slice(1);
        else if (digits.length === 10) phone = digits;
        const wantsLink = /link|liên kết|enlace|online|trực tuyến|website|internet|text me the link/i.test(s);
        const wantsCall = /call|gọi|llam|phone|điện thoại|teléfono|telefono|call me/i.test(s);
        if (phone && !wantsLink) {
          return { ...base, fields: { contactPreference: "callback", contactPhone: phone }, confidence: 0.9 };
        }
        if (wantsLink) {
          return { ...base, fields: { contactPreference: "status_link" }, confidence: 0.9 };
        }
        if (wantsCall && !phone) {
          return { ...base, unknowns: ["phone_number"], confidence: 0.5 };
        }
        if (phone) {
          return { ...base, fields: { contactPreference: "callback", contactPhone: phone }, confidence: 0.85 };
        }
        return { ...base, unknowns: ["contact_preference"], confidence: 0.4 };
      }
      case "accommodation": {
        if (intent === "skip" || /^(none|no|không|không cần|n\/a)$/.test(s)) {
          return { ...base, fields: { accommodation: "none" }, confidence: 0.95 };
        }
        return { ...base, fields: { accommodation: raw.slice(0, 500) }, confidence: 0.85 };
      }
      case "dietary": {
        // 1 = none.
        if (/^1$/.test(s)) {
          return { ...base, fields: { dietaryAvoid: [], dietaryNotes: "none" }, confidence: 0.99 };
        }
        if (intent === "skip" || /^(none|no|không|không có|n\/a|ninguno|ninguna)$/.test(s)) {
          return { ...base, fields: { dietaryAvoid: [], dietaryNotes: "none" }, confidence: 0.95 };
        }
        const ALLERGENS: [RegExp, string][] = [
          [/peanut|đậu phộng|maní/i, "peanut"],
          [/dairy|milk|sữa|lácteo|leche/i, "dairy"],
          [/pork|thịt heo|cerdo/i, "pork"],
          [/shellfish|shrimp|tôm|camarón/i, "shellfish"],
          [/gluten|wheat|lúa mì|trigo/i, "gluten"],
          [/soy|đậu nành|soja/i, "soy"],
          [/egg|trứng|huevo/i, "egg"],
          [/nut|hạt|nuez/i, "tree nut"],
        ];
        const found = ALLERGENS.filter(([re]) => re.test(raw)).map(([, k]) => k);
        return {
          ...base,
          fields: {
            dietaryAvoid: [...new Set(found)],
            dietaryNotes: raw.slice(0, 500),
          },
          confidence: found.length > 0 ? 0.85 : 0.7,
        };
      }
      case "equipment": {
        // Numbered options: 1 = both, 2 = stove only, 3 = fridge only, 4 = neither.
        if (/^1$/.test(s)) {
          return { ...base, fields: { equipment: { stove: true, fridge: true } }, confidence: 0.99 };
        }
        if (/^2$/.test(s)) {
          return { ...base, fields: { equipment: { stove: true, fridge: false } }, confidence: 0.99 };
        }
        if (/^3$/.test(s)) {
          return { ...base, fields: { equipment: { stove: false, fridge: true } }, confidence: 0.99 };
        }
        if (/^4$/.test(s)) {
          return { ...base, fields: { equipment: { stove: false, fridge: false } }, confidence: 0.99 };
        }
        const hasStove = /stove|bếp|estufa/i.test(s);
        const hasFridge = /fridge|tủ lạnh|refrigerador|nevera/i.test(s);
        const hasBoth = /both|cả hai|ambos/i.test(s);
        const hasNeither = /neither|không có|ninguno/i.test(s);
        if (hasNeither) {
          return { ...base, fields: { equipment: { stove: false, fridge: false } }, confidence: 0.9 };
        }
        if (hasBoth || (hasStove && hasFridge)) {
          return { ...base, fields: { equipment: { stove: true, fridge: true } }, confidence: 0.9 };
        }
        if (hasStove || /stove only|chỉ bếp|solo estufa/i.test(s)) {
          return { ...base, fields: { equipment: { stove: true, fridge: false } }, confidence: 0.85 };
        }
        if (hasFridge || /fridge only|chỉ tủ lạnh|solo refrigerador/i.test(s)) {
          return { ...base, fields: { equipment: { stove: false, fridge: true } }, confidence: 0.85 };
        }
        return {
          ...base,
          fields: { equipment: { notes: raw.slice(0, 500) } },
          unknowns: ["equipment_detail"],
          confidence: 0.5,
        };
      }
      default:
        return { ...base, confidence: 0.3, unknowns: ["unrecognized"] };
    }
  }
}

/**
 * Optional HTTP-backed model. Configure MEALLINE_MODEL_URL (+MEALLINE_MODEL_KEY)
 * to POST {step, input, locale} and receive an ExtractResult JSON body.
 * Any failure -> caller falls back to fixed questions (DeterministicModel).
 */
export class HttpModel implements ModelPort {
  name = "http-model";
  constructor(private url: string, private key?: string) {}
  async interpret(step: IntakeStep, input: string, locale: Locale): Promise<ExtractResult> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.key ? { authorization: `Bearer ${this.key}` } : {}),
      },
      body: JSON.stringify({ step, input, locale }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`model http ${res.status}`);
    return (await res.json()) as ExtractResult;
  }
}

export function defaultModel(): ModelPort {
  const url = process.env.MEALLINE_MODEL_URL;
  if (url) {
    // Wrap: try HTTP model, fall back to deterministic on any error.
    const http = new HttpModel(url, process.env.MEALLINE_MODEL_KEY);
    const det = new DeterministicModel();
    return {
      name: `fallback(${http.name}->${det.name})`,
      async interpret(step, input, locale) {
        try {
          return await http.interpret(step, input, locale);
        } catch {
          return det.interpret(step, input, locale);
        }
      },
    };
  }
  return new DeterministicModel();
}

export { DAY_KEYS };
