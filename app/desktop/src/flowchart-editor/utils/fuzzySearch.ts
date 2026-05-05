import type { FlowChartNodeDefinitionSummary } from "../types/flowchartEditor";

export type SearchableNode = FlowChartNodeDefinitionSummary & {
  /** Directory name for grouping (e.g. "Event", "Flow") */
  groupKey: string;
};

export interface SearchMatch {
  node: SearchableNode;
  score: number;
  matchedField: "name" | "alias" | "relativePath" | "description" | "nodeKind";
}

/** Per-field weight multipliers */
const FIELD_WEIGHTS: Record<SearchMatch["matchedField"], number> = {
  name: 100,
  alias: 80,
  relativePath: 60,
  description: 30,
  nodeKind: 10,
};

/** Character-level match bonus for consecutive matches */
const CONSECUTIVE_BONUS = 2;

/**
 * Simple fuzzy scorer: returns a score for how well `keyword` matches `text`.
 * The score is higher when characters appear consecutively and in order.
 * Returns 0 if no match.
 */
function fuzzyScore(text: string, keyword: string): number {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();

  let textIndex = 0;
  let keywordIndex = 0;
  let score = 0;
  let consecutive = 0;

  while (keywordIndex < lowerKeyword.length && textIndex < lowerText.length) {
    if (lowerText[textIndex] === lowerKeyword[keywordIndex]) {
      keywordIndex++;
      consecutive++;
      score += CONSECUTIVE_BONUS * consecutive;
    } else {
      consecutive = 0;
    }
    textIndex++;
  }

  // Not all keyword characters matched
  if (keywordIndex < lowerKeyword.length) {
    return 0;
  }

  return score;
}

/**
 * Get the group key (first directory segment) for a node definition.
 */
export function getGroupKey(relativePath: string): string {
  const firstSlash = relativePath.indexOf("/");
  return firstSlash >= 0 ? relativePath.substring(0, firstSlash) : relativePath;
}

/**
 * Search node definitions with fuzzy matching and weighted field scoring.
 * Results sorted by score descending.
 */
export function fuzzySearchNodes(
  definitions: FlowChartNodeDefinitionSummary[],
  keyword: string,
): SearchMatch[] {
  const trimmed = keyword.trim();
  if (!trimmed) {
    // No keyword → return all with a default score, grouped
    return definitions.map((def) => ({
      node: { ...def, groupKey: getGroupKey(def.relativePath) },
      score: 0,
      matchedField: "name" as const,
    }));
  }

  const results: SearchMatch[] = [];

  for (const def of definitions) {
    const fields: { text: string; field: SearchMatch["matchedField"] }[] = [
      { text: def.name, field: "name" },
      { text: def.alias ?? "", field: "alias" },
      { text: def.relativePath, field: "relativePath" },
      { text: def.description ?? "", field: "description" },
      { text: def.nodeKind, field: "nodeKind" },
    ];

    let bestScore = 0;
    let bestField: SearchMatch["matchedField"] = "name";

    for (const { text, field } of fields) {
      if (!text) continue;
      const raw = fuzzyScore(text, trimmed);
      if (raw > 0) {
        const weighted = raw * FIELD_WEIGHTS[field];
        if (weighted > bestScore) {
          bestScore = weighted;
          bestField = field;
        }
      }
    }

    if (bestScore > 0) {
      results.push({
        node: { ...def, groupKey: getGroupKey(def.relativePath) },
        score: bestScore,
        matchedField: bestField,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
