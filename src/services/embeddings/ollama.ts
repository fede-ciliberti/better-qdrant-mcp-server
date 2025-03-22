import axios from 'axios';
import { BaseEmbeddingService } from './base.js';

export class OllamaEmbeddingService extends BaseEmbeddingService {
  // Vector size depends on the model
  // nomic-embed-text produces 768-dimensional embeddings
  readonly vectorSize = 768;
  private readonly defaultModel = 'nomic-embed-text';
  private readonly defaultEndpoint = 'http://localhost:11434';

  constructor(endpoint?: string, model?: string) {
    super(undefined, endpoint || 'http://localhost:11434', model || 'nomic-embed-text');
    this.validateConfig();
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    // Ollama API requires sequential processing of texts
    for (const text of texts) {
      const response = await axios.post(
        `${this.endpoint}/api/embeddings`,
        {
          model: this.model || this.defaultModel,
          prompt: text,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.data.embedding || !Array.isArray(response.data.embedding)) {
        throw new Error('Invalid response from Ollama API');
      }

      embeddings.push(response.data.embedding);
    }

    return embeddings;
  }

  protected requiresApiKey(): boolean {
    return false;
  }

  protected validateConfig(): void {
    if (!this.endpoint) {
      throw new Error('Ollama endpoint is required');
    }
  }
}
