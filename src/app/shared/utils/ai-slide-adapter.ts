import type { AiEditorAdapter } from '../../core/services/ai-document.service';
import { cleanSlideText } from '../../core/utils/ai-edit-text';

/** Fachada del visor PPTX: modifica segmentos sin reemplazar el archivo ni sus imágenes. */
export function slideAiAdapter(owner: () => string | undefined, viewer: () => any, addText: (slide: number, text: string) => void, persist: () => void): AiEditorAdapter {
  const entries = () => {
    const result: { id: string; text: string; slide: number; element?: any; segment?: number }[] = [];
    for (const [slide, page] of (viewer()?.getSlides() ?? []).entries()) {
      for (const element of page.elements ?? []) {
        if (element.type !== 'text' && element.type !== 'shape') continue;
        if (element.textSegments?.length) {
          element.textSegments.forEach((segment: any, index: number) => result.push({ id: `slide:${slide + 1}:${element.id}:${index}`, text: segment.text ?? '', slide, element, segment: index }));
        } else result.push({ id: `slide:${slide + 1}:${element.id}`, text: element.text ?? '', slide, element });
      }
      result.push({ id: `slide:${slide + 1}:append`, text: '', slide });
    }
    return result;
  };
  return {
    owner,
    fields: () => entries().map(({ id, text }) => ({ id, text })),
    apply: values => {
      const api = viewer(); const active = api.getActiveSlideIndex();
      const groups = new Map<string, { slide: number; element: any; patch: any }>();
      const appends: { slide: number; text: string }[] = [];
      for (const entry of entries()) {
        if (!values.has(entry.id)) continue;
        const text = cleanSlideText(values.get(entry.id)!);
        if (!entry.element) { if (text.trim()) appends.push({ slide: entry.slide, text: text.trim() }); continue; }
        const key = `${entry.slide}:${entry.element.id}`;
        const group = groups.get(key) ?? { slide: entry.slide, element: entry.element, patch: {} };
        if (entry.segment !== undefined) {
          group.patch.textSegments ??= entry.element.textSegments.map((segment: any) => ({ ...segment }));
          group.patch.textSegments[entry.segment].text = text;
          group.patch.text = group.patch.textSegments.map((segment: any) => segment.text ?? '').join('');
        } else group.patch.text = text;
        groups.set(key, group);
      }
      try {
        for (const { slide, element, patch } of groups.values()) { api.setActiveSlideIndex(slide); api.updateElement(element.id, patch); }
        for (const { slide, text } of appends) addText(slide, text);
      } finally { api.setActiveSlideIndex(active); }
      persist();
    },
  };
}
