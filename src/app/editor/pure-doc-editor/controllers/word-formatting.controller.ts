import { materializeWordLineSpacing } from '../utils/word-line-spacing';
import { renumberAcademicNotes } from '../utils/academic-notes';
import { styleApaSections } from '../utils/apa-sections';
import { normalizeApaHeadings, runInHeading, clearRunInHeading } from '../utils/apa-headings';
import { apaDocumentLayout } from '../utils/apa-layout';
import { applyApaObjects } from '../utils/apa-objects';
import { applyTemplateLists } from '../utils/list-formatting';
import { selectedListItems, removeListItems, addListItems } from '../utils/list-editing';
import {
  markDocumentSelection,
  restoreDocumentSelection,
  withoutSelectionMarkers,
} from '../utils/document-selection';
import { ElementStyleRule, StyleTargetTag, StyleTemplate } from '../models/word-document.model';
import { BUILTIN_STYLE_TEMPLATES } from '../constants/word-document.constants';
import { renumberHeadings } from '../utils/heading-numbering';
import {
  applyStyleRule,
  selectedParagraphs,
  selectionStyle,
  selectionElement,
  scriptPosition,
  replaceParagraphTag,
} from '../utils/document-formatting';
import {
  applyHomeCommand,
  applyInlineProperties,
  currentParagraph,
  inlineProperties,
  applyScript,
  scriptBaseSize,
} from '../utils/home-editing';

import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';

type WordFormattingControllerHost = Pick<PureDocEditorComponent,
  | 'activePageIndex'
  | 'activeTableCell'
  | 'activeTemplateId'
  | 'checkAndPaginateOverflow'
  | 'commitPageDomToState'
  | 'copiedInlineStyle'
  | 'documentReady'
  | 'formatPainterActive'
  | 'formats'
  | 'getFooterEl'
  | 'getHeaderEl'
  | 'getPageBody'
  | 'handleGlobalRedo'
  | 'handleGlobalUndo'
  | 'headingNumbering'
  | 'isReadMode'
  | 'layoutConfig'
  | 'openDocumentSearch'
  | 'pages'
  | 'pushUndoSnapshot'
  | 'showFormattingMarks'
  | 'styleTemplates'>;
type WordFormattingControllerHooks = Pick<WordEditorHooks,
  | 'collectDocData'
  | 'getActivePageElement'
  | 'getLivePagesSnapshot'
  | 'liveBodies'
  | 'pendingRenderPages'
  | 'scheduleAutoSave'
  | 'scheduleDocumentFlow'
  | 'refreshApaToc'
  | 'showToast'>;

/** Formatting behavior owned by one editor instance. */
export class WordFormattingController {
  constructor(private readonly editor: WordFormattingControllerHost, private readonly hooks: WordFormattingControllerHooks) {}

  pendingTypingStyle: Record<string, string> | null = null;

  private pendingTypingRange: Range | null = null;

  savedRange: Range | null = null;

  updateSelectionFormats(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const anchorNode = sel.anchorNode;
    if (!anchorNode) return;

    const currentPages = this.editor.pages();
    let matchedPageIdx = -1;
    let containerEl: HTMLDivElement | null = null;

    for (let idx = 0; idx < currentPages.length; idx++) {
      const p = currentPages[idx];
      if (!p) continue;
      const bodyEl = this.editor.getPageBody(p.id);
      const headEl = this.editor.getHeaderEl(p.id);
      const footEl = this.editor.getFooterEl(p.id);
      if (bodyEl && bodyEl.contains(anchorNode)) {
        matchedPageIdx = idx;
        containerEl = bodyEl;
        break;
      } else if (headEl && headEl.contains(anchorNode)) {
        matchedPageIdx = idx;
        containerEl = headEl;
        break;
      } else if (footEl && footEl.contains(anchorNode)) {
        matchedPageIdx = idx;
        containerEl = footEl;
        break;
      }
    }

    if (matchedPageIdx === -1 || !containerEl) return;
    if (matchedPageIdx !== this.editor.activePageIndex()) {
      this.editor.activePageIndex.set(matchedPageIdx);
    }

    let headingTag = 'P';
    let foundCell: HTMLTableCellElement | null = null;
    const liveRange = sel.getRangeAt(0);
    if (this.pendingTypingStyle && this.pendingTypingRange
      && (!liveRange.collapsed || liveRange.compareBoundaryPoints(Range.START_TO_START,this.pendingTypingRange) !== 0)) {
      this.pendingTypingStyle = null; this.pendingTypingRange = null;
    }
    const sample = selectionElement(liveRange);
    let current: Node | null = sample;
    while (current && current !== containerEl) {
      if (current instanceof HTMLElement) {
        if (/^H[1-6]$/.test(current.tagName)) headingTag = current.tagName;
        if (current.dataset['apaHeadingLevel']) headingTag = `H${current.dataset['apaHeadingLevel']}`;
        if (current.tagName === 'TD' || current.tagName === 'TH') foundCell = current as HTMLTableCellElement;
      }
      current = current.parentNode;
    }

    this.editor.activeTableCell.set(foundCell);

    const range = sel.getRangeAt(0);
    const template = this.editor.styleTemplates().find(item => item.id === this.editor.activeTemplateId()) || this.editor.styleTemplates()[0];
    const rule = selectionStyle(range, template.rules[headingTag as StyleTargetTag]);
    const position = this.pendingTypingStyle?.['verticalAlign'] || scriptPosition(sample);
    this.editor.formats.set({
      bold: rule.bold, italic: rule.italic, underline: rule.underline,
      strikeThrough: rule.strikeThrough ?? false, subscript: position === 'sub', superscript: position === 'super',
      justifyLeft: rule.align === 'left', justifyCenter: rule.align === 'center',
      justifyRight: rule.align === 'right', justifyFull: rule.align === 'justify',
      insertUnorderedList: !!(anchorNode instanceof Element ? anchorNode : anchorNode.parentElement)?.closest('ul'),
      insertOrderedList: !!(anchorNode instanceof Element ? anchorNode : anchorNode.parentElement)?.closest('ol'),
      heading: headingTag, fontName: this.pendingTypingStyle?.['fontFamily']?.replace(/["']/g, '').split(',')[0].trim() || rule.fontFamily,
      fontSize: this.pendingTypingStyle?.['fontSize'] ? String(parseFloat(this.pendingTypingStyle['fontSize'])) : String(rule.fontSizePt),
      indentLeftCm: Number(((rule.indentLeftPt ?? 0) / 72 * 2.54).toFixed(2)),
      indentRightCm: Number(((rule.indentRightPt ?? 0) / 72 * 2.54).toFixed(2)),
      spaceBeforePt: rule.spaceBeforePt, spaceAfterPt: rule.spaceAfterPt, lineHeight: String(rule.lineHeight),
    });
  }

  handleInsertTabCharacter(): void {
    const activeEl = this.hooks.getActivePageElement();
    activeEl?.focus();
    document.execCommand(
      'insertHTML',
      false,
      '<span class="docx-tab" style="display:inline-block; width: 36pt; white-space: pre;">&#9;</span>'
    );
    this.editor.commitPageDomToState(this.editor.activePageIndex());
  }

  executeCommand(command: string, value?: string): void {
    if (command === 'undo') {
      this.editor.handleGlobalUndo();
      return;
    }
    if (command === 'redo') {
      this.editor.handleGlobalRedo();
      return;
    }
    if (command === 'insertOrderedList' || command === 'insertUnorderedList') {
      const range = this.prepareRibbonSelection();
      if (!range) return;
      const items = selectedListItems(this.hooks.liveBodies(), range, command === 'insertOrderedList' ? 'OL' : 'UL');
      if (items) {
        this.editor.pushUndoSnapshot();
        markDocumentSelection(this.hooks.liveBodies());
        const template = this.editor.styleTemplates().find(item => item.id === this.editor.activeTemplateId()) || this.editor.styleTemplates()[0];
        removeListItems(items, template.rules.P);
        this.finishDocumentMutation();
        return;
      }
      this.editor.pushUndoSnapshot();
      markDocumentSelection(this.hooks.liveBodies());
      if (addListItems(this.hooks.liveBodies(), window.getSelection()!.getRangeAt(0), command === 'insertOrderedList' ? 'OL' : 'UL')) {
        this.applyActiveListRules(); this.finishDocumentMutation(); return;
      }
    }
    const preSnapshot = this.editor.pages().map((p) => ({
      ...p,
      html: this.editor.getPageBody(p.id)?.innerHTML ?? p.html,
    }));
    const activeEl = this.hooks.getActivePageElement();
    this.editor.pushUndoSnapshot();
    activeEl?.focus();
    document.execCommand(command, false, value);
    if (['insertOrderedList', 'insertUnorderedList'].includes(command)) this.applyActiveListRules();
    this.editor.commitPageDomToState(this.editor.activePageIndex());
    this.editor.checkAndPaginateOverflow(this.editor.activePageIndex(), preSnapshot);
    this.updateSelectionFormats();
  }

  rememberRibbonSelection(): void {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (this.hooks.liveBodies().some(body => body.contains(range.startContainer))
      && this.hooks.liveBodies().some(body => body.contains(range.endContainer))) this.savedRange = range.cloneRange();
  }

  prepareRibbonSelection(): Range | null {
    if (!this.editor.documentReady() || this.editor.isReadMode() || this.hooks.pendingRenderPages) return null;
    const bodies = this.hooks.liveBodies();
    const selection = window.getSelection();
    const current = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const owned = (range: Range | null): range is Range => !!range && bodies.some(body => body.contains(range.startContainer))
      && bodies.some(body => body.contains(range.endContainer));
    const range = owned(current) ? current.cloneRange() : owned(this.savedRange) ? this.savedRange.cloneRange() : null;
    if (!range || !selection) return null;
    const index = bodies.findIndex(body => body.contains(range.startContainer));
    this.editor.activePageIndex.set(index);
    bodies[index].focus();
    selection.removeAllRanges(); selection.addRange(range);
    this.savedRange = null;
    return range;
  }

  private setPendingTypingStyle(properties: Record<string,string>): void {
    this.pendingTypingStyle = { ...this.pendingTypingStyle, ...properties };
    const selection = window.getSelection();
    this.pendingTypingRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  }

  finishDocumentMutation(): void {
    renumberAcademicNotes(this.hooks.liveBodies());
    const active = this.editor.styleTemplates().find(t => t.id === this.editor.activeTemplateId());
    if (active?.academicStyle === 'apa7') { normalizeApaHeadings(this.hooks.liveBodies(), active); styleApaSections(this.hooks.liveBodies(), active); }
    this.hooks.liveBodies().forEach(body=>materializeWordLineSpacing(body));
    restoreDocumentSelection(this.hooks.liveBodies());
    renumberHeadings(this.hooks.liveBodies(), this.editor.headingNumbering());
    this.editor.pages.set(this.hooks.getLivePagesSnapshot().map(page => ({ ...page, html: withoutSelectionMarkers(page.html) })));
    this.hooks.scheduleAutoSave(this.hooks.collectDocData());
    this.hooks.scheduleDocumentFlow();
    this.updateSelectionFormats();
  }

  handleApplyRuleToSelection(rule: ElementStyleRule): void {
    const range = this.prepareRibbonSelection();
    if (!range) return;
    const blocks = selectedParagraphs(this.hooks.liveBodies(), range);
    this.pendingTypingStyle = null;
    this.editor.pushUndoSnapshot();
    if (!blocks.length) {
      document.execCommand('formatBlock', false, `<${rule.target}>`);
      const block = currentParagraph(window.getSelection()!.getRangeAt(0));
      if (block) blocks.push(block);
    }
    markDocumentSelection(this.hooks.liveBodies());
    const template = this.editor.styleTemplates().find(t => t.id === this.editor.activeTemplateId());
    blocks.forEach(block => {
      if (template?.academicStyle === 'apa7' && ['H4', 'H5', 'H6'].includes(rule.target)) {
        let target = block;
        if (block.tagName === 'LI') { target = document.createElement('p'); while (block.firstChild) target.append(block.firstChild); block.append(target); }
        runInHeading(target, rule.target === 'H4' ? 4 : 5, template); return;
      }
      if (block.hasAttribute('data-apa-run-in')) clearRunInHeading(block);
      // A list item remains inside its list; place the paragraph style inside it.
      if (block.tagName === 'LI') {
        const child = document.createElement(rule.target.toLowerCase());
        while (block.firstChild) child.appendChild(block.firstChild);
        block.appendChild(child); applyStyleRule(child, rule);
      } else applyStyleRule(replaceParagraphTag(block, rule.target), rule);
    });
    this.applyActiveListRules();
    this.finishDocumentMutation();
    this.hooks.showToast(`Estilo aplicado: ${rule.label}`);
  }

  handleUpdateStyleFromSelection(tag: StyleTargetTag): void {
    const range = this.prepareRibbonSelection();
    if (!range) { this.hooks.showToast('Selecciona texto del documento para actualizar el estilo'); return; }
    const active = this.editor.styleTemplates().find(template => template.id === this.editor.activeTemplateId()) || this.editor.styleTemplates()[0];
    const rule = selectionStyle(range, active.rules[tag]);
    this.editor.pushUndoSnapshot();
    // Built-in presets are immutable. The modified definition belongs to this document.
    const template: StyleTemplate = {
      ...active, id: active.isCustom ? active.id : 'document-styles',
      name: active.isCustom ? active.name : 'Estilos del documento', isCustom: true,
      rules: { ...active.rules, [tag]: rule },
    };
    this.editor.styleTemplates.update(templates => [...templates.filter(item => item.id !== template.id), template]);
    this.editor.activeTemplateId.set(template.id);
    markDocumentSelection(this.hooks.liveBodies());
    let count = 0;
    this.hooks.liveBodies().forEach(body => body.querySelectorAll<HTMLElement>(tag.toLowerCase()).forEach(element => {
      applyStyleRule(element, rule); count++;
    }));
    this.applyActiveListRules();
    this.finishDocumentMutation();
    this.hooks.showToast(`${tag === 'P' ? 'Normal' : tag} actualizado en ${count} párrafos; se usará también en los nuevos`);
  }

  handleApplyTemplateToDocument(template: StyleTemplate): void {
    if (!this.editor.documentReady() || this.editor.isReadMode()) return;
    this.prepareRibbonSelection();
    this.editor.pushUndoSnapshot();
    if (template.isCustom) this.editor.styleTemplates.update(templates => [...templates.filter(item => item.id !== template.id), template]);
    this.editor.activeTemplateId.set(template.id);
    const emphasis = template.academicStyle === 'apa7' ? this.hooks.liveBodies().flatMap(body => Array.from(body.querySelectorAll<HTMLElement>('p span,p b,p strong,p i,p em,li span,li b,li strong,li i,li em')))
      .filter(run => !run.closest('h1,h2,h3,h4,h5,h6,[data-apa-heading-level]'))
      .map(run => ({ run, bold: ['B','STRONG'].includes(run.tagName) || run.style.fontWeight === 'bold' || Number(run.style.fontWeight) >= 600,
        italic: ['I','EM'].includes(run.tagName) || run.style.fontStyle === 'italic' })) : [];
    markDocumentSelection(this.hooks.liveBodies());
    this.hooks.liveBodies().forEach(body => {
      (['P','H1','H2','H3','H4','H5','H6'] as StyleTargetTag[]).forEach(tag => {
        body.querySelectorAll<HTMLElement>(tag.toLowerCase()).forEach(element => applyStyleRule(element, template.rules[tag]));
      });
    });
    applyTemplateLists(this.hooks.liveBodies(), template);
    if (template.academicStyle === 'apa7') {
      emphasis.forEach(({ run, bold, italic }) => { if (bold) run.style.fontWeight = 'bold'; if (italic) run.style.fontStyle = 'italic'; });
      this.editor.headingNumbering.set(false);
      renumberHeadings(this.hooks.liveBodies(), false);
      normalizeApaHeadings(this.hooks.liveBodies(), template);
      styleApaSections(this.hooks.liveBodies(), template);
      this.editor.layoutConfig.update(layout => apaDocumentLayout(layout, template));
      applyApaObjects(this.hooks.liveBodies(), template);
    }
    this.finishDocumentMutation();
    if (template.academicStyle === 'apa7') this.hooks.refreshApaToc();
    this.hooks.showToast(`Plantilla "${template.name}" aplicada a todo el documento`);
  }

  handleSaveCustomTemplate(newTpl: StyleTemplate): void {
    this.editor.pushUndoSnapshot();
    this.editor.styleTemplates.update((prev) => {
      const exists = prev.some((t) => t.id === newTpl.id);
      const updated = exists ? prev.map((t) => (t.id === newTpl.id ? newTpl : t)) : [...prev, newTpl];
      return updated;
    });
    this.editor.activeTemplateId.set(newTpl.id);
  }

  handleDeleteCustomTemplate(id: string): void {
    this.editor.pushUndoSnapshot();
    this.editor.styleTemplates.update((prev) => prev.filter((t) => t.id !== id));
    if (this.editor.activeTemplateId() === id) {
      this.editor.activeTemplateId.set(BUILTIN_STYLE_TEMPLATES[0].id);
    }
  }

  handleApplyFontSizePt(pt: string, _fallbackCmd: string): void {
    const size = parseFloat(pt);
    if (!Number.isFinite(size) || size < 1 || size > 400) return;
    const range = this.prepareRibbonSelection();
    if (!range) return;
    if (!range.collapsed) this.editor.pushUndoSnapshot();
    if (range.collapsed) {
      this.setPendingTypingStyle({ fontSize: `${size}pt` });
    } else {
      markDocumentSelection(this.hooks.liveBodies());
      applyInlineProperties(this.hooks.liveBodies(), window.getSelection()!.getRangeAt(0), { fontSize: `${size}pt` });
    }
    this.finishDocumentMutation();
  }

  handleApplyHeading(tag: string): void {
    const activeTpl =
      this.editor.styleTemplates().find((t) => t.id === this.editor.activeTemplateId()) || this.editor.styleTemplates()[0];
    const rule = activeTpl?.rules[tag as StyleTargetTag];
    if (rule) {
      this.handleApplyRuleToSelection(rule);
    } else {
      const activeEl = this.hooks.getActivePageElement();
      activeEl?.focus();
      document.execCommand('formatBlock', false, `<${tag}>`);
      this.editor.commitPageDomToState(this.editor.activePageIndex());
      this.editor.checkAndPaginateOverflow(this.editor.activePageIndex());
      this.updateSelectionFormats();
    }
  }

  saveSelection(): void {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      this.savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  restoreSelection(): void {
    const activeEl = this.hooks.getActivePageElement();
    if (activeEl) {
      activeEl.focus();
    }
    if (this.savedRange) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(this.savedRange);
      }
      this.savedRange = null;
    }
  }

  handleApplyLineHeight(lineHeight: string): void {
    this.onRibbonCommand({ command: 'lineHeight', value: lineHeight });
  }

  handleCopyFormat(): void {
    if (this.editor.formatPainterActive()) {
      this.editor.formatPainterActive.set(false);
      this.editor.copiedInlineStyle.set(null);
      return;
    }
    const range = this.prepareRibbonSelection();
    if (!range) return;
    const template = this.editor.styleTemplates().find(item => item.id === this.editor.activeTemplateId()) || this.editor.styleTemplates()[0];
    this.editor.copiedInlineStyle.set(selectionStyle(range, template.rules.P));
    this.editor.formatPainterActive.set(true);
    this.hooks.showToast('Formato copiado: selecciona texto para aplicarlo');
  }

  onRibbonCommand(event: { command: string; value?: string }): void {
    const { command, value } = event;
    if (command === 'undo' || command === 'redo') { this.executeCommand(command); return; }
    if (command === 'toggleMarks') { this.editor.showFormattingMarks.update(current => !current); return; }
    if (command === 'find' || command === 'replace') { this.editor.openDocumentSearch(command); return; }
    if (command === 'headingNumbering') {
      if (this.editor.styleTemplates().find(t => t.id === this.editor.activeTemplateId())?.academicStyle === 'apa7') return;
      if (!this.editor.documentReady() || this.editor.isReadMode()) return;
      this.editor.pushUndoSnapshot(); this.editor.headingNumbering.set(value === 'on');
      this.finishDocumentMutation();
      this.hooks.showToast(value === 'on' ? 'Títulos H1–H6 vinculados a la numeración 1, 1.1, 1.1.1' : 'Numeración automática de títulos desactivada');
      return;
    }
    const range = this.prepareRibbonSelection();
    if (!range) { this.hooks.showToast('Coloca el cursor o selecciona texto dentro del documento'); return; }
    if (['selectAllDocument','selectCurrentParagraph','selectPage'].includes(command)) {
      const selection = window.getSelection()!;
      if (command === 'selectAllDocument') {
        const bodies = this.hooks.liveBodies();
        range.setStart(bodies[0], 0); range.setEnd(bodies.at(-1)!, bodies.at(-1)!.childNodes.length);
      } else range.selectNodeContents(command === 'selectPage' ? this.hooks.getActivePageElement()! : currentParagraph(range) || this.hooks.getActivePageElement()!);
      selection.removeAllRanges(); selection.addRange(range); this.rememberRibbonSelection(); return;
    }
    if (command === 'subscript' || command === 'superscript') {
      const sample = selectionElement(range);
      const target = command === 'subscript' ? 'sub' : 'super';
      const current = this.pendingTypingStyle?.['verticalAlign'] || scriptPosition(sample);
      const mode = current === target ? 'baseline' : target;
      const template = this.editor.styleTemplates().find(item => item.id === this.editor.activeTemplateId()) || this.editor.styleTemplates()[0];
      const font = selectionStyle(range,template.rules.P);
      const base = scriptBaseSize(sample,font.fontSizePt);
      if (range.collapsed) {
        this.setPendingTypingStyle({ verticalAlign:mode, fontSize:`${mode === 'baseline' ? base : base*.75}pt` });
        this.updateSelectionFormats();
      } else {
        this.editor.pushUndoSnapshot(); markDocumentSelection(this.hooks.liveBodies());
        applyScript(this.hooks.liveBodies(),window.getSelection()!.getRangeAt(0),mode,base);
        this.finishDocumentMutation();
      }
      return;
    }
    if (command === 'fontSizePt' || command === 'growFont' || command === 'shrinkFont') {
      const presets = [8,9,10,11,12,14,16,18,20,22,24,26,28,36,48,72];
      const current = this.pendingTypingStyle?.['fontSize'] ? parseFloat(this.pendingTypingStyle['fontSize'])
        : selectionStyle(range,(this.editor.styleTemplates().find(item => item.id === this.editor.activeTemplateId()) || this.editor.styleTemplates()[0]).rules.P).fontSizePt;
      const size = command === 'fontSizePt' ? Number(value) : command === 'growFont'
        ? presets.find(size => size > current) ?? Math.min(400,current + 2)
        : [...presets].reverse().find(size => size < current) ?? Math.max(1,current - 1);
      this.handleApplyFontSizePt(String(size), '7'); return;
    }
    const custom = ['changeCase','textEffect','lineHeight','spaceBefore','spaceAfter','paragraphShading','paragraphBorder',
      'sortParagraphs','listStyle','multilevelList','indent','outdent','justifyLeft','justifyCenter','justifyRight','justifyFull'];
    if (custom.includes(command)) {
      this.editor.pushUndoSnapshot();
      markDocumentSelection(this.hooks.liveBodies());
      const updated = applyHomeCommand(command, value, this.hooks.liveBodies(), window.getSelection()!.getRangeAt(0));
      if (['listStyle','multilevelList','indent','outdent'].includes(command)) this.applyActiveListRules();
      this.finishDocumentMutation();
      if (!updated) this.hooks.showToast(command === 'sortParagraphs' ? 'Selecciona al menos dos párrafos consecutivos de la misma sección' : 'Selecciona texto o párrafos para aplicar esta función');
      return;
    }
    if (command === 'removeFormat') {
      this.editor.pushUndoSnapshot();
      const blocks = selectedParagraphs(this.hooks.liveBodies(), range);
      const base = this.editor.styleTemplates().find(t => t.id === this.editor.activeTemplateId())!.rules.P;
      markDocumentSelection(this.hooks.liveBodies());
      if (!range.collapsed && range.toString() !== blocks.map(block => block.textContent).join('')) {
        applyInlineProperties(this.hooks.liveBodies(), window.getSelection()!.getRangeAt(0), { ...inlineProperties(base), textShadow: 'none', webkitTextStroke: '0px' });
      } else blocks.forEach(block => {
        const normal = block.tagName === 'LI' ? block : replaceParagraphTag(block, 'P');
        normal.removeAttribute('style'); applyStyleRule(normal, base);
        normal.querySelectorAll<HTMLElement>('[style]').forEach(run => { run.style.textShadow = 'none'; run.style.webkitTextStroke = '0px'; });
      });
      this.finishDocumentMutation(); return;
    }
    if (command === 'fontName' && range.collapsed) {
      this.setPendingTypingStyle({ fontFamily: value || 'Arial' });
      this.editor.formats.update(formats => ({ ...formats, fontName: (value || 'Arial').replace(/["']/g, '').split(',')[0] }));
      return;
    }
    if (command === 'fontName' && !range.collapsed) {
      this.editor.pushUndoSnapshot(); markDocumentSelection(this.hooks.liveBodies());
      applyInlineProperties(this.hooks.liveBodies(), window.getSelection()!.getRangeAt(0), { fontFamily: value || 'Arial' });
      this.finishDocumentMutation(); return;
    }
    this.executeCommand(command, value);
  }

  applyActiveListRules(): void {
    const template = this.editor.styleTemplates().find(item => item.id === this.editor.activeTemplateId());
    if (template) applyTemplateLists(this.hooks.liveBodies(), template, true);
  }
}
