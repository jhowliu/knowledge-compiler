import { env } from "../config/env.js";

// Contextual Retrieval (Anthropic): for each mechanically-split chunk, generate a
// short context that situates it within the whole note, then prepend it before
// embedding. This replaces brittle heading/label heuristics with content-aware
// context that works even when the note has no headings.
export type KnowledgeContextualizer = {
  contextualize(input: { note: string; chunk: string }): Promise<string | null>;
};

export class NoopKnowledgeContextualizer implements KnowledgeContextualizer {
  async contextualize() {
    return null;
  }
}

const systemPrompt =
  "You add retrieval context to a chunk taken from a larger note. " +
  "Given the whole note and one chunk from it, write a short, succinct context " +
  "(one sentence, ~50-100 tokens) that situates the chunk within the note so it " +
  "can be retrieved on its own. Mention the note's subject and what this chunk " +
  "covers. Output only the context sentence, with no preamble, quotes, or labels.";

export class OpenAIKnowledgeContextualizer implements KnowledgeContextualizer {
  async contextualize(input: { note: string; chunk: string }) {
    if (!env.OPENAI_API_KEY) {
      return null;
    }

    const note = input.note.trim();
    const chunk = input.chunk.trim();
    if (!note || !chunk) {
      return null;
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.CONTEXT_MODEL,
        input: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            // Note first so it is a stable, cacheable prefix across the note's chunks.
            content: [`Whole note:\n${note}`, `Chunk to contextualize:\n${chunk}`].join(
              "\n\n---\n\n",
            ),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI contextualize request failed with ${response.status}`);
    }

    const text = outputText(await response.json());
    return text ? text.trim() || null : null;
  }
}

function outputText(response: unknown) {
  if (!response || typeof response !== "object") {
    return null;
  }
  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string") {
    return record.output_text;
  }
  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") continue;
      const text = (contentItem as Record<string, unknown>).text;
      if (typeof text === "string") {
        return text;
      }
    }
  }
  return null;
}
