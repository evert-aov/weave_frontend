import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { readXlsx, writeXlsx } from './xlsx.service';
import { Sheet } from '../models/excel.model';
import { bindWorkbookFormulaContext, evaluateCellValue, getCellMatrix } from './formula-engine.service';

const sheets: Sheet[] = [{ id: 'd', name: 'Datos', type: 'grid', data: { A1: { raw: 'Mes' }, B1: { raw: 'Ingresos' }, A2: { raw: 'Enero' }, A3: { raw: 'Febrero' }, A4: { raw: 'Marzo' }, B2: { raw: '10' }, B3: { raw: '20' }, B4: { raw: '15' } } }];
async function chartFixture(type = 'lineChart'): Promise<ArrayBuffer> {
  const files = unzipSync(await writeXlsx(sheets));
  const put = (name: string, xml: string) => files[name] = strToU8(xml);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']).replace('</worksheet>', '<drawing r:id="drawing1"/></worksheet>'); put('xl/worksheets/sheet1.xml', sheet);
  put('xl/worksheets/_rels/sheet1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="drawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
  put('xl/drawings/drawing1.xml', '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>11</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>15</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame><a:graphic><a:graphicData><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="chart1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>');
  put('xl/drawings/_rels/drawing1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="chart1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>');
  put('xl/charts/chart1.xml', `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Ingresos mensuales</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:${type}><c:grouping val="standard"/><c:ser><c:tx><c:strRef><c:f>Datos!$B$1</c:f><c:strCache><c:pt idx="0"><c:v>Ingresos</c:v></c:pt></c:strCache></c:strRef></c:tx><c:spPr><a:ln><a:solidFill><a:srgbClr val="4472C4"/></a:solidFill></a:ln></c:spPr><c:cat><c:strRef><c:f>Datos!$A$2:$A$4</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>Datos!$B$2:$B$4</c:f></c:numRef></c:val></c:ser></c:${type}></c:plotArea><c:legend><c:legendPos val="r"/></c:legend></c:chart></c:chartSpace>`);
  return zipSync(files).buffer as ArrayBuffer;
}
describe('XLSX charts, names, tables and arrays', () => {
  it('imports a real OOXML chart as an editable native chart with geometry, labels and source data', async () => {
    const imported = await readXlsx(await chartFixture(), ['Datos']);
    const chart = imported[0].charts![0];
    expect(chart).toMatchObject({ category: 'line', subType: 'line', chartTitle: 'Ingresos mensuales', sourceSheetId: imported[0].id,
      range: { startCol: 0, endCol: 1, startRow: 1, endRow: 3 }, dataConfig: { xColumn: 0, seriesColumns: [1], hasHeaders: false, seriesNames: { 1: 'Ingresos' } }, appearance: { legendPosition: 'right' } });
    expect(chart.width).toBeGreaterThan(200); expect(chart.x).toBeGreaterThan(100);
    expect(chart.seriesColors).toEqual({ 'column:1': '#4472C4' });
    expect(imported[0].xlsxImportReport).toEqual({ chartsImported: 1, chartsSkipped: 0 });
  }, 20000);
  it('reports unsupported chart types while retaining the workbook', async () => {
    const imported = await readXlsx(await chartFixture('surface3DChart'));
    expect(imported[0].xlsxImportReport).toEqual({ chartsImported: 0, chartsSkipped: 1 });
    expect(imported[0].data['B2'].raw).toBe('10');
  });
  it('round-trips names, structured tables and dynamic arrays as workbook metadata', async () => {
    const workbook: Sheet[] = [{ ...sheets[0], data: { ...sheets[0].data, D1: { raw: '=SEQUENCE(3,2)' }, G1: { raw: '=SUM(Ventas[Ingresos])+SUM(Total)' } },
      workbookNames: { Total: "'Datos'!B2:B4", Tasa: '=0.1' }, definedNames: { Local: "'Datos'!B2" },
      tables: [{ name: 'Ventas', columns: ['Mes', 'Ingresos'], hasHeaders: true, range: { startCol: 0, startRow: 0, endCol: 1, endRow: 3 } }] }];
    const buffer = await writeXlsx(workbook);
    const imported = await readXlsx(buffer.buffer as ArrayBuffer, ['Datos']);
    bindWorkbookFormulaContext(imported);
    expect(imported[0].workbookNames).toEqual({ Total: "'Datos (2)'!B2:B4", Tasa: '0.1' });
    expect(imported[0].definedNames).toEqual({ Local: "'Datos (2)'!B2" });
    expect(imported[0].tables![0]).toMatchObject({ name: 'Ventas', columns: ['Mes', 'Ingresos'] });
    expect(evaluateCellValue('G1', imported[0].data)).toBe(90);
    expect(evaluateCellValue('E3', imported[0].data)).toBe(6);
    expect(getCellMatrix('D1', imported[0].data, new WeakMap())?.materialize()).toEqual([[1,2],[3,4],[5,6]]);
  });
});
