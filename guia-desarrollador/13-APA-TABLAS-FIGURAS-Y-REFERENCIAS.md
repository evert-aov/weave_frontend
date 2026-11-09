# APA 7: tablas, figuras y referencias bibliográficas

Fuente: `Guia-Normas-APA-7ma-edicion.pdf` facilitada por el usuario, secciones Tablas
(pp. 17–19), Figuras (pp. 20–23), Formato y encabezado (pp. 26–28), Citas y Referencias (pp. 45–48). Las seis variantes
APA mantienen su tipografía seleccionada en las tablas, títulos, notas y referencias.

## Uso

1. Aplicar una plantilla APA desde Diseño para dar formato al documento y a las tablas.
   También configura Carta vertical, márgenes de 96 px (2,54 cm), fondo blanco y numeración
   superior derecha desde la portada. El encabezado APA ocupa el margen superior, sin
   reducir por segunda vez el área útil del cuerpo.
2. En **Referencias → Fuentes y citas**, registrar las fuentes del documento. Se admiten
   libros, capítulos, artículos, páginas web, informes, tesis, legislación, materiales
   audiovisuales, redes sociales y los demás tipos descritos abajo. Los autores se introducen
   uno por línea como `Apellido, Nombre`; el autor institucional tiene un campo propio.
   Se puede omitir autor o fecha si no constan en el original.
3. Situar el cursor en el texto, abrir Fuentes y citas, elegir la fuente e insertar la cita.
   Puede ser narrativa o entre paréntesis, con un localizador opcional (`p. 25`, `párr. 4`).
4. **Insertar / actualizar referencias** añade una página nueva con salto manual y el
   título «Referencias», centrado y en negrita. Solo incluye las fuentes citadas o asociadas
   a una tabla/figura. Usa orden alfabético, doble espacio y sangría francesa de 36 pt
   (1,27 cm), sin espacio adicional entre entradas.
5. En **Tablas y figuras**, elegir el objeto y escribir su título y, cuando proceda, nota,
   fuente y atribución/licencia. Se insertan el número en negrita y el título en cursiva
   encima; la nota queda debajo con «Nota.» en cursiva. Las tablas y figuras tienen
   contadores independientes por orden de aparición. No se inventan títulos ni licencias.
6. **Actualizar APA** regenera citas, lista final y numeración después de borrar, copiar o
   reordenar elementos. Editar una fuente o insertar una cita también actualiza la lista
   existente. No se permite borrar una fuente mientras siga citada o asociada a un objeto.

Las tablas tienen líneas superior e inferior y bajo los encabezados, sin cuadrícula vertical.
El texto queda negro y los fondos de tabla, filas, celdas y formatos anidados se normalizan
a blanco/transparente; también se retiran los atributos heredados `color`/`bgcolor`.
Los colores dentro de ilustraciones SVG o imágenes se conservan. Los totales en TFOOT tienen línea superior. El cuerpo usa interlineado 1,5; los títulos y notas,
doble. Las imágenes conservan sus dimensiones y se limitan al ancho disponible. El paginador
mueve los títulos con el objeto o las primeras filas de tabla; los objetos indivisibles mayores
que una página siguen requiriendo redimensionado. El exportador DOCX representa los bordes
APA, los encabezados repetidos, las cursivas y la sangría francesa.

## Página, encabezado y numeración APA

**Referencias → Página APA** permite escoger estudiante (solo número) o profesional
(título abreviado de hasta 50 caracteres, en mayúsculas a la izquierda, número a la derecha).
La misma configuración aparece en todas las páginas, incluida la portada con número 1.
Cambiar de variante APA conserva el modo y el título abreviado, y actualiza la tipografía.
Los encabezados y pies anteriores siguen en los metadatos, pero se ocultan al usar el
encabezado APA. No se borra ese contenido ni se añade un pie con numeración duplicada.

`layoutConfig.apa` guarda modo, título y tipografía. Los márgenes, el encabezado y la
numeración se guardan con el documento y se restauran al deshacer/rehacer. DOCX exporta
una parte `word/header1.xml` con un campo PAGE real, relacionado desde la sección, y
márgenes de 1440 twips. HTML y PDF incluyen el encabezado visible por página.
La función `utils/apa-layout.ts` centraliza estas reglas.

## Implementación y persistencia

- `models/academic.model.ts`: autores, fuentes, solicitudes de cita y metadatos de objetos.
- `utils/apa-references.ts`: formato de los tipos de fuente admitidos, autores, fechas, DOI/URL,
  orden y sufijos a/b para obras del mismo autor/año. Solo se generan enlaces HTTP(S).
- `utils/apa-objects.ts`: estilos de tablas y metadatos/numeración/títulos/notas de objetos.
- `controllers/word-academic.controller.ts`: operaciones con historial y actualización DOM.
- `components/word-academic-panel/`: formulario de fuentes, citas y leyendas; etiquetas ES/EN.

`docData.bibliographicSources` guarda las fuentes por documento. Los documentos anteriores
sin ese campo se abren con una lista vacía. Las instantáneas de deshacer/rehacer contienen
los metadatos, además de las páginas, por lo que editar una fuente y actualizar sus citas
es una sola operación reversible. No se usa localStorage ni un servicio global de fuentes.

Las citas usan `data-word-citation` y `data-word-source-id`. La lista final usa
`data-word-bibliography` y `data-apa-role`. Las tablas/imágenes se identifican con
`data-word-object-id`; sus leyendas usan `data-apa-caption-for`. Todo el contenido visible
es HTML editable y sobrevive al autoguardado. Las fuentes no se deducen de referencias
escritas a mano ni de bibliografías importadas: estas mantienen su texto original.

Los títulos conservan las mayúsculas introducidas por el usuario. El formulario permite
consignar DOI, edición, páginas, institución, fecha de recuperación y atribución; no busca
ni inventa datos ausentes. El contenido generado está en español siguiendo la guía; cambiar
el idioma de la interfaz traduce los controles, sin traducir el documento.

## Verificación

`utils/apa-academic.spec.ts` cubre autores institucionales y ausentes, fechas, citas,
ordenación, sufijos, veinte/más de veinte autores, los tipos de fuente, enlaces seguros,
leyendas, texto alrededor de imágenes y DOCX. `word-home.spec.ts` comprueba posición del
cursor, metadatos, historial, lista de fuentes citadas, salto manual y reapertura sin mezclar
documentos. Las pruebas del paginador comprueban que las leyendas acompañen a la figura.


## Reglas de texto y niveles

Las seis variantes APA usan doble espacio, primera línea de 36 pt y **cero espacio extra**
antes/después de párrafos y títulos. Aplicar la plantilla desactiva la numeración de H y los
guiones automáticos. El selector ofrece solo H1–H5. Un H6 existente pasa a nivel 5 sin perder
su texto. Los H4/H5 se convierten a un párrafo con un span `data-apa-heading-level`, punto
final y cuerpo en la misma línea; H5 añade cursiva. La conversión conserva las palabras,
el énfasis del cuerpo y los enlaces del índice. Los títulos escritos manualmente con números
se señalan en la revisión; no se borran números que puedan formar parte de su contenido.
El cuerpo APA tiene valores predeterminados para que los nuevos párrafos mantengan el estilo.

## Portada, resumen y apéndices

**Referencias → Estructura APA** permite insertar o actualizar una portada de estudiante o
profesional con los datos proporcionados por el autor. El título se centra en negrita y se
separa de los autores con una línea doble. La portada profesional permite nota del autor;
el título abreviado sigue configurándose en Página APA. Una portada generada se actualiza
sin sobrescribir una portada importada ni borrar otras páginas.

Resumen y Abstract tienen páginas independientes, título centrado/negrita y un párrafo sin
sangría. Las palabras clave llevan etiqueta cursiva y sangría inicial. El formulario cuenta
palabras y muestra el intervalo orientativo de 150–250; no bloquea otros límites institucionales.
No traduce ni redacta el contenido. Los datos de portada y resumen se guardan como HTML editable.

Cada apéndice comienza en página nueva al final. Puede incluir texto o mover una tabla/figura
existente sin copiarla. Las etiquetas se actualizan como Apéndice o Apéndice A/B…; los objetos
usan A1/B1… con contadores separados por tipo y apéndice. La opción de apéndice constituido
solo por una tabla utiliza el título del apéndice en lugar de número/título de tabla, conservando
sus notas. Se pueden insertar referencias a objetos desde Tablas y figuras.

## Notas y citas textuales

**Referencias → Notas** permite insertar, editar, convertir o eliminar notas al pie/finales.
Las llamadas usan `data-word-note-id`, tipo y contenido; su numeración se actualiza por orden
de aparición. Las notas al pie se miden al paginar para reservar su espacio y se presentan al
fondo de la misma página de su llamada, con fuente menor e interlineado sencillo. Las finales
se reúnen después de referencias y antes de apéndices, con la fuente principal y doble espacio.
La edición pasa por el historial y autoguardado; no se usa almacenamiento global separado.

Los módulos son `utils/academic-notes.ts` y `controllers/word-notes.controller.ts`. Se conserva
el contenido de las notas en las llamadas, no en bloques visuales duplicados. Al paginar se
retiran/recrean las notas al pie y se normalizan nodos de texto contiguos para mantener cortes
estables. Las notas al pie deben caber en el área útil de su llamada; para contenido muy extenso
se dispone de notas finales, cuyos párrafos pueden continuar en varias páginas sin
duplicar el texto. Los bloques generados son de solo lectura y se editan desde el panel.

En Fuentes y citas → Citas textuales y opciones avanzadas se introduce el texto literal.
Menos de 40 palabras se inserta entre comillas y se puede indicar si termina la oración.
Desde 40 se crea un bloque de doble espacio, sin comillas/cursiva, con margen izquierdo de
36 pt. Se requiere página, párrafo u otro localizador, salvo comunicaciones personales.
En bloque, la puntuación precede a los datos de la cita; en una cita corta que termina la
oración, el punto queda después. Se conservan los párrafos y el texto circundante.

## Casos y tipos de fuentes

Se permiten varias fuentes en una cita, ordenadas y separadas por punto y coma. Las siglas de
autores institucionales se presentan junto al nombre en su primera cita y se reutilizan después.
Una cita secundaria distingue autor/año originales y fuente consultada; solo esta última entra
en referencias. Las comunicaciones personales incluyen autor/fecha en el texto y se excluyen
de la lista de referencias. Se conservan los sufijos de obras del mismo autor/año y la regla de
veinte/más de veinte autores; citas abreviadas ambiguas amplían los apellidos necesarios.

Tipos del formulario: libro, artículo de revista, web, informe, tesis, capítulo/antología,
periódico, ley/documento legal, entrevista publicada, PDF, diccionario/enciclopedia, congreso,
canción, película, serie, aplicación móvil, pódcast, episodio de pódcast, vídeo, Twitter,
Facebook, Instagram, Wikipedia, diapositivas, obra religiosa y comunicación personal.
Hay campos de editores, traductores, año original, versión, plataforma, rol, número, lugar,
siglas y usuario en redes. Los formatos viven en `utils/apa-reference-formats.ts`; todos
usan metadatos explícitos y enlaces seguros. No se inventan información, permisos ni licencias.

## Revisión y exportación

**Revisar APA** comprueba mecánicamente página/márgenes, guiones, numeración, jerarquía,
subapartados únicos, espacios, encabezados en línea, longitud orientativa de resúmenes,
fuentes inexistentes y títulos/atribuciones pendientes. Es una ayuda: la precisión académica,
la necesidad de cada sección y las exigencias institucionales requieren revisión del autor.

La exportación ahora incluye imágenes y notas nativas. Véase
[Exportación DOCX de Word](14-EXPORTACION-DOCX-WORD.md) para partes, recursos, compresión,
paginación y límites del intercambio con Word.

### Actualización del índice con APA

Al aplicar una plantilla APA o pulsar **Actualizar APA**, un índice existente se
reconstruye desde los encabezados actuales (incluidos los niveles 4 y 5 en línea).
Adopta la fuente y tamaño de la variante elegida, interlineado doble, texto negro
y un título centrado en negrita, sin mayúsculas forzadas, subrayado decorativo ni
espaciado adicional. Conserva las sangrías de jerarquía y los enlaces de navegación.
Después de repaginar se recalculan los números de página. La operación forma parte
del mismo paso de deshacer y mantiene la página activa; no crea un índice donde
no lo había ni lo reconstruye en cada pulsación. Estas decisiones visuales dan
coherencia a la plantilla: la guía APA aportada no prescribe un formato universal
de tabla de contenido y pueden existir requisitos institucionales distintos.

### Interlineado doble y precisión de márgenes

El doble conserva el multiplicador lógico `2` en `data-word-line-spacing`. `word-line-spacing.ts` mide la altura natural de la fuente fuera del zoom y aplica dos veces esa altura antes de paginar. No equivale a multiplicar únicamente el tamaño nominal de fuente. Al cargar fuentes se invalida la medición. Las tablas compactas conservan su interlineado salvo una orden explícita.

Layout muestra dos decimales: APA usa 96 px = 2,54 cm por lado. Los preajustes Normal, Estrecho, Moderado y Ancho usan valores CSS coherentes con sus etiquetas; abrir y aplicar márgenes personalizados conserva la precisión.
