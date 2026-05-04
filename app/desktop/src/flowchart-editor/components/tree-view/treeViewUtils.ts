/**
 * Tree view utility types and functions.
 * Flattens a recursive tree structure into a flat array for TreeView rendering.
 */

export type TreeViewItemKind = "directory" | "leaf";

export type TreeViewItem = {
  id: string;
  depth: number;
  kind: TreeViewItemKind;
  label: string;
  /** [start, end] pairs of search match character offsets in the label */
  searchRanges: [number, number][];
  /** Arbitrary metadata passed through to renderers */
  metadata: Record<string, unknown>;
};

export type DropTargetPosition = "before" | "after" | "inside";

export type DropTarget = {
  kind: "directory" | "reorder";
  targetKey: string;
  position: DropTargetPosition;
};

export type DragPayload = {
  keys: string[];
  labels: string[];
};

/**
 * Compute [start, end] character ranges in `text` that match `keyword` (case-insensitive).
 */
export function computeSearchRanges(text: string, keyword: string): [number, number][] {
  if (!keyword || !text) {
    return [];
  }

  const ranges: [number, number][] = [];
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  let startIndex = 0;

  while (startIndex < lowerText.length) {
    const matchIndex = lowerText.indexOf(lowerKeyword, startIndex);
    if (matchIndex === -1) {
      break;
    }
    ranges.push([matchIndex, matchIndex + lowerKeyword.length]);
    startIndex = matchIndex + 1;
  }

  return ranges;
}
