import { AppError } from "../domain/errors.js";
import type { CreateRawSourceInput, UpdateRawSourceInput } from "../domain/rawSource.js";
import type { RawSourceRepository } from "../repositories/rawSource.repository.js";
import { chunkSourceMarkdown } from "./sourceChunker.service.js";

export class RawSourceService {
  constructor(private readonly rawSourceRepository: RawSourceRepository) {}

  async createRawSource(input: CreateRawSourceInput) {
    return this.rawSourceRepository.create(input, chunkSourceMarkdown(input.bodyMarkdown));
  }

  async listRecentRawSources() {
    return this.rawSourceRepository.listRecent(50);
  }

  async getRawSource(id: string) {
    const rawSource = await this.rawSourceRepository.getById(id);
    if (!rawSource) {
      throw new AppError("Raw source not found", 404);
    }
    return rawSource;
  }

  async updateRawSource(id: string, input: UpdateRawSourceInput) {
    const rawSource = await this.rawSourceRepository.update(
      id,
      input,
      chunkSourceMarkdown(input.bodyMarkdown),
    );
    if (!rawSource) {
      throw new AppError("Raw source not found", 404);
    }
    return rawSource;
  }

  async deleteRawSource(id: string) {
    const deleted = await this.rawSourceRepository.delete(id);
    if (!deleted) {
      throw new AppError("Raw source not found", 404);
    }
  }
}
