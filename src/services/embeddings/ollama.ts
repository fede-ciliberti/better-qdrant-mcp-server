import axios from 'axios';
import { BaseEmbeddingService } from './base.js';

export class OllamaEmbeddingService extends BaseEmbeddingService {
  // Vector size is determined dynamically based on the model
  private _vectorSize: number | null = null;
  private readonly defaultModel = 'nomic-embed-text';
  private readonly defaultEndpoint = 'http://host.docker.internal:11434';
  
  // Cache to avoid repeated dimension detection calls for the same model
  private static dimensionCache = new Map<string, number>();

  constructor(endpoint?: string, model?: string) {
    super(undefined, endpoint || 'http://host.docker.internal:11434', model || 'nomic-embed-text');
    this.validateConfig();
  }

  /**
   * Get the vector size for the current model.
   * Automatically detects dimensions on first use and caches the result.
   */
  get vectorSize(): number {
    if (this._vectorSize === null) {
      throw new Error('Vector size not initialized. Call initializeVectorSize() first.');
    }
    return this._vectorSize;
  }

  /**
   * Initialize vector size by detecting dimensions from the model.
   * Uses cache to avoid repeated API calls for the same model.
   */
  async initializeVectorSize(): Promise<void> {
    const modelKey = `${this.endpoint}:${this.model || this.defaultModel}`;
    
    // Check cache first
    const cachedSize = OllamaEmbeddingService.dimensionCache.get(modelKey);
    if (cachedSize) {
      this._vectorSize = cachedSize;
      return;
    }

    // Detect dimensions by making a test embedding call
    try {
      const testEmbedding = await this.detectModelDimensions();
      this._vectorSize = testEmbedding.length;
      
      // Cache the result
      OllamaEmbeddingService.dimensionCache.set(modelKey, this._vectorSize);
      
      console.log(`✅ Detected ${this._vectorSize} dimensions for model: ${this.model || this.defaultModel}`);
    } catch (error) {
      throw new Error(`Failed to detect vector dimensions for model ${this.model || this.defaultModel}: ${error}`);
    }
  }

  /**
   * Detect model dimensions by generating a test embedding.
   */
  private async detectModelDimensions(): Promise<number[]> {
    const response = await axios.post(
      `${this.endpoint}/api/embed`,
      {
        model: this.model || this.defaultModel,
        input: ['test'], // Single test input
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = response.data as { embeddings?: number[][] };
    
    if (!data.embeddings || !Array.isArray(data.embeddings) || data.embeddings.length === 0) {
      throw new Error('Invalid response from Ollama API during dimension detection');
    }

    const embedding = data.embeddings[0];
    if (!Array.isArray(embedding) || !embedding.every(v => typeof v === 'number')) {
      throw new Error('Invalid embedding format in Ollama response during dimension detection');
    }

    return embedding;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Ensure vector size is initialized
    if (this._vectorSize === null) {
      await this.initializeVectorSize();
    }

    // Use the new /api/embed endpoint which supports batch processing
    const response = await axios.post(
      `${this.endpoint}/api/embed`,
      {
        model: this.model || this.defaultModel,
        input: texts,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    // Type guard for Ollama API response
    const data = response.data as { embeddings?: number[][] };
    
    if (!data.embeddings || !Array.isArray(data.embeddings)) {
      throw new Error('Invalid response from Ollama API');
    }

    // Validate each embedding array
    data.embeddings.forEach((embedding, index) => {
      if (!Array.isArray(embedding) || !embedding.every(v => typeof v === 'number')) {
        throw new Error(`Invalid embedding format at index ${index} in Ollama response`);
      }
      
      // Validate dimensions match expected size
      if (embedding.length !== this._vectorSize) {
        throw new Error(
          `Dimension mismatch at index ${index}: expected ${this._vectorSize}, got ${embedding.length}`
        );
      }
    });

    return data.embeddings;
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
