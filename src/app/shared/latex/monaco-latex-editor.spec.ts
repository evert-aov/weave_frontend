import { TestBed, ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MonacoLatexEditorComponent } from './monaco-latex-editor.component';
import { MonacoRuntimeService } from '../monaco/monaco-runtime.service';
import { EditorKeybindingsService } from '../monaco/editor-keybindings.service';
import { latexSnippet, registerLatexLanguage } from './monaco-latex-language';
import { SnippetParser } from 'monaco-editor/editor/contrib/snippet/browser/snippetParser.js';

function fakeMonaco() {
  let value = ''; let change = () => {}; let key = (_event: any) => {};
  const disposable = () => ({dispose:vi.fn()});
  const model = {
    getValue:()=>value, setValue:vi.fn((text:string)=>{value=text;change();}),
    onDidChangeContent:(callback:()=>void)=>{change=callback;return disposable();}, dispose:vi.fn(),
    getPositionAt:(offset:number)=>({lineNumber:1,column:offset+1}), getOffsetAt:(position:any)=>position.column-1,
  };
  const editor = {
    updateOptions:vi.fn(), dispose:vi.fn(), focus:vi.fn(), getContentHeight:()=>100,
    onKeyDown:(callback:typeof key)=>{key=callback;return disposable();}, onDidContentSizeChange:disposable,
    setPosition:vi.fn(), getSelection:()=>null, pushUndoStop:vi.fn(), executeEdits:vi.fn(), trigger:vi.fn(), getContribution:vi.fn(),
  };
  const monaco = {
    editor:{createModel:vi.fn((text:string)=>{value=text;return model;}),create:vi.fn(()=>editor),setModelLanguage:vi.fn(),setTheme:vi.fn()},
    languages:{register:vi.fn(),setMonarchTokensProvider:vi.fn(),setLanguageConfiguration:vi.fn(),registerCompletionItemProvider:vi.fn(),CompletionItemKind:{Snippet:27},CompletionItemInsertTextRule:{InsertAsSnippet:4}},
  };
  return {monaco,model,editor,type:(text:string)=>model.setValue(text),key:(event:any)=>key(event)};
}

describe('Monaco LaTeX lifecycle and Vim integration', () => {
  let fixture: ComponentFixture<MonacoLatexEditorComponent>;
  let fake: ReturnType<typeof fakeMonaco>;
  let runtime: {load:ReturnType<typeof vi.fn>;loadVim:ReturnType<typeof vi.fn>};
  let adapter: {dispose:ReturnType<typeof vi.fn>;on:ReturnType<typeof vi.fn>};
  let init: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    const storage=new Map<string,string>();
    vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
    fake=fakeMonaco();
    adapter={dispose:vi.fn(),on:vi.fn()}; init=vi.fn(()=>adapter);
    runtime={load:vi.fn().mockResolvedValue(fake.monaco),loadVim:vi.fn().mockResolvedValue({initVimMode:init})};
    TestBed.configureTestingModule({providers:[{provide:MonacoRuntimeService,useValue:runtime}]});
    fixture=TestBed.createComponent(MonacoLatexEditorComponent);
  });
  afterEach(()=>{fixture?.destroy();vi.restoreAllMocks();vi.unstubAllGlobals();});
  async function mount(value='x^2'):Promise<void> { fixture.componentRef.setInput('value',value); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }
  it('loads a local Monaco model and emits edits without resetting undo on parent echoes', async()=>{
    await mount(); const changed=vi.fn();fixture.componentInstance.valueChange.subscribe(changed);
    expect(fixture.componentInstance.ready()).toBe(true); expect(fake.monaco.editor.createModel).toHaveBeenCalledWith('x^2','weave-latex-math');
    fake.type('x^3'); expect(changed).toHaveBeenCalledWith('x^3');
    fake.model.setValue.mockClear(); fixture.componentRef.setInput('value','x^3');fixture.detectChanges();
    expect(fake.model.setValue).not.toHaveBeenCalled();
    fixture.destroy();expect(fake.editor.dispose).toHaveBeenCalledOnce();expect(fake.model.dispose).toHaveBeenCalledOnce();
  });
  it('preserves text typed during loading and ignores initialization after destruction', async()=>{
    let resolve!:(value:unknown)=>void; runtime.load.mockReturnValue(new Promise(r=>resolve=r));
    fixture.componentRef.setInput('value','');fixture.detectChanges();
    fixture.componentInstance.fallbackChanged('typed while loading');resolve(fake.monaco);
    await fixture.whenStable();expect(fake.monaco.editor.createModel).toHaveBeenCalledWith('typed while loading','weave-latex-math');
    fixture.destroy();
    fake.monaco.editor.create.mockClear();
    runtime.load.mockReturnValue(new Promise(r=>resolve=r));fixture=TestBed.createComponent(MonacoLatexEditorComponent);fixture.detectChanges();fixture.destroy();resolve(fake.monaco);
    await Promise.resolve();expect(fake.monaco.editor.create).not.toHaveBeenCalled();
  });
  it('attaches the Vim adapter on demand, persists the preference, and detaches in reading mode', async()=>{
    await mount();expect(runtime.loadVim).not.toHaveBeenCalled();
    fixture.componentInstance.toggleVim();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(init).toHaveBeenCalledWith(fake.editor,fixture.nativeElement.querySelector('.vim-status'));
    expect(localStorage.getItem('weave_latex_vim')).toBe('true');expect(fixture.componentInstance.vimActive()).toBe(true);
    fixture.componentRef.setInput('readonly',true);fixture.detectChanges();
    expect(adapter.dispose).toHaveBeenCalledOnce();expect(fixture.componentInstance.vimActive()).toBe(false);
    expect(fake.editor.updateOptions).toHaveBeenLastCalledWith(expect.objectContaining({readOnly:true,domReadOnly:true}));
  });
  it('does not attach Vim after destruction or a preference change while the library is loading', async()=>{
    let resolve!:(value:unknown)=>void;runtime.loadVim.mockReturnValue(new Promise(r=>resolve=r));await mount();
    fixture.componentInstance.toggleVim();fixture.detectChanges();
    TestBed.inject(EditorKeybindingsService).setVim(false);fixture.detectChanges();fixture.destroy();
    resolve({initVimMode:init});await Promise.resolve();expect(init).not.toHaveBeenCalled();
  });
  it('keeps normal editing available when Vim cannot load and supports retry', async()=>{
    runtime.loadVim.mockRejectedValue(new Error('Vim no disponible'));await mount();
    fixture.componentInstance.toggleVim();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(fixture.componentInstance.ready()).toBe(true);expect(fixture.componentInstance.vimActive()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('Vim no disponible');
    runtime.loadVim.mockResolvedValue({initVimMode:init});fixture.componentInstance.toggleVim();await fixture.whenStable();
    expect(fixture.componentInstance.vimActive()).toBe(true);
  });
  it('intercepts Ctrl+Enter before Vim and lets Tab accept a completion or move between arguments', async()=>{
    await mount(); const submit=vi.fn();fixture.componentInstance.submitEditor.subscribe(submit);
    const event=(key:string,ctrlKey=false)=>({browserEvent:{key,ctrlKey},preventDefault:vi.fn(),stopPropagation:vi.fn()});
    const compile=event('Enter',true);fake.key(compile);expect(submit).toHaveBeenCalledOnce();expect(compile.preventDefault).toHaveBeenCalled();
    fixture.componentInstance.toggleVim();fixture.detectChanges();await fixture.whenStable();
    adapter.on.mock.calls[0][1]({mode:'insert'});
    const snippet={isInSnippet:()=>true,next:vi.fn(),prev:vi.fn()};fake.editor.getContribution.mockReturnValue(snippet);
    fake.key(event('Tab'));expect(snippet.next).toHaveBeenCalledOnce();
    const widget=document.createElement('div');widget.className='suggest-widget visible';fixture.nativeElement.querySelector('.monaco-host').appendChild(widget);
    fake.key(event('Tab'));expect(fake.editor.trigger).toHaveBeenCalledWith('latex','acceptSelectedSuggestion',{});
  });
});

describe('Monaco LaTeX snippets',()=>{
  it('escapes TeX syntax and creates argument tab stops',()=>{
    expect(latexSnippet('\\frac{}{}')).toBe('\\\\frac{${1}\\}{${2}\\}$0');
    expect(latexSnippet('\\sqrt{x}')).toBe('\\\\sqrt{x\\}$0');
    expect(latexSnippet('$x$')).toBe('\\$x\\$$0');
  });
  it('produces valid original TeX and editable arguments with the actual Monaco snippet parser',()=>{
    for (const source of ['\\frac{}{}','\\sqrt{x}','\\begin{aligned}\nx&=1\\\\\ny&=2\n\\end{aligned}','$x$']) {
      expect(new SnippetParser().parse(latexSnippet(source)).toString()).toBe(source);
    }
    const parsed=new SnippetParser().parse(latexSnippet('\\frac{}{}'));
    expect(parsed.placeholders.map((value:any)=>value.index)).toEqual([1,2,0]);
  });
  it('registers providers only once and uses the whole backslash command as the replacement range',()=>{
    const {monaco}=fakeMonaco(); registerLatexLanguage(monaco as any);registerLatexLanguage(monaco as any);
    expect(monaco.languages.registerCompletionItemProvider).toHaveBeenCalledTimes(2);
    const provider=monaco.languages.registerCompletionItemProvider.mock.calls[0][1];
    const result=provider.provideCompletionItems({getLineContent:()=>String.raw`x + \fr`},{lineNumber:2,column:8});
    expect(result.suggestions[0]).toMatchObject({label:'\\frac',insertText:'\\\\frac{${1}\\}{${2}\\}$0',range:{startLineNumber:2,startColumn:5,endLineNumber:2,endColumn:8}});
    const environment=provider.provideCompletionItems({getLineContent:()=>String.raw`\begin{}`},{lineNumber:1,column:8});
    expect(environment.suggestions[0].range.endColumn).toBe(9);
    const inserted=new SnippetParser().parse(environment.suggestions[0].insertText).toString();
    expect(inserted).toMatch(/^\\begin\{aligned\}/);expect(inserted).toMatch(/\\end\{aligned\}$/);
  });
});
