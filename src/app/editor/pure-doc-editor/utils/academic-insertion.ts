export function insertAcademicBlock(range: Range, block: HTMLElement): void {
  range.deleteContents();
  const element = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const paragraph = element?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6');
  if (paragraph) {
    const tail = document.createRange(); tail.setStart(range.startContainer, range.startOffset); tail.setEnd(paragraph, paragraph.childNodes.length);
    const after = paragraph.cloneNode(false) as HTMLElement; after.removeAttribute('id'); after.removeAttribute('data-apa-run-in'); after.append(tail.extractContents());
    paragraph.after(block);
    if (!after.hasChildNodes()) after.append(document.createElement('br'));
    block.after(after);
    if (!paragraph.textContent && !paragraph.querySelector('img,svg,[data-word-note-id]')) paragraph.remove();
  } else range.insertNode(block);
  let after = block.nextElementSibling;
  if (!after) { after = document.createElement('p'); after.append(document.createElement('br')); block.after(after); }
  const caret = document.createRange(); caret.selectNodeContents(after); caret.collapse(true);
  window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(caret);
}
export function wordCount(text: string): number { return text.trim().split(/\s+/).filter(Boolean).length; }
