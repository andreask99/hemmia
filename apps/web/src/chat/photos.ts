import { UploadResponse } from '@hemmia/shared';

export async function preparePhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (err) {
    throw new Error('photo', { cause: err });
  }

  const { width, height } = bitmap;
  let targetWidth = width;
  let targetHeight = height;

  // Scale so the longest side is at most 2048 px
  if (width > 2048 || height > 2048) {
    const scale = 2048 / Math.max(width, height);
    targetWidth = Math.round(width * scale);
    targetHeight = Math.round(height * scale);
  }

  // Create canvas for drawing
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(targetWidth, targetHeight);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('photo');
  }

  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  return await new Promise((resolve, reject) => {
    // Check if convertToBlob is available (for OffscreenCanvas)
    if ('convertToBlob' in canvas) {
      canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 }).then(resolve).catch(reject);
    } else {
      // For HTMLCanvasElement, use toBlob
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('photo'));
        },
        'image/jpeg',
        0.85,
      );
    }
  });
}

/** File types the attach button offers (photos are re-encoded first; documents go as they are). */
export const ACCEPT =
  'image/*,.pdf,.xlsx,.docx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const isPhotoFile = (file: File) => file.type.startsWith('image/');

export function uploadPhoto(
  blob: Blob,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
  fileName = 'photo.jpg',
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
      });
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(e.loaded / e.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 201) {
        try {
          const response = UploadResponse.parse(JSON.parse(xhr.responseText));
          resolve(response);
        } catch {
          reject(new Error('upload'));
        }
      } else {
        reject(new Error('upload'));
      }
    };

    xhr.onerror = () => {
      reject(new Error('upload'));
    };

    xhr.open('POST', '/api/attachments');
    xhr.withCredentials = true;

    const formData = new FormData();
    formData.append('file', blob, fileName);
    xhr.send(formData);
  });
}
