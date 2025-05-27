#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { config } from 'dotenv';
import { createQdrantService } from './services/qdrant.js';
import { createEmbeddingService, createAndInitializeEmbeddingService } from './services/embeddings/index.js';
import { TextProcessor } from './services/text-processing.js';
import { VectorValidationService } from './services/validation.js';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync } from 'fs';

// Load environment variables
config();

interface AddDocumentsArgs {
  filePath: string;
  collection: string;
  embeddingService: 'openai' | 'openrouter' | 'fastembed' | 'ollama';
  chunkSize?: number;
  chunkOverlap?: number;
}

interface SearchArgs {
  query: string;
  collection: string;
  embeddingService: 'openai' | 'openrouter' | 'fastembed' | 'ollama';
  limit?: number;
}

interface DeleteCollectionArgs {
  collection: string;
}

class BetterQdrantServer {
  private server: Server;
  private qdrantService;
  private textProcessor;
  private validationService;

  constructor() {
    this.server = new Server(
      {
        name: 'better-qdrant',
        version: '0.1.1',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize services
    this.qdrantService = createQdrantService(
      process.env.QDRANT_URL || 'http://localhost:6333',
      process.env.QDRANT_API_KEY
    );
    this.textProcessor = new TextProcessor();
    this.validationService = new VectorValidationService(this.qdrantService);

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private isAddDocumentsArgs(args: unknown): args is AddDocumentsArgs {
    if (!args || typeof args !== 'object') return false;
    const a = args as Record<string, unknown>;
    return (
      typeof a.filePath === 'string' &&
      typeof a.collection === 'string' &&
      typeof a.embeddingService === 'string' &&
      ['openai', 'openrouter', 'fastembed', 'ollama'].includes(a.embeddingService) &&
      (a.chunkSize === undefined || typeof a.chunkSize === 'number') &&
      (a.chunkOverlap === undefined || typeof a.chunkOverlap === 'number')
    );
  }

  private isSearchArgs(args: unknown): args is SearchArgs {
    if (!args || typeof args !== 'object') return false;
    const a = args as Record<string, unknown>;
    return (
      typeof a.query === 'string' &&
      typeof a.collection === 'string' &&
      typeof a.embeddingService === 'string' &&
      ['openai', 'openrouter', 'fastembed', 'ollama'].includes(a.embeddingService) &&
      (a.limit === undefined || typeof a.limit === 'number')
    );
  }

  private isDeleteCollectionArgs(args: unknown): args is DeleteCollectionArgs {
    if (!args || typeof args !== 'object') return false;
    const a = args as Record<string, unknown>;
    return typeof a.collection === 'string';
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_collections',
          description: 'List all available Qdrant collections',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'add_documents',
          description: 'Add documents to a Qdrant collection with specified embedding service',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to the file to process',
              },
              collection: {
                type: 'string',
                description: 'Name of the collection to add documents to',
              },
              embeddingService: {
                type: 'string',
                enum: ['openai', 'openrouter', 'fastembed', 'ollama'],
                description: 'Embedding service to use',
              },
              chunkSize: {
                type: 'number',
                description: 'Size of text chunks (optional)',
              },
              chunkOverlap: {
                type: 'number',
                description: 'Overlap between chunks (optional)',
              },
            },
            required: ['filePath', 'collection', 'embeddingService'],
          },
        },
        {
          name: 'search',
          description: 'Search for similar documents in a collection',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query',
              },
              collection: {
                type: 'string',
                description: 'Name of the collection to search in',
              },
              embeddingService: {
                type: 'string',
                enum: ['openai', 'openrouter', 'fastembed', 'ollama'],
                description: 'Embedding service to use',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return (optional)',
              },
            },
            required: ['query', 'collection', 'embeddingService'],
          },
        },
        {
          name: 'delete_collection',
          description: 'Delete a Qdrant collection',
          inputSchema: {
            type: 'object',
            properties: {
              collection: {
                type: 'string',
                description: 'Name of the collection to delete',
              },
            },
            required: ['collection'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'list_collections':
          return this.handleListCollections();
        case 'add_documents':
          if (!this.isAddDocumentsArgs(request.params.arguments)) {
            throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for add_documents');
          }
          return this.handleAddDocuments(request.params.arguments);
        case 'search':
          if (!this.isSearchArgs(request.params.arguments)) {
            throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for search');
          }
          return this.handleSearch(request.params.arguments);
        case 'delete_collection':
          if (!this.isDeleteCollectionArgs(request.params.arguments)) {
            throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for delete_collection');
          }
          return this.handleDeleteCollection(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleListCollections() {
    try {
      const collections = await this.qdrantService.listCollections();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(collections, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('Error in handleListCollections:', error);
      
      let errorDetails = '';
      if (error instanceof Error) {
        errorDetails = `${error.name}: ${error.message}\nStack: ${error.stack}`;
      } else {
        errorDetails = String(error);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `Error listing collections: ${errorDetails}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleAddDocuments(args: AddDocumentsArgs) {
    try {
      // Configure text processor if custom settings provided
      if (args.chunkSize) {
        this.textProcessor.setChunkSize(args.chunkSize);
      }
      if (args.chunkOverlap) {
        this.textProcessor.setChunkOverlap(args.chunkOverlap);
      }

      // Read and process the file
      const content = readFileSync(args.filePath, 'utf-8');
      const chunks = await this.textProcessor.processFile(content, args.filePath);

      // Create and initialize embedding service
      const embeddingService = await createAndInitializeEmbeddingService({
        type: args.embeddingService,
        apiKey: process.env[`${args.embeddingService.toUpperCase()}_API_KEY`],
        endpoint: process.env[`${args.embeddingService.toUpperCase()}_ENDPOINT`],
        model: process.env[`${args.embeddingService.toUpperCase()}_MODEL`],
      });

      // Validate embedding compatibility with collection
      const compatibilityResult = await this.validationService.validateEmbeddingCompatibility(
        args.collection,
        embeddingService
      );

      if (!compatibilityResult.isValid) {
        let errorMessage = `Embedding compatibility error: ${compatibilityResult.reason}`;
        if (compatibilityResult.suggestedActions) {
          errorMessage += '\n\nSuggested actions:\n' + 
            compatibilityResult.suggestedActions.map(action => `- ${action}`).join('\n');
        }
        
        return {
          content: [
            {
              type: 'text',
              text: errorMessage,
            },
          ],
          isError: true,
        };
      }

      // Generate embeddings
      const embeddings = await embeddingService.generateEmbeddings(
        chunks.map(chunk => chunk.text)
      );

      // Validate vector data before adding to collection
      const vectorValidation = this.validationService.validateVectorData(
        embeddings,
        embeddingService.vectorSize
      );

      if (!vectorValidation.isValid) {
        let errorMessage = `Vector validation failed:\n${vectorValidation.errors.join('\n')}`;
        if (vectorValidation.warnings.length > 0) {
          errorMessage += '\n\nWarnings:\n' + vectorValidation.warnings.join('\n');
        }
        
        return {
          content: [
            {
              type: 'text',
              text: errorMessage,
            },
          ],
          isError: true,
        };
      }

      // Create collection if it doesn't exist (only if validation passed)
      if (compatibilityResult.action === 'create_collection') {
        await this.qdrantService.createCollection(args.collection, embeddingService.vectorSize);
      }

      // Add documents to collection
      await this.qdrantService.addDocuments(
        args.collection,
        chunks.map((chunk, i) => ({
          id: uuidv4(),
          vector: embeddings[i],
          payload: {
            text: chunk.text,
            ...chunk.metadata,
          },
        }))
      );

      let successMessage = `Successfully processed and added ${chunks.length} chunks to collection ${args.collection}`;
      
      // Add validation warnings if any
      if (vectorValidation.warnings.length > 0) {
        successMessage += '\n\nWarnings:\n' + vectorValidation.warnings.join('\n');
      }

      return {
        content: [
          {
            type: 'text',
            text: successMessage,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error adding documents: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleSearch(args: SearchArgs) {
    try {
      // Create and initialize embedding service
      const embeddingService = await createAndInitializeEmbeddingService({
        type: args.embeddingService,
        apiKey: process.env[`${args.embeddingService.toUpperCase()}_API_KEY`],
        endpoint: process.env[`${args.embeddingService.toUpperCase()}_ENDPOINT`],
        model: process.env[`${args.embeddingService.toUpperCase()}_MODEL`],
      });

      // Validate embedding compatibility with collection
      const compatibilityResult = await this.validationService.validateEmbeddingCompatibility(
        args.collection,
        embeddingService
      );

      if (!compatibilityResult.isValid) {
        let errorMessage = `Embedding compatibility error: ${compatibilityResult.reason}`;
        if (compatibilityResult.suggestedActions) {
          errorMessage += '\n\nSuggested actions:\n' + 
            compatibilityResult.suggestedActions.map(action => `- ${action}`).join('\n');
        }
        
        return {
          content: [
            {
              type: 'text',
              text: errorMessage,
            },
          ],
          isError: true,
        };
      }

      // Generate query embedding
      const [queryEmbedding] = await embeddingService.generateEmbeddings([args.query]);

      // Validate the query vector
      const vectorValidation = this.validationService.validateVectorData(
        [queryEmbedding],
        embeddingService.vectorSize
      );

      if (!vectorValidation.isValid) {
        return {
          content: [
            {
              type: 'text',
              text: `Query vector validation failed: ${vectorValidation.errors.join(', ')}`,
            },
          ],
          isError: true,
        };
      }

      // Search collection
      const results = await this.qdrantService.search(
        args.collection,
        queryEmbedding,
        args.limit
      );

      // Format the results to only include the payload text
      let responseText = '';
      
      results.forEach((result, index) => {
        // For documents collection, the text is in result.payload.text
        // For other collections, it might be in different fields
        const text = result.payload.text || result.payload.content || JSON.stringify(result.payload);
        const source = result.payload.source || result.payload.metadata?.source || '';
        const score = result.score.toFixed(2);
        
        responseText += `Result ${index + 1} (Score: ${score}):\n${text}\n`;
        if (source) {
          responseText += `Source: ${source}\n`;
        }
        responseText += '\n';
      });
      
      if (responseText === '') {
        responseText = 'No results found.';
      }

      // Add validation warnings if any
      if (vectorValidation.warnings.length > 0) {
        responseText += '\nQuery vector warnings:\n' + vectorValidation.warnings.join('\n');
      }

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error searching: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleDeleteCollection(args: DeleteCollectionArgs) {
    try {
      // Delete the collection
      await this.qdrantService.deleteCollection(args.collection);
      
      return {
        content: [
          {
            type: 'text',
            text: `Successfully deleted collection: ${args.collection}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error deleting collection: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Better Qdrant MCP server running on stdio');
  }
}

const server = new BetterQdrantServer();
server.run().catch((error) => {
  console.error('Server error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
