/**
 * Readable model names, shared by the hub, the web app and the catalogue scripts. No imports:
 * the web app loads this module on its own (`@hemmia/relay-protocol/names`).
 */

/** Name parts written in capitals. */
const NAME_ACRONYMS = new Set(['vl', 'lfm', 'gpt', 'oss', 'moe', 'vlm', 'mlx']);

/**
 * A readable name for an Ollama model: "qwen3.8:27b" → "Qwen 3.8 27B", "qwen3-vl:2b" →
 * "Qwen 3 VL 2B", "deepseek-r1:8b" → "Deepseek R1 8B". Tag variants after the size
 * ("27b-mlx", "30b-a3b") are left out; "latest" has no size.
 */
export function prettyModelName(ollamaModel: string): string {
  const [base = '', tag = ''] = ollamaModel.split(':');
  const word = (w: string) =>
    NAME_ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1);
  const words = base
    .split('-')
    .filter(Boolean)
    .map((part) => {
      const m = /^([a-z]+)(\d[\d.]*)$/.exec(part);
      if (!m) return /^\d/.test(part) ? part : word(part);
      const [, letters = '', num = ''] = m;
      // "r1", "v2.6": a version letter stays glued to its number.
      return letters.length === 1 ? `${letters.toUpperCase()}${num}` : `${word(letters)} ${num}`;
    });
  const size = tag && tag !== 'latest' ? ` ${tag.split('-')[0]?.toUpperCase() ?? ''}` : '';
  return `${words.join(' ')}${size}`;
}

/**
 * Whether a label is the old generated form of a model's name ("gemma4 26B" for gemma4:26b,
 * before prettyModelName), so it can be shown readably without touching labels people chose.
 */
export function isGeneratedModelLabel(label: string, ollamaModel: string): boolean {
  const [base = '', tag = ''] = ollamaModel.split(':');
  return label === `${base} ${tag.toUpperCase()}`.trim() || label === ollamaModel;
}
