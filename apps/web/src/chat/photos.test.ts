import { afterEach, describe, expect, it, vi } from 'vitest';
import { preparePhoto, uploadPhoto } from './photos.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

class FakeXhr {
  static last: FakeXhr | null = null;
  static status = 201;
  method = '';
  url = '';
  withCredentials = false;
  status = 0;
  responseText = '';
  upload: {
    onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
    FakeXhr.last = this;
  }
  send() {
    this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
    this.status = FakeXhr.status;
    this.responseText = JSON.stringify({
      id: 'a1',
      kind: 'upload',
      mime: 'image/jpeg',
      width: 10,
      height: 10,
    });
    this.onload?.();
  }
  abort() {}
}

describe('uploadPhoto', () => {
  it('posts multipart with credentials and reports progress', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    FakeXhr.status = 201;
    const progress: number[] = [];
    const ref = await uploadPhoto(new Blob(['x']), (f) => progress.push(f));
    expect(ref.id).toBe('a1');
    expect(progress).toEqual([0.5]);
    expect([FakeXhr.last?.method, FakeXhr.last?.url, FakeXhr.last?.withCredentials]).toEqual([
      'POST',
      '/api/attachments',
      true,
    ]);
  });

  it('rejects other statuses', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    FakeXhr.status = 400;
    await expect(uploadPhoto(new Blob(['x']), () => undefined)).rejects.toThrow('upload');
  });
});

describe('preparePhoto', () => {
  function stubCanvas() {
    const sizes: [number, number][] = [];
    class FakeCanvas {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        sizes.push([w, h]);
      }
      getContext() {
        return { drawImage: () => undefined };
      }
      convertToBlob(opts: { type: string }) {
        return Promise.resolve(new Blob(['x'], { type: opts.type }));
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    return sizes;
  }

  it('scales the longest side to 2048 and outputs JPEG', async () => {
    const sizes = stubCanvas();
    vi.stubGlobal('createImageBitmap', () =>
      Promise.resolve({ width: 4000, height: 3000, close: () => undefined }),
    );
    const blob = await preparePhoto(new File(['x'], 'a.heic'));
    expect(sizes[0]).toEqual([2048, 1536]);
    expect(blob.type).toBe('image/jpeg');
  });

  it('never upscales', async () => {
    const sizes = stubCanvas();
    vi.stubGlobal('createImageBitmap', () =>
      Promise.resolve({ width: 800, height: 600, close: () => undefined }),
    );
    await preparePhoto(new File(['x'], 'a.jpg'));
    expect(sizes[0]).toEqual([800, 600]);
  });
});
