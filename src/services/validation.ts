import { EmbeddingGenerator } from '../types.js';
import { QdrantService } from '../types.js';

/**
 * Vector validation service to ensure compatibility between embeddings and collections
 */
export class VectorValidationService {
  constructor(
    private qdrantService: QdrantService
  ) {}

  /**
   * Validates that an embedding service can be used with a collection
   * @param collection Collection name
   * @param embeddingService Embedding service to validate
   * @returns Validation result with details
   */
  async validateEmbeddingCompatibility(
    collection: string,
    embeddingService: EmbeddingGenerator
  ): Promise<VectorValidationResult> {
    try {
      // Check if collection exists
      const collectionExists = await this.qdrantService.collectionExists(collection);
      
      if (!collectionExists) {
        return {
          isValid: true,
          reason: 'Collection does not exist - will be created with correct dimensions',
          expectedVectorSize: embeddingService.vectorSize,
          actualVectorSize: null,
          action: 'create_collection'
        };
      }

      // Get collection info
      const collectionInfo = await this.qdrantService.getCollectionInfo(collection);
      
      if (!collectionInfo) {
        return {
          isValid: false,
          reason: 'Could not retrieve collection information',
          expectedVectorSize: embeddingService.vectorSize,
          actualVectorSize: null,
          action: 'error'
        };
      }

      // Check vector size compatibility
      if (collectionInfo.vectorSize !== embeddingService.vectorSize) {
        return {
          isValid: false,
          reason: `Vector size mismatch: collection expects ${collectionInfo.vectorSize}, but embedding service produces ${embeddingService.vectorSize}`,
          expectedVectorSize: embeddingService.vectorSize,
          actualVectorSize: collectionInfo.vectorSize,
          action: 'size_mismatch',
          suggestedActions: [
            `Use a different embedding service that produces ${collectionInfo.vectorSize}-dimensional vectors`,
            `Create a new collection with ${embeddingService.vectorSize}-dimensional vectors`,
            `Delete and recreate the collection (WARNING: this will lose all data)`
          ]
        };
      }

      return {
        isValid: true,
        reason: 'Vector dimensions are compatible',
        expectedVectorSize: embeddingService.vectorSize,
        actualVectorSize: collectionInfo.vectorSize,
        action: 'compatible'
      };

    } catch (error) {
      return {
        isValid: false,
        reason: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
        expectedVectorSize: embeddingService.vectorSize,
        actualVectorSize: null,
        action: 'error'
      };
    }
  }

  /**
   * Validates vector data before adding to collection
   * @param vectors Array of vectors to validate
   * @param expectedSize Expected vector size
   * @returns Validation result
   */
  validateVectorData(vectors: number[][], expectedSize: number): VectorDataValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if vectors array is empty
    if (vectors.length === 0) {
      errors.push('No vectors provided');
    }

    // Validate each vector
    vectors.forEach((vector, index) => {
      // Check if vector is an array
      if (!Array.isArray(vector)) {
        errors.push(`Vector at index ${index} is not an array`);
        return;
      }

      // Check vector size
      if (vector.length !== expectedSize) {
        errors.push(`Vector at index ${index} has size ${vector.length}, expected ${expectedSize}`);
      }

      // Check if all elements are numbers
      const nonNumbers = vector.filter((val, valIndex) => typeof val !== 'number' || isNaN(val));
      if (nonNumbers.length > 0) {
        errors.push(`Vector at index ${index} contains ${nonNumbers.length} non-numeric values`);
      }

      // Check for extreme values that might indicate problems
      const extremeValues = vector.filter(val => Math.abs(val) > 100);
      if (extremeValues.length > 0) {
        warnings.push(`Vector at index ${index} contains ${extremeValues.length} values with absolute value > 100`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      vectorCount: vectors.length,
      expectedSize
    };
  }

  /**
   * Gets recommended embedding services for common use cases
   */
  getEmbeddingServiceRecommendations(): EmbeddingServiceRecommendation[] {
    return [
      {
        service: 'openai',
        model: 'text-embedding-ada-002',
        vectorSize: 1536,
        useCase: 'General purpose, high quality embeddings',
        pros: ['High quality', 'Widely supported', 'Good for production'],
        cons: ['Requires API key', 'Costs money per request']
      },
      {
        service: 'ollama',
        model: 'nomic-embed-text',
        vectorSize: 768,
        useCase: 'Local embeddings, privacy-focused',
        pros: ['Free', 'Local processing', 'No API key needed'],
        cons: ['Requires local Ollama installation', 'Smaller vector size']
      },
      {
        service: 'fastembed',
        model: 'BAAI/bge-small-en',
        vectorSize: 384,
        useCase: 'Fast local embeddings, minimal resource usage',
        pros: ['Very fast', 'Small footprint', 'No network required'],
        cons: ['Smallest vector size', 'Limited language support']
      },
      {
        service: 'openrouter',
        model: 'openai/text-embedding-ada-002',
        vectorSize: 1536,
        useCase: 'OpenAI-compatible with multiple providers',
        pros: ['Multiple provider options', 'OpenAI compatibility'],
        cons: ['Requires API key', 'Variable pricing']
      }
    ];
  }
}

/**
 * Result of vector validation
 */
export interface VectorValidationResult {
  isValid: boolean;
  reason: string;
  expectedVectorSize: number;
  actualVectorSize: number | null;
  action: 'create_collection' | 'compatible' | 'size_mismatch' | 'error';
  suggestedActions?: string[];
}

/**
 * Result of vector data validation
 */
export interface VectorDataValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  vectorCount: number;
  expectedSize: number;
}

/**
 * Embedding service recommendation
 */
export interface EmbeddingServiceRecommendation {
  service: string;
  model: string;
  vectorSize: number;
  useCase: string;
  pros: string[];
  cons: string[];
}
