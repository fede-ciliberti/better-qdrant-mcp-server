declare module 'fastembed' {
  export class FastEmbed {
    constructor(options: { model: string });
    embed(texts: string[]): Promise<Float32Array[]>;
  }
}
