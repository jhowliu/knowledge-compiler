import { env } from "../config/env.js";

export type EmbeddingService = {
  embedText(text: string): Promise<number[] | null>;
};

export class NoopEmbeddingService implements EmbeddingService {
  async embedText() {
    return null;
  }
}

export class OpenAIEmbeddingService implements EmbeddingService {
  async embedText(text: string) {
    const input = text.trim();
    if (!input || !env.OPENAI_API_KEY) {
      return null;
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.EMBEDDING_MODEL,
        input,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding request failed with ${response.status}`);
    }

    const embedding = parseEmbeddingResponse(await response.json());
    if (!embedding) {
      throw new Error("OpenAI embedding response did not include an embedding");
    }

    return embedding;
  }
}

export async function embedKnowledgeBlock(
  embeddingService: EmbeddingService,
  block: {
    id: string;
    heading?: string | null;
    bodyMarkdown: string;
    metadata?: Record<string, unknown> | null;
  },
) {
  const text = [sectionContextFrom(block), block.bodyMarkdown].filter(Boolean).join("\n\n");
  return embeddingService.embedText(text);
}

// Contextual Retrieval: prepend the block's section path (e.g.
// "Binary Search on Answer › Examples") so a small chunk keeps the parent
// context it would otherwise lose once retrieved on its own. Falls back to the
// block heading when no path is stored.
function sectionContextFrom(block: {
  heading?: string | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  const rawPath = block.metadata?.sectionPath;
  const path = Array.isArray(rawPath)
    ? rawPath.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  if (path.length) {
    return path.join(" › ");
  }
  return block.heading?.trim() || null;
}

function parseEmbeddingResponse(response: unknown) {
  if (!response || typeof response !== "object") {
    return null;
  }

  const data = Array.isArray((response as Record<string, unknown>).data)
    ? ((response as Record<string, unknown>).data as unknown[])
    : [];
  const first = data[0];
  if (!first || typeof first !== "object") {
    return null;
  }

  const embedding = (first as Record<string, unknown>).embedding;
  return Array.isArray(embedding) && embedding.every((value) => typeof value === "number")
    ? embedding
    : null;
}
