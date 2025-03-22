import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';

export interface TextChunk {
  text: string;
  metadata: {
    index: number;
    source?: string;
    start?: number;
    end?: number;
  };
}

export class TextProcessor {
  private splitter: RecursiveCharacterTextSplitter;

  constructor(
    private chunkSize: number = 1000,
    private chunkOverlap: number = 200
  ) {
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
    });
  }

  async processText(text: string, source?: string): Promise<TextChunk[]> {
    const documents = await this.splitter.createDocuments([text]);
    
    return documents.map((doc: Document, index: number) => ({
      text: doc.pageContent,
      metadata: {
        index,
        source,
        start: doc.metadata?.start,
        end: doc.metadata?.end,
      },
    }));
  }

  async processFile(content: string, filename: string): Promise<TextChunk[]> {
    return this.processText(content, filename);
  }

  setChunkSize(size: number): void {
    this.chunkSize = size;
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
    });
  }

  setChunkOverlap(overlap: number): void {
    this.chunkOverlap = overlap;
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
    });
  }
}
