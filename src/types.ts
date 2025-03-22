import { QdrantClient } from '@qdrant/js-client-rest';

export type EmbeddingService = 'openai' | 'openrouter' | 'fastembed' | 'ollama';

export interface EmbeddingServiceConfig {
  type: EmbeddingService;
  apiKey?: string;
  endpoint?: string;
  model?: string;
}

export interface QdrantConfig {
  url: string;
  apiKey?: string;
}

export interface ServerConfig {
  qdrant: QdrantConfig;
  embedding: EmbeddingServiceConfig;
}

export interface Collection {
  name: string;
  vectorSize: number;
  distance: 'Cosine' | 'Euclid' | 'Dot';
}

export interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, any>;
  vector?: number[];
}

export interface EmbeddingGenerator {
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  vectorSize: number;
}

export interface QdrantService {
  client: QdrantClient;
  listCollections(): Promise<string[]>;
  createCollection(name: string, vectorSize: number): Promise<void>;
  deleteCollection(name: string): Promise<void>;
  addDocuments(collection: string, documents: { id: string; vector: number[]; payload: Record<string, any> }[]): Promise<void>;
  search(collection: string, vector: number[], limit?: number): Promise<SearchResult[]>;
}
