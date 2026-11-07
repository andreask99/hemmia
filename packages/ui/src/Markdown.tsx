/**
 * Renders assistant replies. Model output is untrusted: raw HTML is dropped (skipHtml),
 * only http(s)/mailto/# links survive, remote images are never loaded.
 */
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock.tsx';

export function safeUrl(url: string): string {
  const u = url.trim();
  return /^(https?:\/\/|mailto:|#)/i.test(u) ? u : '';
}

const components: Components = {
  a: ({ href, children }) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="break-words font-medium text-forest underline decoration-forest/40 underline-offset-2"
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ alt }) => <span className="text-muted italic">[{alt || 'image'}]</span>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="min-w-full border-collapse overflow-hidden rounded-xl border border-line text-sm">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-line bg-champagne/60 px-3 py-2 text-left align-top font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-line px-3 py-2 text-left align-top">{children}</td>
  ),
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: ({ className, children }) =>
    className?.includes('hljs') || className?.includes('language-') ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded-md bg-champagne px-1.5 py-0.5 font-mono text-[0.88em] text-on-champagne">
        {children}
      </code>
    ),
  h1: ({ children }) => <h1 className="font-display text-xl font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="font-display text-lg font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-semibold">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6">{children}</ol>,
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="kchat-markdown max-w-prose space-y-3 leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false }]]}
        skipHtml
        urlTransform={safeUrl}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
