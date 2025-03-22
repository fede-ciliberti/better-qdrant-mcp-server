import axios from 'axios';
import { BaseEmbeddingService } from './base.js';

export class OpenAIEmbeddingService extends BaseEmbeddingService {
  // OpenAI's text-embedding-ada-002 produces 1536-dimensional embeddings
  readonly vectorSize = 1536;
  private readonly defaultModel = 'text-embedding-ada-002';
  private readonly defaultEndpoint = 'https://api.openai.com/v1';

  constructor(apiKey: string, endpoint?: string, model?: string) {
    super(
      apiKey,
      endpoint || 'https://api.openai.com/v1',
      model || 'text-embedding-ada-002'
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
        },
      }
    );

    if (!response.data.data || !Array.isArray(response.data.data)) {
      throw new Error('Invalid response from OpenAI API');
    }

    return response.data.data.map((item: any) => {
      if (!item.embedding || !Array.isArray(item.embedding)) {
        throw new Error('Invalid embedding format in OpenAI response');
      }
      return item.embedding;
    });
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  protected validateConfig(): void {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    if (!this.endpoint) {
      throw new Error('OpenAI endpoint is required');
    }
  }
}
