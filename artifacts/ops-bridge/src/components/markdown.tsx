import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Components } from "react-markdown";

interface MarkdownProps {
  children: string;
}

const components: Components = {
  code(props) {
    const { children, className, ref, ...rest } = props;
    const match = /language-(\w+)/.exec(className || "");
    return match ? (
      <SyntaxHighlighter
        {...rest}
        language={match[1]}
        style={vscDarkPlus}
        PreTag="div"
        className="rounded-lg text-sm my-3"
      >
        {String(children).replace(/\n$/, "")}
      </SyntaxHighlighter>
    ) : (
      <code
        {...rest}
        className={`${className} rounded-sm bg-primary/5 text-accent-foreground/70 px-[0.25em] py-[0.15em] text-xs font-mono`}
      >
        {children}
      </code>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
};

const previewComponents: Components = {
  h1: ({ children }) => <span className="font-semibold">{children}</span>,
  h2: ({ children }) => <span className="font-semibold">{children}</span>,
  h3: ({ children }) => <span className="font-semibold">{children}</span>,
  h4: ({ children }) => <span className="font-semibold">{children}</span>,
  h5: ({ children }) => <span className="font-semibold">{children}</span>,
  h6: ({ children }) => <span className="font-semibold">{children}</span>,
  p: ({ children }) => <span className="mr-1">{children}</span>,
  ul: ({ children }) => <span>{children}</span>,
  ol: ({ children }) => <span>{children}</span>,
  li: ({ children }) => <span className="mr-2">• {children}</span>,
  blockquote: ({ children }) => <span className="italic text-muted-foreground">{children}</span>,
  pre: ({ children }) => (
    <code className="rounded bg-muted px-1 text-xs font-mono">{children}</code>
  ),
  code: ({ children }) => (
    <code className="rounded bg-primary/5 text-accent-foreground/80 px-[0.2em] text-xs font-mono">{children}</code>
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

export default function Markdown({ children }: MarkdownProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-blockquote:border-l-primary prose-blockquote:bg-muted/30 prose-blockquote:rounded-r-lg prose-table:text-xs">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
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
