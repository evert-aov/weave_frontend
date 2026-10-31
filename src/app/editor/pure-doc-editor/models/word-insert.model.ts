export type SmartArtCategory =
  | 'all'
  | 'list'
  | 'process'
  | 'cycle'
  | 'hierarchy'
  | 'relationship'
  | 'matrix'
  | 'pyramid'
  | 'picture';

export interface SmartArtItem {
  id: string;
  category: SmartArtCategory;
  name: string;
  description: string;
  iconName: string;
  // Colored blocks preview details (for preview card matching Image 2)
  previewBlocks: { color: string; label: string }[];
  generateHtml: () => string;
}

export type ShapeCategory =
  | 'recent'
  | 'lines'
  | 'rectangles'
  | 'basic'
  | 'arrows'
  | 'equation'
  | 'flowchart'
  | 'stars'
  | 'callouts';

export interface ShapeDefinition {
  id: string;
  name: string;
  category: ShapeCategory;
  viewBox: string;
  svgInner: string;
  generateHtml: () => string;
}

export interface WordArtPreset {
  id: string;
  name: string;
  cssStyle: string;
  sampleText: string;
}
