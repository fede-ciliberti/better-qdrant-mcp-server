import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantService, SearchResult } from '../types.js';

/**
 * Qdrant service implementation using the official JavaScript client
 * 
 * This service provides a clean interface to Qdrant operations
 * using the official client library instead of direct HTTP calls.
 */
export class DefaultQdrantService implements QdrantService {
  constructor(public client: QdrantClient) {}

  /**
   * Handles Qdrant API errors with proper logging and error transformation
   */
  private async handleQdrantError(error: any, operation: string): Promise<never> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Qdrant ${operation} error:`, errorMessage);
    throw new Error(`Failed to ${operation}: ${errorMessage}`);
  }

  /**
   * Lists all available collections in the Qdrant instance
   * @returns Array of collection names
   */
  async listCollections(): Promise<string[]> {
    try {
      const response = await this.client.getCollections();
      return response.collections?.map(c => c.name) || [];
    } catch (error) {
      return this.handleQdrantError(error, 'list collections');
    }
  }

  /**
   * Creates a new collection with specified vector configuration
   * @param name Collection name
   * @param vectorSize Dimension of vectors to store
   */
  async createCollection(name: string, vectorSize: number): Promise<void> {
    try {
      await this.client.createCollection(name, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine',
        }
      });
    } catch (error) {
      return this.handleQdrantError(error, 'create collection');
    }
  }

  /**
   * Adds documents with vectors to a collection
   * @param collection Collection name
   * @param documents Array of documents with vectors and metadata
   */
  async addDocuments(
    collection: string,
    documents: { id: string; vector: number[]; payload: Record<string, any> }[]
  ): Promise<void> {
    try {
      const points = documents.map(doc => ({
        id: doc.id,
        vector: doc.vector,
        payload: doc.payload,
      }));

      await this.client.upsert(collection, {
        wait: true,
        points
      });
    } catch (error) {
      return this.handleQdrantError(error, 'add documents');
    }
  }

  /**
   * Deletes a collection and all its data
   * @param name Collection name to delete
   */
  async deleteCollection(name: string): Promise<void> {
    try {
      await this.client.deleteCollection(name);
    } catch (error) {
      return this.handleQdrantError(error, 'delete collection');
    }
  }

  /**
   * Performs vector similarity search in a collection
   * @param collection Collection name to search in
   * @param vector Query vector
   * @param limit Maximum number of results
   * @returns Array of search results with scores and payloads
   */
  async search(
    collection: string,
    vector: number[],
    limit: number = 10
  ): Promise<SearchResult[]> {
    try {
      const response = await this.client.search(collection, {
        vector,
        limit,
        with_payload: true,
        with_vector: false // We don't need vectors in search results
      });

      return response.map(point => ({
        id: String(point.id),
        score: point.score,
        payload: point.payload || {},
        vector: point.vector as number[] || undefined
      }));
    } catch (error) {
      return this.handleQdrantError(error, 'search collection');
    }
  }

  /**
   * Checks if a collection exists
   * @param name Collection name to check
   * @returns True if collection exists, false otherwise
   */
  async collectionExists(name: string): Promise<boolean> {
    try {
      const collections = await this.listCollections();
      return collections.includes(name);
    } catch (error) {
      console.warn(`Could not check if collection ${name} exists:`, error);
      return false;
    }
  }

  /**
   * Gets collection information including vector configuration
   * @param name Collection name
   * @returns Collection info or null if not found
   */
  async getCollectionInfo(name: string): Promise<{ vectorSize: number; distance: string } | null> {
    try {
      const info = await this.client.getCollection(name);
      if (info.config?.params?.vectors) {
        const vectorConfig = info.config.params.vectors;
        if (typeof vectorConfig === 'object' && 'size' in vectorConfig) {
          return {
            vectorSize: vectorConfig.size as number,
            distance: (vectorConfig.distance as string) || 'Cosine'
          };
        }
      }
      return null;
    } catch (error) {
      console.warn(`Could not get collection info for ${name}:`, error);
      return null;
    }
  }
}

/**
 * Factory function to create a Qdrant service instance
 * @param url Qdrant server URL
 * @param apiKey Optional API key for authentication
 * @returns Configured QdrantService instance
 */
export function createQdrantService(url: string, apiKey?: string): QdrantService {
  const client = new QdrantClient({
    url,
    apiKey,
    checkCompatibility: false
  });
  
  return new DefaultQdrantService(client);
}