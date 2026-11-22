export function insertAcademicBlock(range: Range, block: HTMLElement): Range {
  range.deleteContents();
  const element = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const paragraph = element?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6');
  if (paragraph) {
    const doc = paragraph.ownerDocument;
    const tail = doc.createRange(); tail.setStart(range.startContainer, range.startOffset); tail.setEnd(paragraph, paragraph.childNodes.length);
    const after = paragraph.cloneNode(false) as HTMLElement; after.removeAttribute('id'); after.removeAttribute('data-apa-run-in'); after.append(tail.extractContents());
    paragraph.after(block);
    if (!after.hasChildNodes()) after.append(doc.createElement('br'));
    block.after(after);
    if (!paragraph.textContent && !paragraph.querySelector('img,svg,[data-word-note-id]')) paragraph.remove();
  } else range.insertNode(block);
  const doc = block.ownerDocument;
  let after = block.nextElementSibling;
  if (!after) { after = doc.createElement('p'); after.append(doc.createElement('br')); block.after(after); }
  const caret = doc.createRange(); caret.selectNodeContents(after); caret.collapse(true);
  if (after.isConnected) {
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(caret);
  }
  return caret;
}
export function wordCount(text: string): number { return text.trim().split(/\s+/).filter(Boolean).length; }
