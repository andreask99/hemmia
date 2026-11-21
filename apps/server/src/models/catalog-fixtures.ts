/** Test data for the model catalogue (P11.4, P11.5). */
import type { CatalogModel } from '@hemmia/relay-protocol';

export function remoteModel(ollamaModel: string, over: Partial<CatalogModel> = {}): CatalogModel {
  return {
    ollamaModel,
    name: ollamaModel,
    family: 'qwen',
    version: '3.9',
    params: '30b',
    downloadBytes: 19 * 1024 ** 3,
    digest: `sha256:${'1'.repeat(64)}`,
    memoryGiB: 23,
    minTotalMemoryGiB: 48,
    contextTokens: 1_048_576,
    vision: false,
    tools: true,
    think: true,
    pulls: 5000,
    releasedAt: '2026-11-01',
    addedAt: '2026-11-20',
    tested: true,
    supersedes: [],
    description: 'New model.',
    ...over,
  };
}
