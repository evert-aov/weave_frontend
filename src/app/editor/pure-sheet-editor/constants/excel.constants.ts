import { ExcelFunctionInfo, Sheet, SheetGrid } from '../models/excel.model';

const EXTENDED_FUNCTIONS: ExcelFunctionInfo[] = [
  {
    "nameEs": "BUSCARX",
    "nameEn": "XLOOKUP",
    "category": "Búsqueda y referencia",
    "syntax": "XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode])",
    "description": "Busca un valor y devuelve su dato asociado.",
    "descriptionEn": "Finds a value and returns its associated data.",
    "example": "=XLOOKUP()"
  },
  {
    "nameEs": "INDICE",
    "nameEn": "INDEX",
    "category": "Búsqueda y referencia",
    "syntax": "INDEX(array, row_num, [column_num])",
    "description": "Devuelve el valor de una posición de una matriz.",
    "descriptionEn": "Returns the value at a position in an array.",
    "example": "=INDEX()"
  },
  {
    "nameEs": "COINCIDIR",
    "nameEn": "MATCH",
    "category": "Búsqueda y referencia",
    "syntax": "MATCH(lookup_value, lookup_array, [match_type])",
    "description": "Devuelve la posición de una coincidencia.",
    "descriptionEn": "Returns the position of a match.",
    "example": "=MATCH()"
  },
  {
    "nameEs": "BUSCARH",
    "nameEn": "HLOOKUP",
    "category": "Búsqueda y referencia",
    "syntax": "HLOOKUP(lookup_value, table_array, row_index_num, [range_lookup])",
    "description": "Busca en la primera fila de una tabla.",
    "descriptionEn": "Searches the first row of a table.",
    "example": "=HLOOKUP()"
  },
  {
    "nameEs": "SI.ERROR",
    "nameEn": "IFERROR",
    "category": "Lógicas",
    "syntax": "IFERROR(value, value_if_error)",
    "description": "Sustituye un error por un valor alternativo.",
    "descriptionEn": "Replaces an error with a fallback value.",
    "example": "=IFERROR()"
  },
  {
    "nameEs": "SI.ND",
    "nameEn": "IFNA",
    "category": "Lógicas",
    "syntax": "IFNA(value, value_if_na)",
    "description": "Sustituye el error N/A.",
    "descriptionEn": "Replaces an N/A error.",
    "example": "=IFNA()"
  },
  {
    "nameEs": "SI.CONJUNTO",
    "nameEn": "IFS",
    "category": "Lógicas",
    "syntax": "IFS(logical_test1, value_if_true1, ...)",
    "description": "Evalúa condiciones en orden.",
    "descriptionEn": "Evaluates conditions in order.",
    "example": "=IFS()"
  },
  {
    "nameEs": "NO",
    "nameEn": "NOT",
    "category": "Lógicas",
    "syntax": "NOT(logical)",
    "description": "Invierte una condición.",
    "descriptionEn": "Reverses a logical condition.",
    "example": "=NOT()"
  },
  {
    "nameEs": "SUMAR.SI.CONJUNTO",
    "nameEn": "SUMIFS",
    "category": "Matemáticas y trigonometría",
    "syntax": "SUMIFS(sum_range, criteria_range1, criteria1, ...)",
    "description": "Suma los valores que cumplen varias condiciones.",
    "descriptionEn": "Sums values that meet multiple conditions.",
    "example": "=SUMIFS()"
  },
  {
    "nameEs": "CONTAR.SI.CONJUNTO",
    "nameEn": "COUNTIFS",
    "category": "Estadísticas",
    "syntax": "COUNTIFS(criteria_range1, criteria1, ...)",
    "description": "Cuenta los valores que cumplen varias condiciones.",
    "descriptionEn": "Counts values that meet multiple conditions.",
    "example": "=COUNTIFS()"
  },
  {
    "nameEs": "PROMEDIO.SI",
    "nameEn": "AVERAGEIF",
    "category": "Estadísticas",
    "syntax": "AVERAGEIF(range, criteria, [average_range])",
    "description": "Promedia valores que cumplen una condición.",
    "descriptionEn": "Averages values that meet a condition.",
    "example": "=AVERAGEIF()"
  },
  {
    "nameEs": "PROMEDIO.SI.CONJUNTO",
    "nameEn": "AVERAGEIFS",
    "category": "Estadísticas",
    "syntax": "AVERAGEIFS(average_range, criteria_range1, criteria1, ...)",
    "description": "Promedia valores que cumplen varias condiciones.",
    "descriptionEn": "Averages values that meet multiple conditions.",
    "example": "=AVERAGEIFS()"
  },
  {
    "nameEs": "FECHA",
    "nameEn": "DATE",
    "category": "Fecha y hora",
    "syntax": "DATE(year, month, day)",
    "description": "Crea un número de fecha Excel.",
    "descriptionEn": "Creates an Excel date serial number.",
    "example": "=DATE()"
  },
  {
    "nameEs": "AÑO",
    "nameEn": "YEAR",
    "category": "Fecha y hora",
    "syntax": "YEAR(serial_number)",
    "description": "Obtiene el año de una fecha.",
    "descriptionEn": "Returns the year of a date.",
    "example": "=YEAR()"
  },
  {
    "nameEs": "MES",
    "nameEn": "MONTH",
    "category": "Fecha y hora",
    "syntax": "MONTH(serial_number)",
    "description": "Obtiene el mes de una fecha.",
    "descriptionEn": "Returns the month of a date.",
    "example": "=MONTH()"
  },
  {
    "nameEs": "DIA",
    "nameEn": "DAY",
    "category": "Fecha y hora",
    "syntax": "DAY(serial_number)",
    "description": "Obtiene el día de una fecha.",
    "descriptionEn": "Returns the day of a date.",
    "example": "=DAY()"
  },
  {
    "nameEs": "FIN.MES",
    "nameEn": "EOMONTH",
    "category": "Fecha y hora",
    "syntax": "EOMONTH(start_date, months)",
    "description": "Devuelve el último día del mes indicado.",
    "descriptionEn": "Returns the last day of the specified month.",
    "example": "=EOMONTH()"
  },
  {
    "nameEs": "DIAS.LAB",
    "nameEn": "NETWORKDAYS",
    "category": "Fecha y hora",
    "syntax": "NETWORKDAYS(start_date, end_date, [holidays])",
    "description": "Cuenta días de lunes a viernes excluyendo festivos.",
    "descriptionEn": "Counts weekdays excluding holidays.",
    "example": "=NETWORKDAYS()"
  },
  {
    "nameEs": "VA",
    "nameEn": "PV",
    "category": "Financieras",
    "syntax": "PV(rate, nper, pmt, [fv], [type])",
    "description": "Calcula el valor actual de una anualidad.",
    "descriptionEn": "Calculates the present value of an annuity.",
    "example": "=PV()"
  },
  {
    "nameEs": "VF",
    "nameEn": "FV",
    "category": "Financieras",
    "syntax": "FV(rate, nper, pmt, [pv], [type])",
    "description": "Calcula el valor futuro de una anualidad.",
    "descriptionEn": "Calculates the future value of an annuity.",
    "example": "=FV()"
  },
  {
    "nameEs": "VNA",
    "nameEn": "NPV",
    "category": "Financieras",
    "syntax": "NPV(rate, value1, [value2], ...)",
    "description": "Descuenta flujos periódicos desde el final del primer período.",
    "descriptionEn": "Discounts periodic cash flows from the end of the first period.",
    "example": "=NPV()"
  },
  {
    "nameEs": "TIR",
    "nameEn": "IRR",
    "category": "Financieras",
    "syntax": "IRR(values, [guess])",
    "description": "Calcula la tasa interna de retorno de flujos periódicos.",
    "descriptionEn": "Calculates the internal rate of return of periodic cash flows.",
    "example": "=IRR()"
  },
  {
    "nameEs": "IZQUIERDA",
    "nameEn": "LEFT",
    "category": "Texto",
    "syntax": "LEFT(text, [num_chars])",
    "description": "Extrae caracteres del inicio del texto.",
    "descriptionEn": "Extracts characters from the beginning of text.",
    "example": "=LEFT()"
  },
  {
    "nameEs": "DERECHA",
    "nameEn": "RIGHT",
    "category": "Texto",
    "syntax": "RIGHT(text, [num_chars])",
    "description": "Extrae caracteres del final del texto.",
    "descriptionEn": "Extracts characters from the end of text.",
    "example": "=RIGHT()"
  },
  {
    "nameEs": "EXTRAE",
    "nameEn": "MID",
    "category": "Texto",
    "syntax": "MID(text, start_num, num_chars)",
    "description": "Extrae caracteres de una posición del texto.",
    "descriptionEn": "Extracts characters from a position in text.",
    "example": "=MID()"
  },
  {
    "nameEs": "TEXTO",
    "nameEn": "TEXT",
    "category": "Texto",
    "syntax": "TEXT(value, format_text)",
    "description": "Aplica un formato numérico o de fecha a un texto.",
    "descriptionEn": "Formats a number or date as text.",
    "example": "=TEXT()"
  },
  {
    "nameEs": "SUSTITUIR",
    "nameEn": "SUBSTITUTE",
    "category": "Texto",
    "syntax": "SUBSTITUTE(text, old_text, new_text, [instance_num])",
    "description": "Reemplaza un texto o una aparición concreta.",
    "descriptionEn": "Replaces text or a specific occurrence.",
    "example": "=SUBSTITUTE()"
  },
  {
    "nameEs": "VALOR",
    "nameEn": "VALUE",
    "category": "Texto",
    "syntax": "VALUE(text)",
    "description": "Convierte un texto numérico en número.",
    "descriptionEn": "Converts numeric text to a number.",
    "example": "=VALUE()"
  },
  {
    "nameEs": "FILTRAR",
    "nameEn": "FILTER",
    "category": "Matrices dinámicas",
    "syntax": "FILTER(array, include, [if_empty])",
    "description": "Filtra filas o columnas y expande el resultado.",
    "descriptionEn": "Filters rows or columns and spills the result.",
    "example": "=FILTER()"
  },
  {
    "nameEs": "ORDENAR",
    "nameEn": "SORT",
    "category": "Matrices dinámicas",
    "syntax": "SORT(array, [sort_index], [sort_order], [by_col])",
    "description": "Ordena una matriz y expande el resultado.",
    "descriptionEn": "Sorts an array and spills the result.",
    "example": "=SORT()"
  },
  {
    "nameEs": "UNICOS",
    "nameEn": "UNIQUE",
    "category": "Matrices dinámicas",
    "syntax": "UNIQUE(array, [by_col], [exactly_once])",
    "description": "Devuelve filas o columnas únicas.",
    "descriptionEn": "Returns unique rows or columns.",
    "example": "=UNIQUE()"
  },
  {
    "nameEs": "SECUENCIA",
    "nameEn": "SEQUENCE",
    "category": "Matrices dinámicas",
    "syntax": "SEQUENCE(rows, [columns], [start], [step])",
    "description": "Crea una matriz de números consecutivos.",
    "descriptionEn": "Creates an array of sequential numbers.",
    "example": "=SEQUENCE()"
  }
];

export const EXCEL_FUNCTIONS: ExcelFunctionInfo[] = [
  ...EXTENDED_FUNCTIONS,
  {
    nameEs: 'PAGO',
    nameEn: 'PMT',
    category: 'Financieras',
    syntax: 'PMT(rate, nper, pv, [fv], [type])',
    description: 'Calcula el pago periódico con tasa constante. Usa la tasa por período; type 0 paga al final y 1 al inicio. fv y type son opcionales.',
    example: '=PMT(8%/12, 10, 10000)',
  },
  {
    nameEs: 'ABS',
    nameEn: 'ABS',
    category: 'Matemáticas y trigonometría',
    syntax: 'ABS(número)',
    description: 'Devuelve el valor absoluto de un número (un número sin su signo).',
    example: '=ABS(-45)',
  },
  {
    nameEs: 'AHORA',
    nameEn: 'NOW',
    category: 'Fecha y hora',
    syntax: 'AHORA()',
    description: 'Devuelve el número de serie correspondiente a la fecha y hora actuales.',
    example: '=AHORA()',
  },
  {
    nameEs: 'ALEATORIO.ENTRE',
    nameEn: 'RANDBETWEEN',
    category: 'Matemáticas y trigonometría',
    syntax: 'ALEATORIO.ENTRE(inferior, superior)',
    description: 'Devuelve un número entero aleatorio entre los números que especifique.',
    example: '=ALEATORIO.ENTRE(1, 100)',
  },
  {
    nameEs: 'BUSCARV',
    nameEn: 'VLOOKUP',
    category: 'Búsqueda y referencia',
    syntax: 'BUSCARV(valor_buscado, matriz_tabla, indicador_columnas, [rango])',
    description: 'Busca un valor en la primera columna de la izquierda de una tabla y devuelve un valor en la misma fila desde otra columna.',
    example: '=BUSCARV("Prod A", A2:C6, 2, FALSO)',
  },
  {
    nameEs: 'CONCAT',
    nameEn: 'CONCAT',
    category: 'Texto',
    syntax: 'CONCAT(texto1, [texto2], ...)',
    description: 'Combina el texto de varios rangos o cadenas.',
    example: '=CONCAT(A2, " - ", B2)',
  },
  {
    nameEs: 'CONTAR',
    nameEn: 'COUNT',
    category: 'Estadísticas',
    syntax: 'CONTAR(valor1, [valor2], ...)',
    description: 'Cuenta la cantidad de celdas que contienen números.',
    example: '=CONTAR(B2:B6)',
  },
  {
    nameEs: 'CONTAR.SI',
    nameEn: 'COUNTIF',
    category: 'Estadísticas',
    syntax: 'CONTAR.SI(rango, criterio)',
    description: 'Cuenta el número de celdas dentro de un rango que cumplen un solo criterio.',
    example: '=CONTAR.SI(B2:B6, ">100")',
  },
  {
    nameEs: 'CONTARA',
    nameEn: 'COUNTA',
    category: 'Estadísticas',
    syntax: 'CONTARA(valor1, [valor2], ...)',
    description: 'Cuenta la cantidad de celdas que no están vacías en un rango.',
    example: '=CONTARA(A2:A6)',
  },
  {
    nameEs: 'HOY',
    nameEn: 'TODAY',
    category: 'Fecha y hora',
    syntax: 'HOY()',
    description: 'Devuelve la fecha actual con formato de fecha.',
    example: '=HOY()',
  },
  {
    nameEs: 'LARGO',
    nameEn: 'LEN',
    category: 'Texto',
    syntax: 'LARGO(texto)',
    description: 'Devuelve el número de caracteres de una cadena de texto.',
    example: '=LARGO(A2)',
  },
  {
    nameEs: 'MAX',
    nameEn: 'MAX',
    category: 'Estadísticas',
    syntax: 'MAX(número1, [número2], ...)',
    description: 'Devuelve el valor máximo de un conjunto de valores.',
    example: '=MAX(B2:B6)',
  },
  {
    nameEs: 'MAYUSC',
    nameEn: 'UPPER',
    category: 'Texto',
    syntax: 'MAYUSC(texto)',
    description: 'Convierte el texto en mayúsculas.',
    example: '=MAYUSC(A2)',
  },
  {
    nameEs: 'MIN',
    nameEn: 'MIN',
    category: 'Estadísticas',
    syntax: 'MIN(número1, [número2], ...)',
    description: 'Devuelve el valor mínimo de un conjunto de valores.',
    example: '=MIN(B2:B6)',
  },
  {
    nameEs: 'MINUSC',
    nameEn: 'LOWER',
    category: 'Texto',
    syntax: 'MINUSC(texto)',
    description: 'Convierte todas las letras mayúsculas de una cadena de texto en minúsculas.',
    example: '=MINUSC(A2)',
  },
  {
    nameEs: 'O',
    nameEn: 'OR',
    category: 'Lógicas',
    syntax: 'O(valor_lógico1, [valor_lógico2], ...)',
    description: 'Devuelve VERDADERO si alguno de los argumentos es VERDADERO.',
    example: '=O(B2>100, C2>100)',
  },
  {
    nameEs: 'POTENCIA',
    nameEn: 'POWER',
    category: 'Matemáticas y trigonometría',
    syntax: 'POTENCIA(número, potencia)',
    description: 'Devuelve el resultado de elevar un número a una potencia.',
    example: '=POTENCIA(5, 2)',
  },
  {
    nameEs: 'PRODUCTO',
    nameEn: 'PRODUCT',
    category: 'Matemáticas y trigonometría',
    syntax: 'PRODUCTO(número1, [número2], ...)',
    description: 'Multiplica todos los números proporcionados como argumentos.',
    example: '=PRODUCTO(B2, C2)',
  },
  {
    nameEs: 'PROMEDIO',
    nameEn: 'AVERAGE',
    category: 'Estadísticas',
    syntax: 'PROMEDIO(número1, [número2], ...)',
    description: 'Devuelve el promedio (media aritmética) de los argumentos.',
    example: '=PROMEDIO(B2:B6)',
  },
  {
    nameEs: 'RAIZ',
    nameEn: 'SQRT',
    category: 'Matemáticas y trigonometría',
    syntax: 'RAIZ(número)',
    description: 'Devuelve la raíz cuadrada positiva de un número.',
    example: '=RAIZ(144)',
  },
  {
    nameEs: 'REDONDEAR',
    nameEn: 'ROUND',
    category: 'Matemáticas y trigonometría',
    syntax: 'REDONDEAR(número, núm_decimales)',
    description: 'Redondea un número al número de decimales especificado.',
    example: '=REDONDEAR(B2, 1)',
  },
  {
    nameEs: 'SI',
    nameEn: 'IF',
    category: 'Lógicas',
    syntax: 'SI(prueba_lógica, valor_si_verdadero, [valor_si_falso])',
    description: 'Especifica una prueba lógica que realizar y devuelve un valor si es verdadera y otro si es falsa.',
    example: '=SI(D2>1500, "Meta Cumplida", "Revisar")',
  },
  {
    nameEs: 'SUMA',
    nameEn: 'SUM',
    category: 'Matemáticas y trigonometría',
    syntax: 'SUMA(número1, [número2], ...)',
    description: 'Suma todos los números de un rango de celdas.',
    example: '=SUMA(D2:D6)',
  },
  {
    nameEs: 'SUMAR.SI',
    nameEn: 'SUMIF',
    category: 'Matemáticas y trigonometría',
    syntax: 'SUMAR.SI(rango, criterio, [rango_suma])',
    description: 'Suma las celdas en un rango que cumplen los criterios especificados.',
    example: '=SUMAR.SI(D2:D6, ">1000")',
  },
  {
    nameEs: 'Y',
    nameEn: 'AND',
    category: 'Lógicas',
    syntax: 'Y(valor_lógico1, [valor_lógico2], ...)',
    description: 'Devuelve VERDADERO si todos sus argumentos se evalúan como VERDADERO.',
    example: '=Y(B2>10, C2>5)',
  },
];

export const INITIAL_SHEETS: Sheet[] = [
  {
    id: 'sheet1',
    name: 'Sheet1',
    type: 'grid',
    data: {},
  },
  {
    id: 'chart1',
    name: 'Chart1',
    type: 'chart',
    data: {},
  },
];

export const SAMPLE_BUSINESS_DATA: SheetGrid = {
  A1: { raw: 'Producto', style: { bold: true, bgColor: '#1f4e78', textColor: '#ffffff' } },
  B1: { raw: 'Precio Unitario', style: { bold: true, bgColor: '#1f4e78', textColor: '#ffffff', align: 'right' } },
  C1: { raw: 'Unidades', style: { bold: true, bgColor: '#1f4e78', textColor: '#ffffff', align: 'right' } },
  D1: { raw: 'Total Ventas', style: { bold: true, bgColor: '#1f4e78', textColor: '#ffffff', align: 'right' } },
  E1: { raw: 'Estado Meta', style: { bold: true, bgColor: '#1f4e78', textColor: '#ffffff', align: 'center' } },

  A2: { raw: 'Laptop Pro 15' },
  B2: { raw: '1250', style: { numberFormat: 'currency' } },
  C2: { raw: '4' },
  D2: { raw: '=PRODUCTO(B2, C2)', style: { numberFormat: 'currency', preset: 'calculation' } },
  E2: { raw: '=SI(D2>=3000, "Excelente", "Normal")', style: { preset: 'good', align: 'center' } },

  A3: { raw: 'Monitor 4K Ultra' },
  B3: { raw: '420', style: { numberFormat: 'currency' } },
  C3: { raw: '6' },
  D3: { raw: '=PRODUCTO(B3, C3)', style: { numberFormat: 'currency', preset: 'calculation' } },
  E3: { raw: '=SI(D3>=3000, "Excelente", "Normal")', style: { preset: 'neutral', align: 'center' } },

  A4: { raw: 'Teclado Mecánico' },
  B4: { raw: '95', style: { numberFormat: 'currency' } },
  C4: { raw: '15' },
  D4: { raw: '=PRODUCTO(B4, C4)', style: { numberFormat: 'currency', preset: 'calculation' } },
  E4: { raw: '=SI(D4>=3000, "Excelente", "Bajo")', style: { preset: 'bad', align: 'center' } },

  A5: { raw: 'Mouse Inalámbrico' },
  B5: { raw: '45', style: { numberFormat: 'currency' } },
  C5: { raw: '32' },
  D5: { raw: '=PRODUCTO(B5, C5)', style: { numberFormat: 'currency', preset: 'calculation' } },
  E5: { raw: '=SI(D5>=3000, "Excelente", "Normal")', style: { preset: 'neutral', align: 'center' } },

  A6: { raw: 'Estación Dock USB-C' },
  B6: { raw: '180', style: { numberFormat: 'currency' } },
  C6: { raw: '18' },
  D6: { raw: '=PRODUCTO(B6, C6)', style: { numberFormat: 'currency', preset: 'calculation' } },
  E6: { raw: '=SI(D6>=3000, "Excelente", "Normal")', style: { preset: 'good', align: 'center' } },

  A8: { raw: 'SUMA TOTAL', style: { bold: true } },
  D8: { raw: '=SUMA(D2:D6)', style: { bold: true, numberFormat: 'currency', preset: 'check' } },

  A9: { raw: 'PROMEDIO VENTAS', style: { bold: true } },
  D9: { raw: '=PROMEDIO(D2:D6)', style: { numberFormat: 'currency' } },

  A10: { raw: 'VENTA MÁXIMA', style: { bold: true } },
  D10: { raw: '=MAX(D2:D6)', style: { numberFormat: 'currency' } },

  A11: { raw: 'VENTA MÍNIMA', style: { bold: true } },
  D11: { raw: '=MIN(D2:D6)', style: { numberFormat: 'currency' } },

  A12: { raw: 'CANT. PRODUCTOS', style: { bold: true } },
  D12: { raw: '=CONTAR(D2:D6)', style: { align: 'right' } },
};
