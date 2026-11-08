/**
 * Where an attachment (photo, picture, document) is loaded from. On a hub that is always
 * `/api/attachments/<id>`; the demo (apps/web/src/demo) serves its pictures from the bundle
 * and keeps uploads in memory, so it sets a resolver.
 */
let resolver: ((id: string) => string | null) | null = null;

export function setAttachmentUrlResolver(fn: (id: string) => string | null): void {
  resolver = fn;
}

export function attachmentUrl(id: string): string {
  return resolver?.(id) ?? `/api/attachments/${encodeURIComponent(id)}`;
}
