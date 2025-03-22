import axios from 'axios';
import { BaseEmbeddingService } from './base.js';

export class OpenRouterEmbeddingService extends BaseEmbeddingService {
  // Using OpenAI-compatible model by default, which produces 1536-dimensional embeddings
  readonly vectorSize = 1536;
  private readonly defaultModel = 'openai/text-embedding-ada-002';
  private readonly defaultEndpoint = 'https://openrouter.ai/api/v1';

  constructor(apiKey: string, endpoint?: string, model?: string) {
    super(
      apiKey,
      endpoint || 'https://openrouter.ai/api/v1',
      model || 'openai/text-embedding-ada-002'
    );
    this.validateConfig();
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await axios.post(
      `${this.endpoint}/embeddings`,
      {
        input: texts,
        model: this.model || this.defaultModel,
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/wreeves/better-qdrant',
          'X-Title': 'Better Qdrant',
        },
      }
    );

    if (!response.data.data || !Array.isArray(response.data.data)) {
      throw new Error('Invalid response from OpenRouter API');
    }

    return response.data.data.map((item: any) => {
      if (!item.embedding || !Array.isArray(item.embedding)) {
        throw new Error('Invalid embedding format in OpenRouter response');
      }
      return item.embedding;
    });
  }

  protected requiresApiKey(): boolean {
    return true;
  }
}
