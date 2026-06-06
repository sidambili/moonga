import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import type { Components } from "react-markdown";

interface MarkdownProps {
  children: string;
  className?: string;
}

/* ── Theme-aware syntax highlighter style ─────────────────── */

const codeStyle: Record<string, React.CSSProperties> = {
  'pre[class*="language-"]': {
    margin: 0,
    padding: "1rem",
    background: "hsl(var(--code-bg))",
    borderRadius: "var(--radius-md)",
    fontSize: "0.8125rem",
    lineHeight: "1.6",
  },
  'code[class*="language-"]': {
    fontFamily: 'var(--font-mono), "SF Mono", "Fira Code", monospace',
    fontSize: "0.8125rem",
    lineHeight: "1.6",
    color: "hsl(var(--code-fg))",
  },
  comment: { color: "hsl(var(--code-comment))", fontStyle: "italic" },
  prolog: { color: "hsl(var(--code-comment))" },
  doctype: { color: "hsl(var(--code-comment))" },
  cdata: { color: "hsl(var(--code-comment))" },
  punctuation: { color: "hsl(var(--code-punctuation))" },
  namespace: { opacity: 0.7 },
  property: { color: "hsl(var(--code-property))" },
  tag: { color: "hsl(var(--code-keyword))" },
  boolean: { color: "hsl(var(--code-keyword))" },
  constant: { color: "hsl(var(--code-number))" },
  symbol: { color: "hsl(var(--code-number))" },
  deleted: { color: "hsl(var(--destructive))" },
  number: { color: "hsl(var(--code-number))" },
  selector: { color: "hsl(var(--code-keyword))" },
  "attr-name": { color: "hsl(var(--code-keyword))" },
  string: { color: "hsl(var(--code-string))" },
  char: { color: "hsl(var(--code-string))" },
  builtin: { color: "hsl(var(--code-function))" },
  inserted: { color: "hsl(var(--code-string))" },
  operator: { color: "hsl(var(--code-operator))" },
  entity: { color: "hsl(var(--code-function))", cursor: "help" },
  url: { color: "hsl(var(--code-string))" },
  variable: { color: "hsl(var(--code-property))" },
  atrule: { color: "hsl(var(--code-keyword))" },
  "attr-value": { color: "hsl(var(--code-string))" },
  function: { color: "hsl(var(--code-function))" },
  "class-name": { color: "hsl(var(--code-class))" },
  regex: { color: "hsl(var(--code-string))" },
  important: { color: "hsl(var(--code-keyword))", fontWeight: "bold" },
  keyword: { color: "hsl(var(--code-keyword))", fontWeight: "500" },
  parameter: { color: "hsl(var(--code-property))" },
  "plain-text": { color: "hsl(var(--code-fg))" },
};

/* ── Full-render components ───────────────────────────────── */

const fullComponents: Components = {
  code(props) {
    const { children, className, ref, ...rest } = props;
    const match = /language-(\w+)/.exec(className || "");
    return match ? (
      <div className="overflow-x-auto rounded-lg border border-border my-4">
        <SyntaxHighlighter
          {...rest}
          language={match[1]}
          style={codeStyle}
          PreTag="div"
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      </div>
    ) : (
      <code
        {...rest}
        className={`${className} rounded bg-primary/5 text-blue-500 px-1 py-0.5 text-xs font-mono`}
      >
        {children}
      </code>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
  h1: ({ children }) => (
    <h1 className="text-xl font-semibold tracking-tight mt-6 mb-3 text-foreground">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold tracking-tight mt-5 mb-2.5 text-foreground">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold tracking-tight mt-4 mb-2 text-foreground">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold tracking-tight mt-4 mb-2 text-foreground">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="text-sm font-semibold tracking-tight mt-4 mb-2 text-foreground">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="text-sm font-semibold tracking-tight mt-4 mb-2 text-foreground">
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p className="text-sm leading-relaxed text-foreground mb-3 last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 mb-3 space-y-1 marker:text-muted-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 mb-3 space-y-1 marker:text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-sm leading-relaxed text-foreground pl-1">
      {children}
    </li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/30 pl-3 italic text-muted-foreground mb-3 bg-muted/20 rounded-r-lg py-1">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="not-prose overflow-x-auto mb-4 rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border bg-muted/40">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-border/40">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-muted/20 transition-colors">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="text-sm text-foreground/90 px-4 py-2.5">{children}</td>
  ),
  hr: () => <hr className="my-5 border-border" />,
  a: ({ children, href }) => (
    <a
      href={href}
      className="text-primary no-underline hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  img: ({ src, alt }) => (
    <img
      src={src}
      alt={alt || ""}
      className="rounded-lg max-w-full h-auto my-3 border border-border"
      loading="lazy"
    />
  ),
};

/* ── Inline preview components (flattened) ────────────────── */

const previewComponents: Components = {
  h1: ({ children }) => <span className="font-semibold text-foreground">{children}</span>,
  h2: ({ children }) => <span className="font-semibold text-foreground">{children}</span>,
  h3: ({ children }) => <span className="font-semibold text-foreground">{children}</span>,
  h4: ({ children }) => <span className="font-semibold text-foreground">{children}</span>,
  h5: ({ children }) => <span className="font-semibold text-foreground">{children}</span>,
  h6: ({ children }) => <span className="font-semibold text-foreground">{children}</span>,
  p: ({ children }) => <span className="mr-1">{children}</span>,
  ul: ({ children }) => <span>{children}</span>,
  ol: ({ children }) => <span>{children}</span>,
  li: ({ children }) => <span className="mr-2">• {children}</span>,
  blockquote: ({ children }) => (
    <span className="italic text-muted-foreground">{children}</span>
  ),
  pre: ({ children }) => (
    <code className="rounded bg-muted px-1 text-xs font-mono">{children}</code>
  ),
  code: ({ children }) => (
    <code className="rounded bg-primary/5 text-primary px-1 py-0.5 text-xs font-mono">
      {children}
    </code>
  ),
  a: ({ children }) => <span className="text-primary">{children}</span>,
  hr: () => <span className="mx-1 text-muted-foreground">|</span>,
  table: ({ children }) => <span>{children}</span>,
  thead: ({ children }) => <span>{children}</span>,
  tbody: ({ children }) => <span>{children}</span>,
  tr: ({ children }) => <span className="mr-2">{children}</span>,
  td: ({ children }) => <span className="mr-1">{children}</span>,
  th: ({ children }) => <span className="mr-1 font-medium">{children}</span>,
};

/* ── Exports ──────────────────────────────────────────────── */

export default function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none ${className ?? ""}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={fullComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function MarkdownPreview({ children }: MarkdownProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={previewComponents}>
      {children}
    </ReactMarkdown>
  );
}
