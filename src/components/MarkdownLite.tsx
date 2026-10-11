import { Fragment } from "react";

/**
 * 轻量 Markdown 渲染（安全实现，不使用 innerHTML / dangerouslySetInnerHTML）
 * 支持：**加粗**、*斜体*、`代码`、==高亮==、~~删除线~~、[链接](url)、
 * 标题（#）、无序/有序列表、引用（>）、分隔线（---）、行内换行。
 */

const INLINE_RE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|==[^=\n]+==|~~[^~\n]+~~|\[[^\]\n]+\]\([^)\s]+\))/g;

/** 链接协议白名单：只放行 http(s) 与 mailto，挡掉 javascript:/data: 等注入面 */
function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url) || /^mailto:/i.test(url) ? url : null;
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(INLINE_RE).filter((p) => p !== "");
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("==") && part.endsWith("==")) {
      return (
        <mark key={key} className="rounded-[3px] bg-amber-700/25 px-0.5 text-inherit">
          {part.slice(2, -2)}
        </mark>
      );
    }
    if (part.startsWith("~~") && part.endsWith("~~")) {
      return (
        <del key={key} className="text-gray-700">
          {part.slice(2, -2)}
        </del>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className="t-mono-13 rounded bg-gray-100 px-1 py-px">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const href = safeHref(link[2]);
      if (!href) return <Fragment key={key}>{part}</Fragment>; // 不安全协议：原样当文本
      return (
        <a key={key} href={href} target="_blank" rel="noreferrer" className="text-blue-900 underline decoration-blue-500/50 underline-offset-2">
          {link[1]}
        </a>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;
  let paraBuffer: string[] = [];

  const flushList = () => {
    if (!listBuffer) return;
    const { ordered, items } = listBuffer;
    blocks.push(
      ordered ? (
        <ol key={`l${blocks.length}`} className="my-1 ml-5 list-decimal space-y-0.5">
          {items.map((it, i) => (
            <li key={i}>{renderInline(it, `li${blocks.length}-${i}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={`l${blocks.length}`} className="my-1 ml-5 list-disc space-y-0.5">
          {items.map((it, i) => (
            <li key={i}>{renderInline(it, `li${blocks.length}-${i}`)}</li>
          ))}
        </ul>
      ),
    );
    listBuffer = null;
  };

  const flushPara = () => {
    if (!paraBuffer.length) return;
    blocks.push(
      <p key={`p${blocks.length}`} className="my-0.5 first:mt-0 last:mb-0">
        {paraBuffer.map((line, i) => (
          <Fragment key={i}>
            {i > 0 ? <br /> : null}
            {renderInline(line, `p${blocks.length}-${i}`)}
          </Fragment>
        ))}
      </p>,
    );
    paraBuffer = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushList();
      flushPara();
      const level = heading[1].length;
      const cls = level <= 2 ? "t-h-16 my-1.5" : "t-h-14 my-1";
      blocks.push(
        <div key={`h${blocks.length}`} className={`${cls} text-gray-1000`}>
          {renderInline(heading[2], `h${blocks.length}`)}
        </div>,
      );
      continue;
    }
    if (/^-{3,}$/.test(line.trim())) {
      flushList();
      flushPara();
      blocks.push(<hr key={`hr${blocks.length}`} className="my-2 border-gray-300" />);
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushList();
      flushPara();
      blocks.push(
        <blockquote key={`q${blocks.length}`} className="my-1 border-l-2 border-gray-500 pl-2.5 text-gray-900">
          {renderInline(quote[1], `q${blocks.length}`)}
        </blockquote>,
      );
      continue;
    }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.、)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const ordered = Boolean(ol);
      if (!listBuffer || listBuffer.ordered !== ordered) {
        flushList();
        listBuffer = { ordered, items: [] };
      }
      listBuffer.items.push((ul ? ul[1] : ol?.[1]) ?? "");
      continue;
    }
    if (!line.trim()) {
      flushList();
      flushPara();
      continue;
    }
    flushList();
    paraBuffer.push(line);
  }
  flushList();
  flushPara();

  return <div className={className}>{blocks}</div>;
}
