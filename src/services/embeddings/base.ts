import { EmbeddingGenerator } from '../../types.js';

export abstract class BaseEmbeddingService implements EmbeddingGenerator {
  constructor(protected apiKey?: string, protected endpoint?: string, protected model?: string) {}

  abstract vectorSize: number;
  abstract generateEmbeddings(texts: string[]): Promise<number[][]>;

  protected validateConfig(): void {
    if (this.requiresApiKey() && !this.apiKey) {
      throw new Error(`${this.constructor.name} requires an API key`);
    }
  }

  protected requiresApiKey(): boolean {
    return true;
  }
}
