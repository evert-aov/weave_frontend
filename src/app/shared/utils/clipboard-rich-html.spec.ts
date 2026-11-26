import { describe, expect, it } from 'vitest';
import { hasRichClipboardFormatting, sanitizeClipboardHtml } from './clipboard-rich-html';

describe('clipboard-rich-html', () => {
  it('normalizes Google Docs wrapper, headings, inline styles, superscripts, and nested list paragraphs', () => {
    const googleDocsHtml = `
      <meta charset="utf-8">
      <b id="docs-internal-guid-1234" style="font-weight:normal;">
        <h1 style="line-height:1.5; margin-bottom:6pt;"><span style="font-weight:700; color:#1e293b;">Título Principal</span></h1>
        <p style="line-height:1.15;"><span style="font-weight:700;">Negrita</span> y <span style="font-style:italic;">cursiva</span> y x<span style="vertical-align:super;">2</span></p>
        <ul>
          <li><p><span>Primer ítem</span></p></li>
          <li><p><span>Segundo ítem</span></p></li>
        </ul>
      </b>
      <script>alert("xss")</script>
    `;

    expect(hasRichClipboardFormatting(googleDocsHtml)).toBe(true);
    const cleaned = sanitizeClipboardHtml(googleDocsHtml)!;
    expect(cleaned).not.toContain('docs-internal-guid');
    expect(cleaned).not.toContain('<script');
    expect(cleaned).toContain('<h1');
    expect(cleaned).toContain('font-weight: 700');
    expect(cleaned).toContain('font-style: italic');
    expect(cleaned).toContain('<sup>2</sup>');
    expect(cleaned).toContain('<li><span>Primer ítem</span></li>');
    expect(cleaned).not.toMatch(/<li>\s*<p>/);
  });

  it('detects plain text HTML without rich formatting as non-rich', () => {
    expect(hasRichClipboardFormatting('<span>solo texto</span>')).toBe(false);
    expect(hasRichClipboardFormatting('<strong>negrita</strong>')).toBe(true);
  });

  it('does not split paragraphs or inject empty <p> tags when pasting Gemini-like inline citation divs/buttons inside <p>', () => {
    const geminiHtml = `
      <p style="font-family: 'Google Sans Text', sans-serif;">
        El Marco de Trabajo es la <b>base referencial esencial</b> en la ingeniería de software
        <sources-carousel-inline><div class="chip"><button><svg><path d="M0 0"></path></svg></button></div></sources-carousel-inline>. Independientemente de la estrategia.
      </p>
    `;
    const cleaned = sanitizeClipboardHtml(geminiHtml)!;
    expect(cleaned).not.toContain('<button');
    expect(cleaned).not.toContain('<svg');
    expect(cleaned.match(/<p\b/g)?.length).toBe(1);
    expect(cleaned).toContain('en la ingeniería de software');
    expect(cleaned).toContain('. Independientemente de la estrategia.');
  });

  it('strips inter-block newlines, default white backgrounds, and Gemini inline chips while wrapping stray inline siblings', () => {
    const geminiMixedHtml = `
      <div class="markdown" style="background-color: rgb(255, 255, 255);">
        <ul>
          <li><p><strong>Impacto Crítico:</strong> Sistemas críticos<source-inline-chips><div><button>1</button></div></source-inline-chips>.</p></li>
        </ul>
        Incidencia en la estimación: Cuanto mayor sea la criticidad.
        <p style="background-color: #ffffff; text-indent: 0px;">
          Métodos De Estimaciones
        </p>
      </div>
    `;
    expect(hasRichClipboardFormatting('<p>Un solo párrafo pegado</p>')).toBe(true);
    const cleaned = sanitizeClipboardHtml(geminiMixedHtml)!;
    expect(cleaned).not.toContain('source-inline-chips');
    expect(cleaned).not.toContain('rgb(255, 255, 255)');
    expect(cleaned).not.toContain('#ffffff');
    expect(cleaned).not.toContain('text-indent');
    expect(cleaned).toContain('<ul><li><strong>Impacto Crítico:</strong> Sistemas críticos.</li></ul>');
    expect(cleaned).toContain('<p>Incidencia en la estimación: Cuanto mayor sea la criticidad.</p>');
    expect(cleaned).toContain('<p>Métodos De Estimaciones</p>');
  });
});
