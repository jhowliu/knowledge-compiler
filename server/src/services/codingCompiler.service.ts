import type {
  CodingExtraction,
  DraftProposalItem,
  DraftUpdateProposal,
  ExtractedConcept,
} from "../domain/compiler.js";
import type { SearchResult } from "../domain/knowledge.js";
import type { RawNote } from "../domain/rawNote.js";

const ALGORITHM_KEYWORDS = [
  "Floyd-Warshall",
  "Dijkstra",
  "Bellman-Ford",
  "BFS",
  "DFS",
  "Union Find",
  "Binary Search",
  "Sliding Window",
  "Dynamic Programming",
  "Stack",
  "Heap",
  "Trie",
];

const PATTERN_RULES: Array<{ pattern: string; terms: string[] }> = [
  { pattern: "All-Pairs Shortest Path", terms: ["all-pairs", "all pairs", "floyd"] },
  { pattern: "Shortest Path", terms: ["shortest path", "dijkstra", "bellman", "floyd"] },
  { pattern: "Stack with State", terms: ["stack", "counter", "count", "state"] },
  { pattern: "Sliding Window", terms: ["sliding window", "window", "substring"] },
  { pattern: "Dynamic Programming", terms: ["dp", "dynamic programming", "state transition"] },
  { pattern: "Graph Traversal", terms: ["graph", "bfs", "dfs"] },
  { pattern: "Binary Search on Answer", terms: ["binary search", "minimum possible", "maximum possible"] },
];

function sentenceSplit(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function includesTerm(text: string, term: string) {
  return text.toLowerCase().includes(term.toLowerCase());
}

function detectProblem(text: string) {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  const match = firstLine?.match(/^#?\s*(\d{1,5})[.)\s-]+(.+)$/);
  const remainder = match?.[2]?.trim() ?? null;
  const problemTitle = remainder?.split(/\.\s+/)[0]?.trim() ?? firstLine ?? null;

  return {
    problemNumber: match?.[1] ?? null,
    problemTitle,
  };
}

function detectAlgorithms(text: string) {
  return ALGORITHM_KEYWORDS.filter((algorithm) => includesTerm(text, algorithm));
}

function detectPatterns(text: string, algorithms: string[]) {
  const patterns = PATTERN_RULES.filter((rule) =>
    rule.terms.some((term) => includesTerm(text, term)),
  ).map((rule) => rule.pattern);

  if (algorithms.includes("Stack") && includesTerm(text, "count")) {
    patterns.push("Stack with State");
  }

  return unique(patterns);
}

function detectKnowledgeType(text: string, problemNumber: string | null): CodingExtraction["knowledgeType"] {
  if (problemNumber) {
    return "problem_reflection";
  }

  if (/\b(if|when).*(=>|->|then)|decision|guide|map/i.test(text)) {
    return "review_map";
  }

  return "general_coding_note";
}

function extractSentences(text: string, matcher: RegExp, fallback: string) {
  const sentences = sentenceSplit(text).filter((sentence) => matcher.test(sentence));
  return sentences.length > 0 ? sentences : [fallback];
}

function buildConcepts(extraction: Omit<CodingExtraction, "concepts">): ExtractedConcept[] {
  const concepts: ExtractedConcept[] = [];

  for (const pattern of extraction.patterns) {
    concepts.push({ name: pattern, conceptType: "pattern", confidence: "high" });
  }

  for (const algorithm of extraction.algorithms) {
    concepts.push({ name: algorithm, conceptType: "algorithm", confidence: "high" });
  }

  if (extraction.problemTitle) {
    concepts.push({ name: extraction.problemTitle, conceptType: "problem", confidence: "medium" });
  }

  for (const mistake of extraction.mistakes) {
    concepts.push({ name: mistake, conceptType: "mistake", confidence: "medium" });
  }

  return concepts;
}

function noteTitle(rawNote: RawNote, extraction: CodingExtraction) {
  if (extraction.problemNumber && extraction.problemTitle) {
    return `${extraction.problemNumber}. ${extraction.problemTitle}`;
  }

  return rawNote.title ?? extraction.problemTitle ?? "Coding Practice Note";
}

function problemNoteBody(extraction: CodingExtraction) {
  const sections = [
    `Problem: ${extraction.problemTitle ?? "Unknown"}`,
    `Pattern: ${extraction.patterns.join(", ") || "Unknown"}`,
    `Algorithm: ${extraction.algorithms.join(", ") || "Unknown"}`,
    `Recognition Signal: ${extraction.recognitionSignals.join(" ") || "Unknown"}`,
    `Key Insight: ${extraction.keyInsights.join(" ") || "Unknown"}`,
    `Mistake: ${extraction.mistakes.join(" ") || "None recorded"}`,
    `Implementation Detail: ${extraction.implementationDetails.join(" ") || "None recorded"}`,
    `Review Action: ${extraction.reviewActions.join(" ") || "None recorded"}`,
  ];

  return sections.join("\n");
}

export class CodingCompilerService {
  extract(rawNote: RawNote): CodingExtraction {
    const text = rawNote.bodyMarkdown;
    const { problemNumber, problemTitle } = detectProblem(text);
    const algorithms = detectAlgorithms(text);
    const patterns = detectPatterns(text, algorithms);
    const knowledgeType = detectKnowledgeType(text, problemNumber);
    const mistakes = extractSentences(
      text,
      /\b(miss|missed|mistake|wrong|forgot|did not|didn't|not realize|weak|struggle)/i,
      "Needs review based on this practice note.",
    );
    const keyInsights = extractSentences(
      text,
      /\b(realize|realized|insight|key|should|use|pattern|approach|idea)/i,
      "Convert this practice note into reusable pattern knowledge.",
    );
    const implementationDetails = sentenceSplit(text).filter((sentence) =>
      /\b(tuple|list|array|map|set|heap|mutable|immutable|edge case|complexity|implementation)/i.test(
        sentence,
      ),
    );
    const reviewActions = patterns.length
      ? [`Practice 2 more ${patterns[0]} problems and explain the recognition signal aloud.`]
      : ["Review this note and identify the reusable pattern before the next practice session."];
    const recognitionSignals = patterns.length
      ? [`Look for ${patterns[0].toLowerCase()} cues in the problem statement.`]
      : ["Look for the decision signal that should trigger the chosen approach."];

    const partialExtraction = {
      domain: "coding" as const,
      knowledgeType,
      problemNumber,
      problemTitle,
      patterns,
      algorithms,
      recognitionSignals,
      keyInsights,
      mistakes,
      implementationDetails,
      reviewActions,
      confidence: patterns.length || algorithms.length || problemNumber ? ("high" as const) : ("medium" as const),
    };

    return {
      ...partialExtraction,
      concepts: buildConcepts(partialExtraction),
    };
  }

  draftProposal(rawNote: RawNote, extraction: CodingExtraction, relatedNotes: SearchResult[]) {
    const items: DraftProposalItem[] = [];
    const title = noteTitle(rawNote, extraction);

    items.push({
      actionType: "upsert_compiled_note",
      targetType: "compiled_note",
      payload: {
        domain: "coding",
        noteType: extraction.knowledgeType === "review_map" ? "review_map" : "problem_note",
        title,
        bodyMarkdown: problemNoteBody(extraction),
        structuredData: extraction,
      },
      rationale: "Save the structured coding reflection as compiled knowledge.",
    });

    for (const pattern of extraction.patterns.slice(0, 2)) {
      items.push({
        actionType: "upsert_compiled_note",
        targetType: "compiled_note",
        payload: {
          domain: "coding",
          noteType: "pattern",
          title: pattern,
          bodyMarkdown: [
            `Pattern Name: ${pattern}`,
            `When to Use: ${extraction.recognitionSignals.join(" ")}`,
            `Core Idea: ${extraction.keyInsights.join(" ")}`,
            `Common Mistakes: ${extraction.mistakes.join(" ")}`,
            `Representative Problems: ${title}`,
          ].join("\n"),
          structuredData: {
            pattern,
            recognitionSignals: extraction.recognitionSignals,
            commonMistakes: extraction.mistakes,
            representativeProblems: [title],
          },
        },
        rationale: `Update the canonical ${pattern} pattern note rather than creating duplicate knowledge.`,
      });
    }

    for (const mistake of extraction.mistakes.slice(0, 2)) {
      items.push({
        actionType: "create_mistake",
        targetType: "mistake",
        payload: {
          domain: "coding",
          category: extraction.patterns[0] ?? "Pattern Recognition",
          title: mistake.length > 120 ? `${mistake.slice(0, 117)}...` : mistake,
          description: mistake,
        },
        rationale: "Track the recurring error separately from the pattern note.",
      });
    }

    for (const action of extraction.reviewActions.slice(0, 2)) {
      items.push({
        actionType: "create_review_task",
        targetType: "review_task",
        payload: {
          domain: "coding",
          title: action,
          description: `Generated from raw note: ${title}`,
        },
        rationale: "Turn the reflection into a concrete next practice action.",
      });
    }

    for (const area of unique([...extraction.patterns, ...extraction.algorithms]).slice(0, 3)) {
      items.push({
        actionType: "upsert_readiness",
        targetType: "readiness_item",
        payload: {
          domain: "coding",
          area,
          status: extraction.mistakes.length > 0 ? "Weak" : "Needs Review",
          rationale: extraction.mistakes[0] ?? "New evidence from a coding practice note.",
        },
        rationale: "Update the coding readiness map using evidence from the raw note.",
      });
    }

    return {
      detectedDomain: "coding",
      detectedKnowledgeType: extraction.knowledgeType,
      impactLevel: items.some((item) => item.actionType === "upsert_compiled_note") ? 3 : 2,
      confidence: extraction.confidence,
      rationale:
        relatedNotes.length > 0
          ? `Detected coding concepts and found ${relatedNotes.length} related notes.`
          : "Detected coding concepts and prepared the first linked update proposal.",
      items,
    } satisfies DraftUpdateProposal;
  }
}
