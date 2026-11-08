import type { SelectionRange } from './excel.model';

export interface SheetReferenceTarget { sheetId: string | null; sheetName: string; range: SelectionRange; label: string; }
export interface SheetReferenceTrace { origin: { sheetId: string; sheetName: string; cellId: string }; direction: 'precedents' | 'dependents'; targets: SheetReferenceTarget[]; message: string; }
