import { EmbeddingGenerator, EmbeddingServiceConfig } from '../../types.js';
import { OpenAIEmbeddingService } from './openai.js';
import { OpenRouterEmbeddingService } from './openrouter.js';
import { OllamaEmbeddingService } from './ollama.js';
import { FastEmbedService } from './fastembed.js';

export function createEmbeddingService(config: EmbeddingServiceConfig): EmbeddingGenerator {
  switch (config.type) {
    case 'openai':
      if (!config.apiKey) {
        throw new Error('OpenAI API key is required');
      }
      return new OpenAIEmbeddingService(config.apiKey, config.endpoint, config.model);

    case 'openrouter':
      if (!config.apiKey) {
        throw new Error('OpenRouter API key is required');
      }
      return new OpenRouterEmbeddingService(config.apiKey, config.endpoint, config.model);

    case 'ollama':
      return new OllamaEmbeddingService(config.endpoint, config.model);

    case 'fastembed':
      return new FastEmbedService(config.model);

    default:
      throw new Error(`Unknown embedding service type: ${config.type}`);
  }
}

export { OpenAIEmbeddingService } from './openai.js';
export { OpenRouterEmbeddingService } from './openrouter.js';
export { OllamaEmbeddingService } from './ollama.js';
export { FastEmbedService } from './fastembed.js';
