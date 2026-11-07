/** PhoneFiles on @capacitor/filesystem: the app's data directory, under phone/v1/. */
import { Directory, Filesystem } from '@capacitor/filesystem';
import { fromBase64, toBase64 } from './crypto.ts';
import type { PhoneFiles } from './store.ts';

const ROOT = 'phone/v1';
const at = (path: string) => ({ path: `${ROOT}/${path}`, directory: Directory.Data });

const missing = (e: unknown) =>
  e instanceof Error && /not exist|does not exist|no such file/i.test(e.message);

export const capacitorFiles: PhoneFiles = {
  async read(path) {
    try {
      const { data } = await Filesystem.readFile(at(path));
      return typeof data === 'string' ? fromBase64(data) : new Uint8Array(await data.arrayBuffer());
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
  },
  async write(path, data) {
    await Filesystem.writeFile({ ...at(path), data: toBase64(data), recursive: true });
  },
  async rename(from, to) {
    await Filesystem.rename({
      from: `${ROOT}/${from}`,
      to: `${ROOT}/${to}`,
      directory: Directory.Data,
      toDirectory: Directory.Data,
    });
  },
  async remove(path) {
    await Filesystem.deleteFile(at(path)).catch((e: unknown) => {
      if (!missing(e)) throw e;
    });
  },
  async list(dir) {
    try {
      const { files } = await Filesystem.readdir(at(dir));
      return files.filter((f) => f.type === 'file').map((f) => ({ name: f.name, size: f.size }));
    } catch (e) {
      if (missing(e)) return [];
      throw e;
    }
  },
  async removeAll() {
    await Filesystem.rmdir({ path: ROOT, directory: Directory.Data, recursive: true }).catch(
      (e: unknown) => {
        if (!missing(e)) throw e;
      },
    );
  },
};
