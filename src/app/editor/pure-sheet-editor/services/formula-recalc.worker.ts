import { computeWorkbookFormulas, FormulaRecalcRequest, FormulaRecalcResult } from './formula-recalc.engine';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<FormulaRecalcRequest>) => void) | null;
  postMessage: (message: FormulaRecalcResult) => void;
};

scope.onmessage = ({ data }) => {
  try {
    scope.postMessage(computeWorkbookFormulas(data.sheets, data.revision, data.sheetIds));
  } catch (error) {
    scope.postMessage({
      revision: data.revision,
      computedBySheet: {},
      error: error instanceof Error ? error.message : 'Error recalculando fórmulas en segundo plano.',
    });
  }
};
