import { remapScroll } from './scrollRemap';

export interface ProgressAdapter {
  setProgress(semanticT: number): void;
}

export type ProgressAdapterInput =
  | ProgressAdapter
  | readonly ProgressAdapter[]
  | undefined;

export interface ProgressDirectorOptions {
  remap?: (raw: number) => number;
  bike?: ProgressAdapterInput;
  camera?: ProgressAdapterInput;
  content?: ProgressAdapterInput;
  fx?: ProgressAdapterInput;
}

interface PendingProgress {
  raw: number;
  semantic: number;
  nextAdapterIndex: number;
}

function adapterList(input: ProgressAdapterInput): readonly ProgressAdapter[] {
  if (input === undefined) return [];
  return Array.isArray(input)
    ? [...input]
    : [input as ProgressAdapter];
}

export class ProgressDirector {
  private readonly remap: (raw: number) => number;
  private readonly adapters: readonly ProgressAdapter[];
  private lastRaw: number | undefined;
  private lastSemantic: number | undefined;
  private pending: PendingProgress | undefined;

  constructor(options: ProgressDirectorOptions = {}) {
    this.remap = options.remap ?? remapScroll;
    this.adapters = [
      ...adapterList(options.bike),
      ...adapterList(options.camera),
      ...adapterList(options.content),
      ...adapterList(options.fx),
    ];
  }

  setProgress(raw: number): number {
    if (!Number.isFinite(raw)) {
      throw new Error('Director progress must be finite');
    }
    if (this.pending !== undefined) {
      if (!Object.is(raw, this.pending.raw)) {
        throw new Error(
          `ProgressDirector has pending progress ${this.pending.raw}; ` +
          'retry with the same raw progress before advancing',
        );
      }
      return this.resumePending();
    }
    if (this.lastRaw !== undefined && Object.is(raw, this.lastRaw)) {
      return this.lastSemantic as number;
    }

    const semanticT = this.remap(raw);
    if (!Number.isFinite(semanticT)) {
      throw new Error('Director remap must return finite progress');
    }
    if (
      this.lastSemantic !== undefined &&
      Object.is(semanticT, this.lastSemantic)
    ) {
      this.lastRaw = raw;
      return semanticT;
    }

    this.pending = { raw, semantic: semanticT, nextAdapterIndex: 0 };
    return this.resumePending();
  }

  private resumePending(): number {
    const transaction = this.pending;
    if (transaction === undefined) {
      throw new Error('ProgressDirector has no pending progress');
    }
    while (transaction.nextAdapterIndex < this.adapters.length) {
      this.adapters[transaction.nextAdapterIndex].setProgress(
        transaction.semantic,
      );
      transaction.nextAdapterIndex += 1;
    }
    this.lastRaw = transaction.raw;
    this.lastSemantic = transaction.semantic;
    this.pending = undefined;
    return transaction.semantic;
  }
}
