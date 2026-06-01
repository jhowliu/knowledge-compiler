import { closeDatabase } from "../db/postgres.js";
import { PostgresKnowledgeRepository } from "../repositories/knowledge.repository.js";
import { embedKnowledgeBlock, OpenAIEmbeddingService } from "../services/embedding.service.js";

const batchSize = Number(process.env.EMBEDDING_BACKFILL_BATCH_SIZE ?? 50);

async function run() {
  const repository = new PostgresKnowledgeRepository();
  const embeddingService = new OpenAIEmbeddingService();
  let updated = 0;
  let skipped = 0;

  while (true) {
    const blocks = await repository.listKnowledgeBlocksNeedingEmbeddings(batchSize);
    if (blocks.length === 0) {
      break;
    }

    for (const block of blocks) {
      const embedding = await embedKnowledgeBlock(embeddingService, block);
      if (!embedding) {
        skipped += 1;
        continue;
      }

      await repository.updateKnowledgeBlockEmbedding(block.id, embedding);
      updated += 1;
      console.log(`embedded ${block.id}`);
    }

    if (blocks.length < batchSize) {
      break;
    }
  }

  console.log(`embedding backfill complete: ${updated} updated, ${skipped} skipped`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
