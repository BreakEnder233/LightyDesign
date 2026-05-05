import { useEffect, useMemo, useRef, useState } from "react";

import { fuzzySearchNodes, getGroupKey, type SearchMatch } from "../utils/fuzzySearch";
import type { FlowChartCatalogResponse } from "../types/flowchartEditor";

type QuickAddOverlayProps = {
  catalog: FlowChartCatalogResponse | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (nodeType: string) => void | Promise<void>;
  onBrowseAll: () => void;
};

function buildNodeLabel(name: string, alias?: string | null) {
  return alias?.trim() ? `${name} · ${alias}` : name;
}

export function QuickAddOverlay({ catalog, isOpen, onClose, onSubmit, onBrowseAll }: QuickAddOverlayProps) {
  const [searchText, setSearchText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Parse prefix syntax
  const { effectiveKeyword, kindFilter, pathFilter } = useMemo(() => {
    const trimmed = searchText.trim();
    let kw = trimmed;
    let kindF: string | null = null;
    let pathF: string | null = null;

    if (kw.startsWith(">")) {
      kindF = kw.slice(1).toLowerCase();
      kw = "";
    } else if (kw.startsWith("path:")) {
      pathF = kw.slice(5).trim().toLowerCase();
      kw = "";
    }

    return { effectiveKeyword: kw, kindFilter: kindF, pathFilter: pathF };
  }, [searchText]);

  // Filter and search
  const definitions = catalog?.nodeDefinitions ?? [];

  const filteredByPrefix = useMemo(() => {
    let result = definitions;

    if (kindFilter) {
      result = result.filter((d) => d.nodeKind.toLowerCase() === kindFilter);
    }
    if (pathFilter) {
      result = result.filter((d) => d.relativePath.toLowerCase().startsWith(pathFilter));
    }

    return result;
  }, [definitions, kindFilter, pathFilter]);

  const searchResults = useMemo(() => {
    return fuzzySearchNodes(filteredByPrefix, effectiveKeyword);
  }, [filteredByPrefix, effectiveKeyword]);

  // Group results by first directory segment
  const groupedResults = useMemo(() => {
    const groups = new Map<string, SearchMatch[]>();
    for (const match of searchResults) {
      const group = match.node.groupKey;
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(match);
    }
    return Array.from(groups.entries());
  }, [searchResults]);

  // Reset when opening
  useEffect(() => {
    if (isOpen) {
      setSearchText("");
      setSelectedIndex(0);
      // Auto-focus input on next tick
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Navigate with arrow keys
  const totalItems = searchResults.length;

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, totalItems - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = searchResults[selectedIndex];
      if (selected) {
        void onSubmit(selected.node.relativePath);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector(".quick-add-item.is-selected");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  let itemCounter = 0;

  return (
    <div className="quick-add-backdrop" onClick={onClose} onKeyDown={handleKeyDown} role="presentation">
      <div
        className="quick-add-overlay"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="快速添加节点"
      >
        <div className="quick-add-input-row">
          <span className="quick-add-icon">🔍</span>
          <input
            className="quick-add-input"
            onChange={(e) => {
              setSearchText(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="搜索节点类型…  (使用 &gt; 过滤种类, path: 限定目录)"
            ref={inputRef}
            type="text"
            value={searchText}
          />
          <span className="quick-add-hint">Ctrl+P</span>
        </div>

        <div className="quick-add-results" ref={listRef}>
          {groupedResults.length === 0 ? (
            <div className="quick-add-empty">
              <strong>未找到匹配的节点定义</strong>
              <p>尝试调整搜索关键词，或使用 &gt;event / path:Event/Player 缩小范围。</p>
              <button className="secondary-button" onClick={onBrowseAll} type="button" style={{ marginTop: 8 }}>
                浏览全部节点…
              </button>
            </div>
          ) : (
            groupedResults.map(([group, matches]) => (
              <div className="quick-add-group" key={group}>
                <div className="quick-add-group-header">{group}</div>
                {matches.map((match) => {
                  const currentIndex = itemCounter++;
                  const isSelected = currentIndex === selectedIndex;
                  return (
                    <button
                      className={`quick-add-item${isSelected ? " is-selected" : ""}`}
                      key={match.node.relativePath}
                      onClick={() => void onSubmit(match.node.relativePath)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                      type="button"
                    >
                      <span className={`quick-add-item-icon is-${match.node.nodeKind}`}>
                        {match.node.nodeKind === "event" ? "◈" : match.node.nodeKind === "flow" ? "◆" : "◇"}
                      </span>
                      <span className="quick-add-item-label">{buildNodeLabel(match.node.name, match.node.alias)}</span>
                      <span className="quick-add-item-path">{match.node.relativePath}</span>
                      <span className={`flowchart-kind-badge is-${match.node.nodeKind}`}>{match.node.nodeKind}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="quick-add-footer">
          <button className="secondary-button" onClick={onBrowseAll} type="button">
            浏览全部节点…
          </button>
          <span className="quick-add-footer-hint">
            ↑↓ 导航 · 回车添加 · Esc 关闭
          </span>
        </div>
      </div>
    </div>
  );
}
