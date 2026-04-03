export type ThinkingChunkMergeStrategy = 'append' | 'paragraph';

export function appendThinkingChunk(
  existing: string,
  chunk: string,
  strategy: ThinkingChunkMergeStrategy = 'paragraph',
): string {
  if (!existing) return chunk;
  if (!chunk) return existing;
  return strategy === 'append' ? `${existing}${chunk}` : `${existing}\n\n${chunk}`;
}
