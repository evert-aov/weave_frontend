import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PureDocEditorComponent } from './pure-doc-editor.component';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { WordCompatibilityService } from './services/word-compatibility.service';
import { LatexRendererService } from './services/latex-renderer.service';
import { ImageStoreService } from './services/image-store.service';
import { DocumentPage } from './models/word-document.model';
import { BUILTIN_STYLE_TEMPLATES } from './constants/word-document.constants';
import { findDocumentText, selectedParagraphs } from './utils/document-formatting';
import { Note } from '../../core/models/note.model';

interface Internals {
  pageBodyMap: Map<string, HTMLElement>;
  syncInnerHtml(): void;
  collectDocData(): any;
  hydrateFromNote(): Promise<void>;
  documentReady: { set(value: boolean): void };
}

describe('Word Home and document-wide styles', () => {
  let editor: PureDocEditorComponent;
  let dom: Internals;
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    TestBed.configureTestingModule({ providers: [
      { provide: NotesService, useValue: { updateDocData: vi.fn() } },
      { provide: I18nService, useValue: {} },
      { provide: WordCompatibilityService, useValue: {} },
      { provide: LatexRendererService, useValue: {} },
      { provide: ImageStoreService, useValue: { resolveImages: async (html: string) => html, externalizeImages: async (html: string) => html } },
    ] });
    editor = TestBed.runInInjectionContext(() => new PureDocEditorComponent());
    dom = editor as unknown as Internals;
  });
  afterEach(() => {
    editor.ngOnDestroy(); document.body.replaceChildren();
    window.getSelection()?.removeAllRanges(); vi.unstubAllGlobals();
  });
  function render(pages: DocumentPage[]): void {
    editor.pages.set(pages);
    for (const page of pages) {
      const body = document.createElement('div'); body.contentEditable = 'true'; body.tabIndex = 0;
      body.dataset['pageBodyId'] = page.id; body.innerHTML = page.html;
      body.style.cssText = 'font-family: Times New Roman; font-size: 12pt; line-height: 1.15';
      document.body.appendChild(body); dom.pageBodyMap.set(page.id, body);
    }
    dom.documentReady.set(true);
  }
  function node(selector: string): HTMLElement { return document.querySelector<HTMLElement>(selector)!; }
  function select(element: HTMLElement, start?: number, end?: number): Range {
    element.closest<HTMLElement>('[data-page-body-id]')!.focus();
    const range = document.createRange();
    if (start !== undefined) { range.setStart(element.firstChild!,start); range.setEnd(element.firstChild!, end ?? start); }
    else range.selectNodeContents(element);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    return range;
  }
  function command(command: string, value?: string): void { editor.onRibbonCommand({ command, value }); }
  function activeRule() { return editor.styleTemplates().find(t => t.id === editor.activeTemplateId())!.rules.H1; }

  it('updates every H1 from formatted selected text, removes nested overrides, and keeps other levels and references', () => {
    render([
      { id:'a', html:'<h1 id="first" style="font-family:Times New Roman;font-size:12pt;font-weight:700"><font face="Times New Roman" size="3"><b>First</b></font></h1><p id="source"><span style="font-family:Arial Black;font-size:20pt;font-weight:900;color:rgb(180, 20, 40)">New appearance</span></p>' },
      { id:'b', breakBefore:'manual', html:'<h1 id="second"><span style="font-size:12pt;font-family:Times New Roman"><a href="/?document=other"><i>Second</i></a></span></h1><h2 id="untouched">Another level</h2>' },
    ]);
    const originalRule = JSON.stringify(BUILTIN_STYLE_TEMPLATES[1].rules.H1);
    select(node('#source span')); editor.handleUpdateStyleFromSelection('H1');
    expect(activeRule().fontFamily).toBe('Arial Black'); expect(activeRule().fontSizePt).toBe(20);
    expect(activeRule().bold).toBe(true);
    for (const heading of [node('#first'),node('#second')]) {
      expect(heading.style.fontFamily).toContain('Arial Black'); expect(heading.style.fontSize).toBe('20pt');
      expect(heading.style.fontWeight).toBe('700');
      expect(heading.querySelector('font[size]')).toBeNull();
      for (const run of heading.querySelectorAll<HTMLElement>('span,b,i,font,a')) expect(run.style.fontSize).toBe('inherit');
    }
    expect(node('#second a').getAttribute('href')).toBe('/?document=other');
    expect(node('#untouched').getAttribute('style')).toBeNull();
    expect(window.getSelection()!.toString()).toBe('New appearance');
    expect(editor.pages()[1].breakBefore).toBe('manual');
    expect(dom.collectDocData().customTemplates).toHaveLength(1);
    expect(JSON.stringify(BUILTIN_STYLE_TEMPLATES[1].rules.H1)).toBe(originalRule);
    expect(JSON.stringify(dom.collectDocData())).not.toContain('weave-selection');
  });

  it('undoes and redoes both style definitions and all page contents, including changes with no existing H1', () => {
    render([{ id:'a', html:'<p id="source" style="font-family:Arial;font-size:19pt">Sample</p>' }]);
    select(node('#source')); editor.handleUpdateStyleFromSelection('H1');
    const id = editor.activeTemplateId(); expect(activeRule().fontSizePt).toBe(19);
    editor.handleGlobalUndo(); dom.syncInnerHtml();
    expect(editor.activeTemplateId()).toBe('corporate-modern'); expect(dom.collectDocData().customTemplates).toHaveLength(0);
    editor.handleGlobalRedo(); dom.syncInnerHtml();
    expect(editor.activeTemplateId()).toBe(id); expect(activeRule().fontSizePt).toBe(19);
    select(node('#source')); editor.handleApplyHeading('H1');
    expect(document.querySelector('h1')!.style.fontSize).toBe('19pt');
    expect(document.querySelector('h1')!.textContent).toBe('Sample');
  });

  it('applies a style to every selected paragraph across pages and excludes the paragraph at an end boundary', () => {
    render([{ id:'a',html:'<p id="one">One</p><p id="two">Two</p>' },{ id:'b',html:'<p id="three">Three</p><p id="four">Four</p>' }]);
    const range = select(node('#one'));
    range.setEnd(node('#four').firstChild!,0);
    expect(selectedParagraphs([node('[data-page-body-id="a"]'),node('[data-page-body-id="b"]')],range).map(el => el.id)).toEqual(['one','two','three']);
    editor.handleApplyHeading('H2');
    expect(document.querySelectorAll('h2')).toHaveLength(3); expect(node('#four').tagName).toBe('P');
    expect(window.getSelection()!.toString()).toContain('Three');
  });

  it('reuses the document template when updating again and persists it after hydration', async () => {
    render([{ id:'a',html:'<p id="source" style="font-family:Arial;font-size:18pt">Sample</p><h1 id="heading">Title</h1>' }]);
    select(node('#source')); editor.handleUpdateStyleFromSelection('H1');
    node('#source').style.fontSize = '24pt'; select(node('#source')); editor.handleUpdateStyleFromSelection('H1');
    expect(editor.styleTemplates().filter(template => template.isCustom)).toHaveLength(1);
    const docData = dom.collectDocData();
    editor.note = { _id:'saved',title:'Saved',docType:'doc',docData } as Note;
    await dom.hydrateFromNote();
    expect(activeRule().fontSizePt).toBe(24);
    expect(node('#heading').style.fontSize).toBe('24pt');
  });

  it('changes an exact point size only in selected characters and preserves unrelated legacy font sizes', () => {
    render([{ id:'a',html:'<p id="source">abcdef</p><p><font id="untouched" size="7">Other text</font></p>' }]);
    select(node('#source'),1,4); command('fontSizePt','17.5');
    expect(node('#source span').textContent).toBe('bcd'); expect(node('#source span').style.fontSize).toBe('17.5pt');
    expect(node('#source').textContent).toBe('abcdef'); expect(node('#untouched').getAttribute('size')).toBe('7');
    expect(window.getSelection()!.toString()).toBe('bcd');
    editor.handleGlobalUndo(); dom.syncInnerHtml(); expect(node('#source').innerHTML).toBe('abcdef');
  });

  it('restores the saved range after a ribbon input receives focus', () => {
    render([{ id:'a',html:'<p id="source">abcdef</p>' }]); select(node('#source'),2,5); editor.rememberRibbonSelection();
    const input = document.createElement('input'); document.body.appendChild(input); input.focus(); window.getSelection()!.removeAllRanges();
    command('fontName','Arial Black');
    expect(node('#source span').textContent).toBe('cde'); expect(node('#source span').style.fontFamily.replace(/["']/g,'')).toBe('Arial Black');
  });

  it('uses a chosen exact size for the next typed character without inserting placeholder content', () => {
    render([{ id:'a',html:'<p id="source">ABC</p>' }]); select(node('#source'),3);
    command('fontSizePt','17.5');
    expect(node('#source').innerHTML).toBe('ABC');
    const input = new InputEvent('beforeinput',{ inputType:'insertText',data:'z',cancelable:true });
    editor.onPageBeforeInput(input,0);
    expect(input.defaultPrevented).toBe(true); expect(node('#source').textContent).toBe('ABCz');
    expect(node('#source span').style.fontSize).toBe('17.5pt');
    expect(editor.pages()[0].html).not.toContain('\u200b');
    expect(window.getSelection()!.anchorOffset).toBe(1);
  });

  it.each([['justifyCenter','', 'textAlign','center'],['lineHeight','2','lineHeight','2'],['spaceBefore','12','marginTop','12pt'],['spaceAfter','0','marginBottom','0pt'],['paragraphShading','#bbf7d0','backgroundColor','rgb(187, 247, 208)'],['paragraphBorder','bottom','borderBottomWidth','1px'],['indent','','marginLeft','36pt']])('applies %s to every selected paragraph across pages', (name,value,property,expected) => {
    render([{id:'a',html:'<p id="one">One</p>'},{id:'b',html:'<p id="two">Two</p>'}]);
    const range = select(node('#one')); range.setEnd(node('#two').firstChild!,3);
    command(name,value);
    expect(node('#one').style.getPropertyValue(property.replace(/[A-Z]/g,letter => '-'+letter.toLowerCase()))).toBe(expected);
    expect(node('#two').style.getPropertyValue(property.replace(/[A-Z]/g,letter => '-'+letter.toLowerCase()))).toBe(expected);
    expect(editor.pages().every(page => !page.html.includes('weave-selection'))).toBe(true);
  });

  it('changes case across formatted runs without replacing links or interpreting HTML', () => {
    render([{id:'a',html:'<p id="source"><strong>hoLA </strong><a href="/?document=other">mUNdo</a> &lt;texto&gt;</p>'}]);
    select(node('#source')); command('changeCase','lower');
    expect(node('#source').textContent).toBe('hola mundo <texto>');
    expect(node('#source strong')).toBeTruthy(); expect(node('#source a').getAttribute('href')).toBe('/?document=other');
    expect(node('#source').querySelector('texto')).toBeNull();
    editor.handleGlobalUndo(); dom.syncInnerHtml(); expect(node('#source').textContent).toBe('hoLA mUNdo <texto>');
  });

  it('sorts selected sibling paragraphs naturally and preserves their markup and IDs', () => {
    render([{id:'a',html:'<p id="ten">Item 10</p><p id="two"><b>Item 2</b></p><p id="one">Item 1</p>'}]);
    select(node('[data-page-body-id]')); command('sortParagraphs','asc');
    expect(Array.from(node('[data-page-body-id]').children).map(element => element.id)).toEqual(['one','two','ten']);
    expect(node('#two b').textContent).toBe('Item 2');
    editor.handleGlobalUndo(); dom.syncInnerHtml(); expect(node('[data-page-body-id]').firstElementChild!.id).toBe('ten');
  });

  it('searches across inline formatting, supports case and whole words, and never crosses paragraph boundaries', () => {
    render([{id:'a',html:'<p>ca<strong>sa</strong> CASA casamiento</p><p>ca</p><p>sa</p>'}]);
    const bodies = [node('[data-page-body-id]')];
    expect(findDocumentText(bodies,'casa').map(match => match.range.toString())).toEqual(['casa','CASA','casa']);
    expect(findDocumentText(bodies,'casa',true,true)).toHaveLength(1);
    expect(findDocumentText(bodies,'casa',false,true)).toHaveLength(2);
  });

  it('finds and replaces across all pages with literal text and undoes the operation in one step', () => {
    render([{id:'a',html:'<p id="source">Find <b>this</b> text</p>'},{id:'b',html:'<p id="second">this text again</p>'}]);
    editor.searchQuery.set('this text'); editor.replacementText.set('<safe>');
    editor.findNextMatch(); expect(window.getSelection()!.toString()).toBe('this text');
    expect(editor.searchStatus()).toBe('1 de 2 coincidencias');
    editor.findNextMatch(); expect(editor.activePageIndex()).toBe(1);
    editor.replaceDocumentMatches(true);
    expect(node('#source').textContent).toBe('Find <safe>'); expect(node('#second').textContent).toBe('<safe> again');
    expect(document.querySelector('safe')).toBeNull(); expect(editor.searchStatus()).toBe('2 reemplazos realizados');
    editor.handleGlobalUndo(); dom.syncInnerHtml(); expect(node('#source').textContent).toBe('Find this text'); expect(node('#second').textContent).toBe('this text again');
    editor.handleGlobalRedo(); dom.syncInnerHtml(); expect(node('#second').textContent).toBe('<safe> again');
  });

  it('locates before replacing a single result and permits an empty replacement', () => {
    render([{id:'a',html:'<p id="source">one two one</p>'}]); select(node('#source'),0);
    editor.searchQuery.set('one'); editor.replacementText.set('');
    editor.replaceDocumentMatches(); expect(node('#source').textContent).toBe('one two one');
    editor.replaceDocumentMatches(); expect(node('#source').textContent).toBe(' two one');
  });

  it('selects all pages, selects a paragraph and toggles marks without storing presentation state', () => {
    render([{id:'a',html:'<p id="one">One</p>'},{id:'b',html:'<p id="two">Two</p>'}]); select(node('#one'),1);
    command('selectAllDocument'); expect(window.getSelection()!.toString()).toContain('Two');
    select(node('#one'),1); command('selectCurrentParagraph'); expect(window.getSelection()!.toString()).toBe('One');
    command('toggleMarks'); expect(editor.showFormattingMarks()).toBe(true);
    expect(JSON.stringify(dom.collectDocData())).not.toContain('showFormattingMarks');
  });

  it('copies font family, exact size and emphasis with the format painter in one undoable operation', () => {
    render([{id:'a',html:'<p id="source" style="font-family:Arial Black;font-size:18pt;font-weight:900;font-style:italic;color:#a02040">Source</p><p id="target">Target</p>'}]);
    select(node('#source')); editor.handleCopyFormat(); expect(editor.formatPainterActive()).toBe(true);
    select(node('#target')); const event = new MouseEvent('mouseup');
    Object.defineProperty(event,'target',{value:node('#target')}); editor.handleEditorMouseUp(event);
    const run = node('#target span'); expect(run.style.fontFamily).toContain('Arial Black');
    expect(run.style.fontSize).toBe('18pt'); expect(run.style.fontWeight).toBe('700'); expect(run.style.fontStyle).toBe('italic');
    expect(editor.formatPainterActive()).toBe(false);
    editor.handleGlobalUndo(); dom.syncInnerHtml(); expect(node('#target').innerHTML).toBe('Target');
  });

  it('keeps increasing the pending typing size on repeated clicks', () => {
    render([{id:'a',html:'<p id="source" style="font-size:12pt">Text</p>'}]); select(node('#source'),4);
    command('growFont'); command('growFont'); expect(editor.formats().fontSize).toBe('16');
    command('shrinkFont'); expect(editor.formats().fontSize).toBe('14');
    editor.onPageBeforeInput(new InputEvent('beforeinput',{inputType:'insertText',data:'x',cancelable:true}),0);
    expect(node('#source span').style.fontSize).toBe('14pt');
  });

  it('clears only selected characters and retains the surrounding formatting', () => {
    render([{id:'a',html:'<p id="source" style="font-family:Arial Black;font-size:18pt;font-weight:900">abcdef</p>'}]);
    select(node('#source'),2,4); command('removeFormat');
    expect(node('#source').style.fontSize).toBe('18pt'); expect(node('#source span').textContent).toBe('cd');
    expect(node('#source span').style.fontSize).toBe('11pt'); expect(node('#source').textContent).toBe('abcdef');
  });

  it('searches regex punctuation literally and starts backwards navigation on the final match', () => {
    render([{id:'a',html:'<p>[a].* plus [a].*</p>'}]);
    editor.searchQuery.set('[a].*'); editor.findNextMatch(true);
    expect(editor.searchStatus()).toBe('2 de 2 coincidencias'); expect(window.getSelection()!.toString()).toBe('[a].*');
  });

  it('does not capture the temporary white display color of the dark sheet', () => {
    render([{id:'a',html:'<p id="source">Sample</p><h1>Title</h1>'}]);
    const sheet = document.createElement('div'); sheet.className = 'word-dark-sheet';
    node('[data-page-body-id]').before(sheet); sheet.appendChild(node('[data-page-body-id]'));
    node('#source').style.color = '#a02040'; select(node('#source')); editor.handleUpdateStyleFromSelection('H1');
    expect(activeRule().color).toBe('rgb(160, 32, 64)');
  });

  it.each(['subscript','superscript'])('applies %s to selected characters, switches modes, toggles off and preserves neighbors', (kind) => {
    render([{id:'a',html:'<p id="source" style="font-size:12pt">H2O</p>'}]); select(node('#source'),1,2);
    command(kind);
    expect(node('#source').textContent).toBe('H2O'); expect(window.getSelection()!.toString()).toBe('2');
    expect(editor.formats()[kind as 'subscript' | 'superscript']).toBe(true);
    expect(editor.formats().fontSize).toBe('9');
    command(kind); expect(editor.formats()[kind as 'subscript' | 'superscript']).toBe(false);
    expect(editor.formats().fontSize).toBe('12'); expect(node('#source').textContent).toBe('H2O');
    editor.handleGlobalUndo(); dom.syncInnerHtml(); expect(editor.formats()[kind as 'subscript' | 'superscript']).toBe(false);
    editor.updateSelectionFormats(); expect(editor.formats()[kind as 'subscript' | 'superscript']).toBe(true);
  });

  it('types an exponent after toggling at a caret and can return to the baseline', () => {
    render([{id:'a',html:'<p id="source" style="font-size:12pt">x</p>'}]); select(node('#source'),1);
    command('superscript');
    editor.onPageBeforeInput(new InputEvent('beforeinput',{inputType:'insertText',data:'2',cancelable:true}),0);
    expect(node('#source').textContent).toBe('x2'); expect(editor.formats().superscript).toBe(true);
    command('superscript');
    editor.onPageBeforeInput(new InputEvent('beforeinput',{inputType:'insertText',data:'z',cancelable:true}),0);
    expect(node('#source').textContent).toBe('x2z'); expect(editor.formats().superscript).toBe(false);
    expect(editor.formats().fontSize).toBe('12');
  });

  it('continues heading numbering across pages, resets child levels, and restores it through undo and hydration', async () => {
    render([{id:'a',html:'<h1>Chapter</h1><h2>Section</h2><h3>Topic</h3>'},{id:'b',html:'<h2>Next section</h2><h1>Next chapter</h1><h2>Last section</h2>'}]);
    command('headingNumbering','on');
    const prefixes = () => Array.from(document.querySelectorAll('[data-word-heading-number]')).map(element=>element.textContent);
    expect(prefixes()).toEqual(['1. ','1.1 ','1.1.1 ','1.2 ','2. ','2.1 ']);
    expect(dom.collectDocData().headingNumbering).toBe(true);
    editor.handleGlobalUndo(); dom.syncInnerHtml(); expect(prefixes()).toEqual([]); expect(editor.headingNumbering()).toBe(false);
    editor.handleGlobalRedo(); dom.syncInnerHtml(); expect(prefixes()).toEqual(['1. ','1.1 ','1.1.1 ','1.2 ','2. ','2.1 ']);
    const data = dom.collectDocData(); editor.note = {_id:'saved',title:'Saved',docType:'doc',docData:data} as Note;
    await dom.hydrateFromNote(); expect(editor.headingNumbering()).toBe(true); expect(prefixes()).toHaveLength(6);
    command('headingNumbering','off'); expect(prefixes()).toEqual([]); expect(document.querySelectorAll('h1,h2,h3')).toHaveLength(6);
  });

  it('renumbers after inserting and deleting a heading without numbering its continuation twice', () => {
    render([{id:'a',html:'<h1>First</h1><h2 id="remove">Section</h2>'},{id:'b',html:'<h2 id="last">Last</h2><h2 data-word-continuation="same">continued text</h2>'}]);
    command('headingNumbering','on'); node('#remove').remove();
    editor.onPageInput(new InputEvent('input'),0);
    expect(node('#last [data-word-heading-number]').textContent).toBe('1.1 ');
    expect(node('h2[data-word-continuation]').querySelector('[data-word-heading-number]')).toBeNull();
    const first = node('h1'); const text = first.textContent;
    command('headingNumbering','on'); expect(first.textContent).toBe(text);
    expect(editor.headings().some(heading=>heading.text.includes('continued text'))).toBe(false);
  });

  it('drops a pending typing font when the caret moves to another text run', () => {
    render([{id:'a',html:'<p id="source" style="font-size:12pt">One</p><p id="other" style="font-family:Georgia;font-size:16pt">Other</p>'}]);
    select(node('#source'),3); command('fontName','Arial Black'); command('fontSizePt','18');
    expect(editor.formats().fontName).toBe('Arial Black');
    select(node('#other'),1); editor.updateSelectionFormats();
    expect(editor.formats().fontName).toBe('Georgia'); expect(editor.formats().fontSize).toBe('16');
  });

  it('preserves imported manual chapter numbers and normalizes a wrapped automatic prefix', () => {
    render([{id:'a',html:'<h1>5. Existing chapter</h1><h2 id="section">Section</h2><h1>Next</h1>'}]);
    command('headingNumbering','on');
    expect(node('#section [data-word-heading-number]').textContent).toBe('5.1 ');
    const heading = node('#section'); const prefix = heading.querySelector('[data-word-heading-number]')!;
    const wrapper = document.createElement('b'); prefix.replaceWith(wrapper); wrapper.appendChild(prefix);
    editor.onPageInput(new InputEvent('input'),0);
    expect(heading.querySelectorAll('[data-word-heading-number]')).toHaveLength(1);
    expect(heading.firstElementChild!.textContent).toBe('5.1 ');
    expect(Array.from(document.querySelectorAll('h1')).map(element=>element.textContent)).toEqual(['5. Existing chapter','6. Next']);
  });

  it('keeps a script active after changing the size of a nested run and toggles a legacy script off', () => {
    render([{id:'a',html:'<p id="source" style="font-size:12pt">H<span id="script" data-word-script="sub" data-word-base-size="12" style="vertical-align:sub;font-size:9pt"><b id="letter">2</b></span>O</p>'}]);
    select(node('#letter')); editor.updateSelectionFormats(); expect(editor.formats().subscript).toBe(true);
    command('fontSizePt','10'); expect(editor.formats().subscript).toBe(true);
    command('subscript'); expect(editor.formats().subscript).toBe(false);
    expect(editor.formats().fontSize).toBe('12'); expect(node('#source').textContent).toBe('H2O');
  });

  it('does not apply styles or formatting before hydration or in reading mode', () => {
    render([{id:'a',html:'<p id="source">Sample</p><h1>Title</h1>'}]); select(node('#source'));
    const original = editor.pages(); dom.documentReady.set(false);
    editor.handleUpdateStyleFromSelection('H1'); command('fontSizePt','20');
    expect(editor.pages()).toBe(original); expect(dom.collectDocData().customTemplates).toHaveLength(0);
    dom.documentReady.set(true); editor.viewMode.set('read'); editor.handleUpdateStyleFromSelection('H1'); command('paragraphBorder','all');
    expect(editor.pages()).toBe(original);
  });
});
