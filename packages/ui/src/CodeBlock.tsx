import { useRef, useState, type ReactNode } from 'react';
import { useUiText } from './text.tsx';

export function CodeBlock({ children }: { children: ReactNode }) {
  const t = useUiText();
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard
      .writeText(ref.current?.textContent ?? '')
      .then(() => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      })
      .catch(() => undefined);
  };

  return (
    <div className="group relative my-3">
      <pre
        ref={ref}
        className="overflow-x-auto rounded-2xl bg-code p-4 pr-16 text-[13px] leading-relaxed text-[#e9e4d6]"
      >
        {children}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={t('common.copy')}
        className="absolute top-1.5 right-1.5 min-h-11 min-w-11 rounded-xl px-2 text-xs font-semibold text-[#cfc8b6] hover:bg-white/10"
      >
        {copied ? t('common.copied') : t('common.copy')}
      </button>
    </div>
  );
}
