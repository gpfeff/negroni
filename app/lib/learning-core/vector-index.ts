import { createHash } from "node:crypto";

import type { LearningScope, RetrievalMatch } from "./contracts.ts";

export type VectorDocument = LearningScope & {
  learning_id: string;
  version: number;
  text: string;
};

export type VectorSearchMatch = {
  learning_id: string;
  version: number;
  score: number;
};

export interface VectorIndex {
  readonly name: string;
  upsert(document: VectorDocument, rebuiltAt: string): void;
  search(scope: LearningScope, query: string, limit: number): VectorSearchMatch[];
  clear(scope: LearningScope): number;
  rebuild(scope: LearningScope, documents: VectorDocument[], rebuiltAt: string): number;
}

export interface VectorRepository {
  putVector(input: VectorDocument & {
    model: string;
    vector: number[];
    content_sha256: string;
    rebuilt_at: string;
  }): void;
  listVectors(scope: LearningScope): Array<{
    learning_id: string;
    version: number;
    vector: number[];
  }>;
  clearVectors(scope: LearningScope): number;
}

const DIMENSIONS = 64;
const MODEL = "negroni-deterministic-hash-v1";

function tokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]{2,}/g)?.slice(0, 2_000) ?? [];
}

export function deterministicEmbedding(value: string): number[] {
  const vector = Array.from({ length: DIMENSIONS }, () => 0);
  for (const token of tokens(value)) {
    const digest = createHash("sha256").update(token).digest();
    const index = digest.readUInt16BE(0) % DIMENSIONS;
    vector[index] += digest[2] % 2 === 0 ? 1 : -1;
  }
  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
  return norm === 0 ? vector : vector.map((item) => item / norm);
}

function cosine(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return 0;
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

export class SqliteVectorIndex implements VectorIndex {
  readonly name = MODEL;
  readonly #repository: VectorRepository;

  constructor(repository: VectorRepository) {
    this.#repository = repository;
  }

  upsert(document: VectorDocument, rebuiltAt: string): void {
    const vector = deterministicEmbedding(document.text);
    this.#repository.putVector({
      ...document,
      model: MODEL,
      vector,
      content_sha256: createHash("sha256").update(document.text).digest("hex"),
      rebuilt_at: rebuiltAt,
    });
  }

  search(scope: LearningScope, query: string, limit: number): VectorSearchMatch[] {
    const queryVector = deterministicEmbedding(query);
    return this.#repository.listVectors(scope)
      .map((item) => ({
        learning_id: item.learning_id,
        version: item.version,
        score: cosine(queryVector, item.vector),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(0, Math.min(limit, 50)));
  }

  clear(scope: LearningScope): number {
    return this.#repository.clearVectors(scope);
  }

  rebuild(scope: LearningScope, documents: VectorDocument[], rebuiltAt: string): number {
    this.clear(scope);
    for (const document of documents) this.upsert(document, rebuiltAt);
    return documents.length;
  }
}

export class DisabledVectorIndex implements VectorIndex {
  readonly name = "disabled";
  upsert(document: VectorDocument, rebuiltAt: string): void {
    void document;
    void rebuiltAt;
  }
  search(scope: LearningScope, query: string, limit: number): VectorSearchMatch[] {
    void scope;
    void query;
    void limit;
    return [];
  }
  clear(scope: LearningScope): number {
    void scope;
    return 0;
  }
  rebuild(_scope: LearningScope, documents: VectorDocument[]): number { return documents.length; }
}

export function mergeVectorScores(matches: RetrievalMatch[], vectorMatches: VectorSearchMatch[]): RetrievalMatch[] {
  const scores = new Map(vectorMatches.map((item) => [`${item.learning_id}:${item.version}`, item.score]));
  return matches.map((match) => ({
    ...match,
    score: Math.max(match.score, scores.get(`${match.learning_id}:${match.version}`) ?? 0),
  })).sort((left, right) => right.score - left.score);
}
