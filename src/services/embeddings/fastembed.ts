import { BaseEmbeddingService } from './base.js';

export class FastEmbedService extends BaseEmbeddingService {
  // FastEmbed models typically produce 384-dimensional embeddings
  readonly vectorSize = 384;
  private readonly defaultModel = 'BAAI/bge-small-en';
  private embedder: any = null;

  constructor(model?: string) {
    super(undefined, undefined, model || 'BAAI/bge-small-en');
  }

  private async initializeEmbedder(): Promise<void> {
    if (!this.embedder) {
      // Dynamic import to handle CommonJS module
      const fastembed = await import('fastembed');
      this.embedder = new fastembed.FastEmbed({
        model: this.model || this.defaultModel
      });
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    await this.initializeEmbedder();
    if (!this.embedder) {
      throw new Error('FastEmbed embedder not initialized');
    }

    const embeddings = await this.embedder.embed(texts);
    return embeddings.map((embedding: Float32Array) => Array.from(embedding));
  }

  protected requiresApiKey(): boolean {
    return false;
  }

  protected validateConfig(): void {
    // No validation needed as FastEmbed runs locally
  }
}
