export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';
export type NumberFormat = 'general' | 'currency' | 'percent' | 'comma' | 'date' | 'datetime';
export type PresetStyle = 'normal' | 'bad' | 'good' | 'neutral' | 'calculation' | 'check';

export type BorderLineStyle = 'thin' | 'medium' | 'thick' | 'double' | 'dashed' | 'dotted';

export type BorderPreset =
  | 'bottom'
  | 'top'
  | 'left'
  | 'right'
  | 'none'
  | 'all'
  | 'outside'
  | 'thickOutside'
  | 'bottomDouble'
  | 'thickBottom'
  | 'topBottom'
  | 'topThickBottom'
  | 'topDoubleBottom';

export type DrawBorderMode = 'none' | 'drawBorder' | 'drawGrid' | 'eraseBorder';

export interface BorderEdge {
  style: BorderLineStyle;
  color: string;
}

export interface CellBorders {
  top?: BorderEdge;
  right?: BorderEdge;
  bottom?: BorderEdge;
  left?: BorderEdge;
}

export interface CellStyle {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textColor?: string;
  bgColor?: string;
  align?: TextAlign;
  verticalAlign?: VerticalAlign;
  wrapText?: boolean;
  /** Text rotation angle in degrees (-90 to 90). */
  textRotation?: number;
  /** Whether the cell stays locked when sheet protection is active (defaults to true in Excel). */
  locked?: boolean;
  numberFormat?: NumberFormat;
  decimals?: number;
  /** Original Excel number format, retained for XLSX round trips. */
  xlsxNumberFormat?: string;
  preset?: PresetStyle;
  checkbox?: boolean;
  border?: boolean;
  borders?: CellBorders;
}

export interface CellData {
  raw: string;
  computed?: string | number;
  /** Optional cell hyperlink URL (`https://`, `http://`, `mailto:`). */
  hyperlink?: string;
  /** Original XLSX scalar type, when imported. */
  xlsxType?: 'text' | 'date';
  style?: CellStyle;
}

export type SheetGrid = Record<string, CellData>;

export interface SelectionRange {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
}

export interface ClipboardMatrix {
  mode: 'copy' | 'cut';
  sheetId: string;
  range: {
    minCol: number;
    maxCol: number;
    minRow: number;
    maxRow: number;
  };
  cells: CellData[][];
  merges: MergeRegion[];
  tsvSignature: string;
}

export interface MergeRegion {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
}

export interface FreezePanesConfig {
  rows: number;
  cols: number;
}

export type ConditionalRuleType =
  | 'greaterThan'
  | 'lessThan'
  | 'between'
  | 'equalTo'
  | 'containsText'
  | 'duplicates'
  | 'aboveAverage'
  | 'colorScale'
  | 'dataBar'
  | 'iconSet';
export type ColorScalePreset = 'green-yellow-red' | 'red-yellow-green' | 'blue-white-red';
export type IconSetStyle = 'trafficLights' | 'arrows';

export interface ConditionalRule {
  id: string;
  range: SelectionRange;
  type: ConditionalRuleType;
  value1?: number;
  value2?: number;
  textValue?: string;
  presetStyle?: PresetStyle;
  colorScale?: ColorScalePreset;
  dataBarColor?: string;
  iconSetStyle?: IconSetStyle;
}

export type ColumnFilters = Record<number, Set<string>>;

export type ChartCategory =
  | 'column'
  | 'line'
  | 'pie'
  | 'bar'
  | 'area'
  | 'scatter'
  | 'map'
  | 'stock'
  | 'surface'
  | 'radar'
  | 'treemap'
  | 'sunburst'
  | 'histogram'
  | 'boxWhisker'
  | 'waterfall'
  | 'funnel'
  | 'combo';

export type ChartSubType =
  | 'clusteredColumn'
  | 'stackedColumn'
  | 'percentStackedColumn'
  | '3dClusteredColumn'
  | '3dStackedColumn'
  | '3dPercentStackedColumn'
  | '3dColumn'
  | 'line'
  | 'stackedLine'
  | 'percentStackedLine'
  | 'lineMarkers'
  | 'stackedLineMarkers'
  | 'percentStackedLineMarkers'
  | '3dLine'
  | 'pie2d'
  | 'pieOfPie'
  | 'barOfPie'
  | 'pie3d'
  | 'doughnut'
  | 'clusteredBar'
  | 'stackedBar'
  | 'percentStackedBar'
  | '3dClusteredBar'
  | '3dStackedBar'
  | '3dPercentStackedBar'
  | 'area'
  | 'stackedArea'
  | 'percentStackedArea'
  | '3dArea'
  | '3dStackedArea'
  | '3dPercentStackedArea'
  | 'scatter'
  | 'scatterSmoothLinesMarkers'
  | 'scatterSmoothLines'
  | 'scatterStraightLinesMarkers'
  | 'scatterStraightLines'
  | 'bubble'
  | '3dBubble'
  | 'filledMap'
  | 'highLowClose'
  | 'openHighLowClose'
  | 'volumeHighLowClose'
  | 'volumeOpenHighLowClose'
  | 'surface3d'
  | 'wireframe3dSurface'
  | 'contour'
  | 'wireframeContour'
  | 'radar'
  | 'radarMarkers'
  | 'filledRadar'
  | 'treemap'
  | 'sunburst'
  | 'histogram'
  | 'pareto'
  | 'boxWhisker'
  | 'waterfall'
  | 'funnel'
  | 'comboClusteredColumnLine';

export interface FloatingArtwork {
  id: string;
  kind: 'shape' | 'icon' | 'image';
  itemId: string;
  imageDataUrl?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartDataConfig {
  orientation?: 'column' | 'row';
  seriesNames?: Record<number, string>;
  xColumn: number | null;
  xRow?: number | null;
  seriesColumns: number[];
  seriesRows?: number[];
  hasHeaders: boolean;
}

export interface ChartAppearance {
  legendPosition: 'top' | 'bottom' | 'left' | 'right' | 'none';
  titlePosition: 'top' | 'bottom' | 'none';
  titleAlign: 'left' | 'center' | 'right';
}

export interface EmbeddedChart {
  sourceSheetId?: string;
  seriesColors?: Record<string, string>;
  appearance?: ChartAppearance;
  dataConfig?: ChartDataConfig;
  chartTitle?: string;
  id: string;
  title: string;
  category: ChartCategory;
  subType: ChartSubType;
  range: SelectionRange;
  x: number;
  y: number;
  width: number;
  height: number;
  colorPalette?: 'excel' | 'monochrome' | 'warm' | 'cool';
}

export type DrawToolId =
  | 'select'
  | 'lasso'
  | 'eraser'
  | 'penBlack'
  | 'penRed'
  | 'pencilGray'
  | 'highlighterYellow'
  | 'fountainBlue'
  | 'markerGreen'
  | 'penGalaxy'
  | string;

export interface InkPenConfig {
  id: string;
  name: string;
  kind: 'pen' | 'pencil' | 'highlighter' | 'fountain' | 'marker' | 'galaxy';
  color: string;
  strokeWidth: number;
  opacity: number;
}

export interface InkPoint {
  x: number;
  y: number;
}

export interface InkStroke {
  id: string;
  penId: string;
  color: string;
  strokeWidth: number;
  opacity: number;
  isHighlighter?: boolean;
  isGalaxy?: boolean;
  points: InkPoint[];
  shapeType?: 'rectangle' | 'ellipse' | 'line';
  selected?: boolean;
}

export type PageThemeId = 'office' | 'facet' | 'integral' | 'ion' | 'organic' | 'retrospect';
export type PageMarginsId = 'normal' | 'wide' | 'narrow';
export type PageOrientation = 'portrait' | 'landscape';
export type PageSizeId = 'letter' | 'a4' | 'legal';

export interface PageLayoutConfig {
  theme: PageThemeId;
  margins: PageMarginsId;
  orientation: PageOrientation;
  size: PageSizeId;
  printArea?: SelectionRange | null;
  showPageBreaks?: boolean;
  backgroundUrl?: string | null;
  widthPages: string;
  heightPages: string;
  scale: number;
  gridlinesPrint: boolean;
  headingsPrint: boolean;
}

export type ValidationRuleType = 'any' | 'list' | 'whole' | 'decimal' | 'textLength' | 'date';
export type ValidationOperator =
  | 'between'
  | 'notBetween'
  | 'equalTo'
  | 'notEqualTo'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterOrEqual'
  | 'lessOrEqual';

export interface CellValidationRule {
  type: ValidationRuleType;
  operator?: ValidationOperator;
  formula1?: string;
  formula2?: string;
  allowBlank?: boolean;
  showDropdown?: boolean;
  errorTitle?: string;
  errorMessage?: string;
}

export interface SheetTable {
  name: string;
  range: SelectionRange;
  columns: string[];
  hasHeaders: boolean;
  totalsRow?: boolean;
}

export interface CellComment {
  text: string;
  author?: string;
  updatedAt?: string;
}

export type SparklineType = 'line' | 'column' | 'winLoss';

export type PasteSpecialMode = 'all' | 'values' | 'formulas' | 'formats' | 'transpose';

export interface SparklineConfig {
  type: SparklineType;
  sourceRange: SelectionRange;
  color?: string;
  showMarkers?: boolean;
}

export interface OutlineGroup {
  start: number;
  end: number;
  collapsed?: boolean;
}

export interface PivotTableDefinition {
  id: string;
  name: string;
  sourceSheetId: string;
  range: SelectionRange;
  rowCol: number;
  colCol: number | null;
  valueCol: number;
  aggregation: 'sum' | 'count' | 'average' | 'min' | 'max';
  targetRange: SelectionRange;
}

export interface Sheet {
  xlsxImportReport?: { chartsImported: number; chartsSkipped: number };
  definedNames?: Record<string, string>;
  /** Workbook names are stored once, on the first worksheet. */
  workbookNames?: Record<string, string>;
  tables?: SheetTable[];
  validations?: Record<string, CellValidationRule>;
  comments?: Record<string, CellComment>;
  sparklines?: Record<string, SparklineConfig>;
  tabColor?: string;
  hiddenCols?: number[];
  hiddenRows?: number[];
  rowGroups?: OutlineGroup[];
  colGroups?: OutlineGroup[];
  protected?: boolean;
  filtersEnabled?: boolean;
  id: string;
  name: string;
  type: 'grid' | 'chart';
  data: SheetGrid;
  conditionalRules?: ConditionalRule[];
  merges?: MergeRegion[];
  colWidths?: Record<number, number>;
  rowHeights?: Record<number, number>;
  freezePanes?: FreezePanesConfig;
  charts?: EmbeddedChart[];
  pivotTables?: PivotTableDefinition[];
  artwork?: FloatingArtwork[];
  inkStrokes?: InkStroke[];
  pageLayout?: PageLayoutConfig;
}

export interface ExcelFunctionInfo {
  descriptionEn?: string;
  nameEs: string;
  nameEn: string;
  category: string;
  syntax: string;
  description: string;
  example: string;
}
