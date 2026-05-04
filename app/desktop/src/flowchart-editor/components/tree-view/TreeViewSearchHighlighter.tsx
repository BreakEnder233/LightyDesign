import type React from "react";

type TreeViewSearchHighlighterProps = {
  text: string;
  ranges: [number, number][];
};

/**
 * Renders text with search match ranges highlighted using <mark> elements.
 */
export function TreeViewSearchHighlighter({ text, ranges }: TreeViewSearchHighlighterProps) {
  if (ranges.length === 0) {
    return <>{text}</>;
  }

  const normalizedRanges = ranges
    .filter(([start, end]) => start >= 0 && end <= text.length && start < end)
    .sort(([a], [b]) => a - b);

  if (normalizedRanges.length === 0) {
    return <>{text}</>;
  }

  const segments: React.ReactNode[] = [];
  let lastEnd = 0;

  normalizedRanges.forEach(([start, end], index) => {
    if (start > lastEnd) {
      segments.push(<span key={`t${lastEnd}`}>{text.slice(lastEnd, start)}</span>);
    }
    segments.push(<mark key={`m${index}`} className="tree-view-search-match">{text.slice(start, end)}</mark>);
    lastEnd = end;
  });

  if (lastEnd < text.length) {
    segments.push(<span key={`t${lastEnd}`}>{text.slice(lastEnd)}</span>);
  }

  return <>{segments}</>;
}
