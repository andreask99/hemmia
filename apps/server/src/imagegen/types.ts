/**
 * Contract for image engines (Claude). The mflux worker process manager (process.ts) is
 * delegated; so is the Python worker (services/imagegen, protocol in its PROTOCOL.md).
 * Prompts are content: never log them.
 */

export interface ImageRequest {
  /** mflux model name, e.g. 'z-image-turbo'. */
  model: string;
  quantize?: number;
  prompt: string;
  width: number;
  height: number;
  steps: number;
  seed: number;
  /** A photo to edit (decrypted bytes); the engine deletes its temp copy after the job. */
  sourceImage?: Buffer;
  signal: AbortSignal;
  /** Called after each denoising step. */
  onProgress?: (step: number, steps: number) => void;
  /** Called once if the model has to be loaded first. */
  onLoading?: () => void;
}

export type ImageErrorCode =
  /** The worker couldn't start or crashed. */
  | 'unavailable'
  /** Loading the model failed (missing weights, out of memory). */
  | 'model_load_failed'
  | 'generation_failed'
  | 'aborted'
  /** No result within the time limit. */
  | 'timeout';

export class ImageError extends Error {
  override name = 'ImageError';
  readonly code: ImageErrorCode;
  constructor(code: ImageErrorCode) {
    super(code);
    this.code = code;
  }
}

export interface ImageEngine {
  /** Generates one image; resolves with PNG bytes (the temp file is already deleted). */
  generate(request: ImageRequest): Promise<Buffer>;
  /** Models held in memory by the worker (empty when the worker isn't running). */
  loaded(): Promise<{ model: string; memoryGiB: number }[]>;
  /** Frees the model's memory (the worker exits). */
  unload(model: string): Promise<void>;
  /** Stops the worker for good (server shutdown). */
  shutdown(): Promise<void>;
}
