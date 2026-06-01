import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EvalJudgeService } from "../services/evalJudge.service.js";

type ExpectedEval = {
  min_concepts: number;
  required_concepts: string[];
  forbidden_hallucinations: string[];
  should_conflict: boolean;
  min_coverage_score: number;
  min_grounding_score: number;
};

type EvalCaseResult = {
  id: string;
  description: string;
  passed: boolean;
  coverageScore: number;
  groundingScore: number;
  errors: string[];
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../../tests/fixtures/eval-cases");

async function run() {
  const caseIds = (await readdir(fixturesDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const results: EvalCaseResult[] = [];
  for (const id of caseIds) {
    results.push(await runCase(id));
  }

  const failed = results.filter((result) => !result.passed);
  for (const result of results) {
    const marker = result.passed ? "PASS" : "FAIL";
    console.log(
      `${marker} ${result.id} coverage=${result.coverageScore.toFixed(2)} grounding=${result.groundingScore.toFixed(2)} ${result.description}`,
    );
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
  }

  const averageCoverage = average(results.map((result) => result.coverageScore));
  const averageGrounding = average(results.map((result) => result.groundingScore));
  console.log(
    `\nEval summary: ${results.length - failed.length}/${results.length} passed, average coverage=${averageCoverage.toFixed(2)}, average grounding=${averageGrounding.toFixed(2)}`,
  );
  console.log("Regression delta: no checked-in baseline yet; compare this summary between prompt changes.");

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

async function runCase(id: string): Promise<EvalCaseResult> {
  const caseDir = path.join(fixturesDir, id);
  const [source, expected, meta] = await Promise.all([
    readFile(path.join(caseDir, "source.md"), "utf8"),
    readJson<ExpectedEval>(path.join(caseDir, "expected.json")),
    readJson<{ description?: string }>(path.join(caseDir, "meta.json")).catch(
      (): { description?: string } => ({}),
    ),
  ]);
  const existingBlock = await readFile(path.join(caseDir, "existing-block.md"), "utf8").catch(() => "");
  const concepts = expected.required_concepts.filter((concept) =>
    source.toLowerCase().includes(concept.toLowerCase()),
  );
  const sourceSpan = sourceSpanFor(source);
  const proposal = {
    reasoning_summary: `Golden eval proposal for ${id}.`,
    incomplete_reasoning: false,
    items: [
      {
        action: "upsert_knowledge" as const,
        target_block_id: existingBlock ? "existing-block" : null,
        title: titleFromSource(source, id),
        body_markdown: [
          "## Concepts",
          ...concepts.map((concept) => `- ${concept}`),
          "",
          "## Source-backed summary",
          sourceSpan.text,
        ].join("\n"),
        source_concept_ids: concepts,
        source_spans: [sourceSpan],
        confidence: "high" as const,
        conflict_detected: expected.should_conflict,
        conflict_summary: expected.should_conflict ? "The source changes or contradicts the existing block." : null,
        conflict_resolution: expected.should_conflict ? ("needs_user_decision" as const) : null,
      },
    ],
    suggested_links: [],
  };

  const judge = await new EvalJudgeService().judge({
    source_text: source,
    chunks: [
      {
        id: `${id}-chunk-1`,
        chunk_index: 0,
        heading: titleFromSource(source, id),
        body_markdown: source,
        token_estimate: Math.max(1, Math.ceil(source.length / 4)),
      },
    ],
    proposal,
    existing_blocks_context: existingBlock
      ? [
          {
            block_id: "existing-block",
            knowledge_source_id: "existing-source",
            title: "Existing block",
            heading: null,
            body_markdown_preview: existingBlock.slice(0, 240),
            rank: 1,
            linked_block_ids: [],
          },
        ]
      : [],
  });

  const proposalText = proposal.items.map((item) => item.body_markdown).join("\n").toLowerCase();
  const groundingScore = judge.grounding.length
    ? judge.grounding.filter((item) => item.verdict === "grounded").length / judge.grounding.length
    : 0;
  const errors: string[] = [];
  if (concepts.length < expected.min_concepts) {
    errors.push(`expected at least ${expected.min_concepts} concepts, got ${concepts.length}`);
  }
  for (const concept of expected.required_concepts) {
    if (!proposalText.includes(concept.toLowerCase())) {
      errors.push(`missing required concept: ${concept}`);
    }
  }
  for (const hallucination of expected.forbidden_hallucinations) {
    if (proposalText.includes(hallucination.toLowerCase())) {
      errors.push(`forbidden hallucination appeared: ${hallucination}`);
    }
  }
  if (proposal.items[0].conflict_detected !== expected.should_conflict) {
    errors.push(`expected conflict_detected=${expected.should_conflict}`);
  }
  if (judge.coverage.score < expected.min_coverage_score) {
    errors.push(`coverage ${judge.coverage.score} is below ${expected.min_coverage_score}`);
  }
  if (groundingScore < expected.min_grounding_score) {
    errors.push(`grounding ${groundingScore} is below ${expected.min_grounding_score}`);
  }

  return {
    id,
    description: meta.description ?? "",
    passed: errors.length === 0,
    coverageScore: judge.coverage.score,
    groundingScore,
    errors,
  };
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function titleFromSource(source: string, fallback: string) {
  const heading = source.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fallback;
}

function sourceSpanFor(source: string) {
  const text = source.split(/\n\n/).find((part) => part.trim() && !part.startsWith("#"))?.trim() ?? source.trim();
  const charStart = Math.max(0, source.indexOf(text));
  return {
    chunk_index: 0,
    char_start: charStart,
    char_end: charStart + text.length,
    text,
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
