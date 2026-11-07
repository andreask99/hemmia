/** Small enhancements only (WEBSITE.md §1): copy buttons on commands. Pages work without it. */
export function enhance(doc: Document): void {
  for (const pre of Array.from(doc.querySelectorAll('pre'))) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'copy';
    button.textContent = doc.documentElement.lang === 'de' ? 'Kopieren' : 'Copy';
    button.addEventListener('click', () => {
      void navigator.clipboard.writeText(pre.textContent);
    });
    pre.append(button);
  }
}
