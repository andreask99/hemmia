/** Per-device memory for the shopping page (which list was open, the share card dismissed). */
import type { ShoppingListName } from '@hemmia/shared';

const LAST_LIST = 'hemmia.shopping.list';
const SHARE_DISMISSED = 'hemmia.shopping.shareDismissed';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}

/** The list the shopping page opens on: the last one shown, else the family's. */
export const lastList = (): ShoppingListName => (read(LAST_LIST) === 'mine' ? 'mine' : 'family');
export const rememberList = (list: ShoppingListName): void => {
  write(LAST_LIST, list);
};
export const shareDismissed = (): boolean => read(SHARE_DISMISSED) === '1';
export const dismissShare = (): void => {
  write(SHARE_DISMISSED, '1');
};
