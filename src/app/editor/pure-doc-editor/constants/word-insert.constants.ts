import { ShapeDefinition, SmartArtItem, WordArtPreset } from '../models/word-insert.model';

export const SMARTART_ITEMS: SmartArtItem[] = [
  // ==================== LIST ====================
  {
    id: 'basic-block-list',
    category: 'list',
    name: 'Lista de bloques básica',
    description: 'Se usa para mostrar bloques de información no secuenciales o agrupados. Maximiza el espacio de visualización horizontal y vertical.',
    iconName: 'layout-grid',
    previewBlocks: [
      { color: '#ea580c', label: 'Nivel 1' },
      { color: '#475569', label: 'Nivel 2' },
      { color: '#eab308', label: 'Nivel 3' },
      { color: '#2563eb', label: 'Nivel 4' },
      { color: '#16a34a', label: 'Nivel 5' },
    ],
    generateHtml: () => `
      <div class="word-smartart-container" data-smartart="basic-block-list" contenteditable="false" style="margin:20px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-family:inherit;">
        <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">
          📊 SmartArt: Lista de bloques básica
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(170px, 1fr));gap:12px;">
          <div style="background:#ea580c;color:white;border-radius:8px;padding:12px;box-shadow:0 2px 4px rgba(0,0,0,0.06);">
            <div contenteditable="true" style="font-weight:700;font-size:14px;margin-bottom:6px;outline:none;">[Elemento 1]</div>
            <div contenteditable="true" style="font-size:12px;opacity:0.95;outline:none;">Descripción detallada del primer bloque clave.</div>
          </div>
          <div style="background:#475569;color:white;border-radius:8px;padding:12px;box-shadow:0 2px 4px rgba(0,0,0,0.06);">
            <div contenteditable="true" style="font-weight:700;font-size:14px;margin-bottom:6px;outline:none;">[Elemento 2]</div>
            <div contenteditable="true" style="font-size:12px;opacity:0.95;outline:none;">Descripción del segundo bloque de información.</div>
          </div>
          <div style="background:#eab308;color:#713f12;border-radius:8px;padding:12px;box-shadow:0 2px 4px rgba(0,0,0,0.06);">
            <div contenteditable="true" style="font-weight:700;font-size:14px;margin-bottom:6px;outline:none;">[Elemento 3]</div>
            <div contenteditable="true" style="font-size:12px;opacity:0.95;outline:none;">Puntos clave del tercer componente agrupado.</div>
          </div>
          <div style="background:#2563eb;color:white;border-radius:8px;padding:12px;box-shadow:0 2px 4px rgba(0,0,0,0.06);">
            <div contenteditable="true" style="font-weight:700;font-size:14px;margin-bottom:6px;outline:none;">[Elemento 4]</div>
            <div contenteditable="true" style="font-size:12px;opacity:0.95;outline:none;">Información adicional y datos de soporte.</div>
          </div>
          <div style="background:#16a34a;color:white;border-radius:8px;padding:12px;box-shadow:0 2px 4px rgba(0,0,0,0.06);">
            <div contenteditable="true" style="font-weight:700;font-size:14px;margin-bottom:6px;outline:none;">[Elemento 5]</div>
            <div contenteditable="true" style="font-size:12px;opacity:0.95;outline:none;">Conclusión o resultado del conjunto analizado.</div>
          </div>
        </div>
      </div><p><br/></p>
    `,
  },
  {
    id: 'hexagon-list',
    category: 'list',
    name: 'Lista de hexágonos',
    description: 'Se usa para mostrar una serie de ideas o valores interconectados que forman una unidad coherente.',
    iconName: 'shapes',
    previewBlocks: [
      { color: '#0284c7', label: 'H1' },
      { color: '#0d9488', label: 'H2' },
      { color: '#d97706', label: 'H3' },
      { color: '#9333ea', label: 'H4' },
    ],
    generateHtml: () => `
      <div class="word-smartart-container" data-smartart="hexagon-list" contenteditable="false" style="margin:20px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
        <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">
          📊 SmartArt: Lista de hexágonos
        </div>
        <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:14px;">
          <div style="width:140px;background:#0284c7;color:white;padding:14px 10px;text-align:center;border-radius:12px;clip-path:polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);min-height:120px;display:flex;flex-direction:column;justify-content:center;">
            <div contenteditable="true" style="font-weight:700;font-size:13px;outline:none;">[Idea 1]</div>
            <div contenteditable="true" style="font-size:11px;opacity:0.9;outline:none;">Detalle 1</div>
          </div>
          <div style="width:140px;background:#0d9488;color:white;padding:14px 10px;text-align:center;border-radius:12px;clip-path:polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);min-height:120px;display:flex;flex-direction:column;justify-content:center;">
            <div contenteditable="true" style="font-weight:700;font-size:13px;outline:none;">[Idea 2]</div>
            <div contenteditable="true" style="font-size:11px;opacity:0.9;outline:none;">Detalle 2</div>
          </div>
          <div style="width:140px;background:#d97706;color:white;padding:14px 10px;text-align:center;border-radius:12px;clip-path:polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);min-height:120px;display:flex;flex-direction:column;justify-content:center;">
            <div contenteditable="true" style="font-weight:700;font-size:13px;outline:none;">[Idea 3]</div>
            <div contenteditable="true" style="font-size:11px;opacity:0.9;outline:none;">Detalle 3</div>
          </div>
          <div style="width:140px;background:#9333ea;color:white;padding:14px 10px;text-align:center;border-radius:12px;clip-path:polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);min-height:120px;display:flex;flex-direction:column;justify-content:center;">
            <div contenteditable="true" style="font-weight:700;font-size:13px;outline:none;">[Idea 4]</div>
            <div contenteditable="true" style="font-size:11px;opacity:0.9;outline:none;">Detalle 4</div>
          </div>
        </div>
      </div><p><br/></p>
    `,
  },
  {
    id: 'vertical-bullet-list',
    category: 'list',
    name: 'Lista vertical con viñetas',
    description: 'Se usa para mostrar una lista de conceptos principales con viñetas subordinadas en tarjetas estilizadas.',
    iconName: 'list',
    previewBlocks: [
      { color: '#3b82f6', label: 'Sección A' },
      { color: '#6366f1', label: 'Sección B' },
      { color: '#8b5cf6', label: 'Sección C' },
    ],
    generateHtml: () => `
      <div class="word-smartart-container" data-smartart="vertical-bullet-list" contenteditable="false" style="margin:20px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
        <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">
          📊 SmartArt: Lista vertical con viñetas
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:stretch;border:1px solid #bfdbfe;border-radius:8px;overflow:hidden;background:white;">
            <div style="background:#2563eb;color:white;font-weight:bold;padding:12px 18px;min-width:120px;display:flex;align-items:center;justify-content:center;" contenteditable="true">[Tema A]</div>
            <div style="padding:10px 14px;flex:1;" contenteditable="true">• Punto clave principal<br/>• Detalle complementario</div>
          </div>
          <div style="display:flex;align-items:stretch;border:1px solid #c7d2fe;border-radius:8px;overflow:hidden;background:white;">
            <div style="background:#4f46e5;color:white;font-weight:bold;padding:12px 18px;min-width:120px;display:flex;align-items:center;justify-content:center;" contenteditable="true">[Tema B]</div>
            <div style="padding:10px 14px;flex:1;" contenteditable="true">• Punto clave principal<br/>• Detalle complementario</div>
          </div>
          <div style="display:flex;align-items:stretch;border:1px solid #ddd6fe;border-radius:8px;overflow:hidden;background:white;">
            <div style="background:#7c3aed;color:white;font-weight:bold;padding:12px 18px;min-width:120px;display:flex;align-items:center;justify-content:center;" contenteditable="true">[Tema C]</div>
            <div style="padding:10px 14px;flex:1;" contenteditable="true">• Punto clave principal<br/>• Detalle complementario</div>
          </div>
        </div>
      </div><p><br/></p>
    `,
  },

  // ==================== PROCESS ====================
  {
    id: 'basic-process',
    category: 'process',
    name: 'Proceso básico',
    description: 'Se usa para mostrar una progresión paso a paso de tareas o fases en una secuencia horizontal.',
    iconName: 'git-commit',
    previewBlocks: [
      { color: '#2563eb', label: 'Paso 1' },
      { color: '#0284c7', label: 'Paso 2' },
      { color: '#0d9488', label: 'Paso 3' },
      { color: '#16a34a', label: 'Paso 4' },
    ],
    generateHtml: () => `
      <div class="word-smartart-container" data-smartart="basic-process" contenteditable="false" style="margin:20px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
        <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">
          📊 SmartArt: Proceso básico secuencial
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div style="flex:1;min-width:130px;background:#2563eb;color:white;padding:12px 8px;border-radius:8px;text-align:center;">
            <div contenteditable="true" style="font-weight:700;font-size:13px;outline:none;">Paso 1</div>
            <div contenteditable="true" style="font-size:11px;opacity:0.9;outline:none;">Iniciación y alcance</div>
          </div>
          <span style="font-size:18px;color:#94a3b8;font-weight:bold;">➔</span>
          <div style="flex:1;min-width:130px;background:#0284c7;color:white;padding:12px 8px;border-radius:8px;text-align:center;">
            <div contenteditable="true" style="font-weight:700;font-size:13px;outline:none;">Paso 2</div>
            <div contenteditable="true" style="font-size:11px;opacity:0.9;outline:none;">Diseño y análisis</div>
          </div>
          <span style="font-size:18px;color:#94a3b8;font-weight:bold;">➔</span>
          <div style="flex:1;min-width:130px;background:#0d9488;color:white;padding:12px 8px;border-radius:8px;text-align:center;">
            <div contenteditable="true" style="font-weight:700;font-size:13px;outline:none;">Paso 3</div>
            <div contenteditable="true" style="font-size:11px;opacity:0.9;outline:none;">Ejecución y pruebas</div>
          </div>
          <span style="font-size:18px;color:#94a3b8;font-weight:bold;">➔</span>
          <div style="flex:1;min-width:130px;background:#16a34a;color:white;padding:12px 8px;border-radius:8px;text-align:center;">
            <div contenteditable="true" style="font-weight:700;font-size:13px;outline:none;">Paso 4</div>
            <div contenteditable="true" style="font-size:11px;opacity:0.9;outline:none;">Entrega final</div>
          </div>
        </div>
      </div><p><br/></p>
    `,
  },
  {
    id: 'timeline-process',
    category: 'process',
    name: 'Línea de tiempo de hitos',
    description: 'Se usa para mostrar una secuencia cronológica con fechas e hitos clave destacados.',
    iconName: 'calendar',
    previewBlocks: [
      { color: '#3b82f6', label: 'Q1' },
      { color: '#8b5cf6', label: 'Q2' },
      { color: '#ec4899', label: 'Q3' },
      { color: '#10b981', label: 'Q4' },
    ],
    generateHtml: () => `
      <div class="word-smartart-container" data-smartart="timeline-process" contenteditable="false" style="margin:20px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
        <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">
          📊 SmartArt: Línea de tiempo de hitos
        </div>
        <div style="position:relative;padding:10px 0;">
          <div style="height:4px;background:#cbd5e1;position:absolute;top:28px;left:5%;right:5%;z-index:1;"></div>
          <div style="display:flex;justify-content:space-between;position:relative;z-index:2;flex-wrap:wrap;gap:12px;">
            <div style="text-align:center;flex:1;min-width:100px;">
              <div style="width:36px;height:36px;background:#2563eb;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;font-weight:bold;font-size:12px;">Q1</div>
              <div contenteditable="true" style="font-weight:700;font-size:12px;margin-top:8px;outline:none;">Fase 1</div>
              <div contenteditable="true" style="font-size:11px;color:#64748b;outline:none;">Planificación</div>
            </div>
            <div style="text-align:center;flex:1;min-width:100px;">
              <div style="width:36px;height:36px;background:#7c3aed;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;font-weight:bold;font-size:12px;">Q2</div>
              <div contenteditable="true" style="font-weight:700;font-size:12px;margin-top:8px;outline:none;">Fase 2</div>
              <div contenteditable="true" style="font-size:11px;color:#64748b;outline:none;">Desarrollo</div>
            </div>
            <div style="text-align:center;flex:1;min-width:100px;">
              <div style="width:36px;height:36px;background:#db2777;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;font-weight:bold;font-size:12px;">Q3</div>
              <div contenteditable="true" style="font-weight:700;font-size:12px;margin-top:8px;outline:none;">Fase 3</div>
              <div contenteditable="true" style="font-size:11px;color:#64748b;outline:none;">Validación</div>
            </div>
            <div style="text-align:center;flex:1;min-width:100px;">
              <div style="width:36px;height:36px;background:#059669;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;font-weight:bold;font-size:12px;">Q4</div>
              <div contenteditable="true" style="font-weight:700;font-size:12px;margin-top:8px;outline:none;">Fase 4</div>
              <div contenteditable="true" style="font-size:11px;color:#64748b;outline:none;">Lanzamiento</div>
            </div>
          </div>
        </div>
      </div><p><br/></p>
    `,
  },

  // ==================== CYCLE ====================
  {
    id: 'basic-cycle',
    category: 'cycle',
    name: 'Ciclo básico',
    description: 'Se usa para representar una secuencia continua de fases o eventos en un flujo circular cerrado.',
    iconName: 'refresh-cw',
    previewBlocks: [
      { color: '#2563eb', label: 'Planear' },
      { color: '#0d9488', label: 'Hacer' },
      { color: '#d97706', label: 'Verificar' },
      { color: '#dc2626', label: 'Actuar' },
    ],
    generateHtml: () => `
      <div class="word-smartart-container" data-smartart="basic-cycle" contenteditable="false" style="margin:20px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;text-align:center;">
        <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">
          📊 SmartArt: Ciclo continuo (PDCA)
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:380px;margin:0 auto;">
          <div style="background:#2563eb;color:white;padding:14px;border-radius:10px;">
            <div contenteditable="true" style="font-weight:bold;font-size:13px;outline:none;">1. PLANEAR</div>
            <div contenteditable="true" style="font-size:11px;opacity:0.9;outline:none;">Definir objetivos</div>
          </div>
          <div style="background:#0d9488;color:white;padding:14px;border-radius:10px;">
            <div contenteditable="true" style="font-weight:bold;font-size:13px;outline:none;">2. HACER</div>
            <div contenteditable="true" style="font-size:11px;opacity:0.9;outline:none;">Implementar acciones</div>
          </div>
          <div style="background:#dc2626;color:white;padding:14px;border-radius:10px;">
            <div contenteditable="true" style="font-weight:bold;font-size:13px;outline:none;">4. ACTUAR</div>
            <div contenteditable="true" style="font-size:11px;opacity:0.9;outline:none;">Estandarizar y mejorar</div>
          </div>
          <div style="background:#d97706;color:white;padding:14px;border-radius:10px;">
            <div contenteditable="true" style="font-weight:bold;font-size:13px;outline:none;">3. VERIFICAR</div>
            <div contenteditable="true" style="font-size:11px;opacity:0.9;outline:none;">Evaluar resultados</div>
          </div>
        </div>
      </div><p><br/></p>
    `,
  },

  // ==================== HIERARCHY ====================
  {
    id: 'organization-chart',
    category: 'hierarchy',
    name: 'Organigrama jerárquico',
    description: 'Se usa para mostrar relaciones de autoridad, estructura de empresas o taxonomías de conceptos.',
    iconName: 'network',
    previewBlocks: [
      { color: '#1e3a8a', label: 'Dirección' },
      { color: '#2563eb', label: 'Gerencias' },
      { color: '#38bdf8', label: 'Equipos' },
    ],
    generateHtml: () => `
      <div class="word-smartart-container" data-smartart="organization-chart" contenteditable="false" style="margin:20px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;text-align:center;">
        <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">
          📊 SmartArt: Organigrama jerárquico
        </div>
        <div style="display:inline-block;background:#1e3a8a;color:white;padding:10px 24px;border-radius:8px;margin-bottom:12px;box-shadow:0 2px 4px rgba(0,0,0,0.08);">
          <div contenteditable="true" style="font-weight:bold;font-size:14px;outline:none;">[Dirección General]</div>
          <div contenteditable="true" style="font-size:11px;opacity:0.9;outline:none;">Liderazgo ejecutivo</div>
        </div>
        <div style="width:2px;height:14px;background:#94a3b8;margin:0 auto;"></div>
        <div style="height:2px;background:#94a3b8;max-width:360px;margin:0 auto 12px;"></div>
        <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;">
          <div style="background:#2563eb;color:white;padding:10px 14px;border-radius:8px;min-width:110px;">
            <div contenteditable="true" style="font-weight:bold;font-size:12px;outline:none;">[Operaciones]</div>
            <div contenteditable="true" style="font-size:10px;opacity:0.9;outline:none;">Equipo A</div>
          </div>
          <div style="background:#2563eb;color:white;padding:10px 14px;border-radius:8px;min-width:110px;">
            <div contenteditable="true" style="font-weight:bold;font-size:12px;outline:none;">[Tecnología]</div>
            <div contenteditable="true" style="font-size:10px;opacity:0.9;outline:none;">Equipo B</div>
          </div>
          <div style="background:#2563eb;color:white;padding:10px 14px;border-radius:8px;min-width:110px;">
            <div contenteditable="true" style="font-weight:bold;font-size:12px;outline:none;">[Finanzas]</div>
            <div contenteditable="true" style="font-size:10px;opacity:0.9;outline:none;">Equipo C</div>
          </div>
        </div>
      </div><p><br/></p>
    `,
  },

  // ==================== RELATIONSHIP ====================
  {
    id: 'venn-diagram',
    category: 'relationship',
    name: 'Diagrama de Venn (3 Áreas)',
    description: 'Se usa para mostrar áreas de solapamiento e intersección entre diferentes conceptos o conjuntos.',
    iconName: 'layers',
    previewBlocks: [
      { color: '#3b82f6', label: 'Conjunto A' },
      { color: '#ec4899', label: 'Conjunto B' },
      { color: '#eab308', label: 'Conjunto C' },
    ],
    generateHtml: () => `
      <div class="word-smartart-container" data-smartart="venn-diagram" contenteditable="false" style="margin:20px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;text-align:center;">
        <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">
          📊 SmartArt: Diagrama de Venn de intersección
        </div>
        <div style="position:relative;width:240px;height:180px;margin:0 auto;">
          <div style="position:absolute;top:0;left:45px;width:110px;height:110px;border-radius:50%;background:rgba(37,99,235,0.45);border:2px solid #2563eb;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px;color:#1e3a8a;" contenteditable="true">A</div>
          <div style="position:absolute;bottom:0;left:0;width:110px;height:110px;border-radius:50%;background:rgba(219,39,119,0.45);border:2px solid #db2777;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px;color:#831843;" contenteditable="true">B</div>
          <div style="position:absolute;bottom:0;right:0;width:110px;height:110px;border-radius:50%;background:rgba(234,179,8,0.45);border:2px solid #eab308;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px;color:#713f12;" contenteditable="true">C</div>
          <div style="position:absolute;top:70px;left:95px;font-weight:bold;font-size:10px;color:#0f172a;" contenteditable="true">A∩B∩C</div>
        </div>
      </div><p><br/></p>
    `,
  },

  // ==================== MATRIX ====================
  {
    id: 'basic-matrix',
    category: 'matrix',
    name: 'Matriz 2x2 (FODA / Prioridad)',
    description: 'Se usa para clasificar información en cuatro cuadrantes basados en dos dimensiones o factores críticos.',
    iconName: 'layout-grid',
    previewBlocks: [
      { color: '#16a34a', label: 'Q1' },
      { color: '#2563eb', label: 'Q2' },
      { color: '#d97706', label: 'Q3' },
      { color: '#dc2626', label: 'Q4' },
    ],
    generateHtml: () => `
      <div class="word-smartart-container" data-smartart="basic-matrix" contenteditable="false" style="margin:20px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
        <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">
          📊 SmartArt: Matriz 2x2 de cuadrantes
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:440px;margin:0 auto;">
          <div style="background:#dcfce7;border:1.5px solid #16a34a;border-radius:8px;padding:12px;color:#14532d;">
            <div contenteditable="true" style="font-weight:bold;font-size:13px;outline:none;">[Fortalezas / Q1]</div>
            <div contenteditable="true" style="font-size:11px;outline:none;">• Ventaja competitiva<br/>• Capacidades clave</div>
          </div>
          <div style="background:#dbeafe;border:1.5px solid #2563eb;border-radius:8px;padding:12px;color:#1e3a8a;">
            <div contenteditable="true" style="font-weight:bold;font-size:13px;outline:none;">[Oportunidades / Q2]</div>
            <div contenteditable="true" style="font-size:11px;outline:none;">• Nuevos mercados<br/>• Expansión tecnológica</div>
          </div>
          <div style="background:#fef3c7;border:1.5px solid #d97706;border-radius:8px;padding:12px;color:#78350f;">
            <div contenteditable="true" style="font-weight:bold;font-size:13px;outline:none;">[Debilidades / Q3]</div>
            <div contenteditable="true" style="font-size:11px;outline:none;">• Limitaciones operativas<br/>• Costos altos</div>
          </div>
          <div style="background:#fee2e2;border:1.5px solid #dc2626;border-radius:8px;padding:12px;color:#7f1d1d;">
            <div contenteditable="true" style="font-weight:bold;font-size:13px;outline:none;">[Amenazas / Q4]</div>
            <div contenteditable="true" style="font-size:11px;outline:none;">• Competencia emergente<br/>• Riesgos externos</div>
          </div>
        </div>
      </div><p><br/></p>
    `,
  },

  // ==================== PYRAMID ====================
  {
    id: 'basic-pyramid',
    category: 'pyramid',
    name: 'Pirámide escalonada',
    description: 'Se usa para mostrar relaciones proporcionales o niveles de jerarquía donde la base soporta la cúspide.',
    iconName: 'triangle',
    previewBlocks: [
      { color: '#7c3aed', label: 'Cúspide' },
      { color: '#2563eb', label: 'Medio' },
      { color: '#0d9488', label: 'Base' },
    ],
    generateHtml: () => `
      <div class="word-smartart-container" data-smartart="basic-pyramid" contenteditable="false" style="margin:20px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;text-align:center;">
        <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">
          📊 SmartArt: Pirámide jerárquica
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;max-width:360px;margin:0 auto;">
          <div style="width:140px;background:#7c3aed;color:white;padding:10px;border-radius:8px 8px 0 0;font-weight:bold;font-size:12px;">
            <div contenteditable="true" style="outline:none;">NIVEL ESTRATÉGICO</div>
          </div>
          <div style="width:230px;background:#2563eb;color:white;padding:10px;font-weight:bold;font-size:12px;">
            <div contenteditable="true" style="outline:none;">NIVEL TÁCTICO</div>
          </div>
          <div style="width:320px;background:#0d9488;color:white;padding:10px;border-radius:0 0 8px 8px;font-weight:bold;font-size:12px;">
            <div contenteditable="true" style="outline:none;">NIVEL OPERATIVO Y BASE</div>
          </div>
        </div>
      </div><p><br/></p>
    `,
  },

  // ==================== PICTURE ====================
  {
    id: 'picture-accent-list',
    category: 'picture',
    name: 'Lista con imágenes destacadas',
    description: 'Se usa para presentar perfiles, productos o conceptos vinculados a una foto o ilustración gráfica.',
    iconName: 'image',
    previewBlocks: [
      { color: '#3b82f6', label: 'Item 1' },
      { color: '#10b981', label: 'Item 2' },
      { color: '#f59e0b', label: 'Item 3' },
    ],
    generateHtml: () => `
      <div class="word-smartart-container" data-smartart="picture-accent-list" contenteditable="false" style="margin:20px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
        <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">
          📊 SmartArt: Lista con imágenes / iconos
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;">
          <div style="background:white;border:1px solid #cbd5e1;border-radius:8px;padding:14px;display:flex;align-items:center;gap:12px;">
            <div style="width:48px;height:48px;background:#dbeafe;color:#2563eb;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">📷</div>
            <div>
              <div contenteditable="true" style="font-weight:bold;font-size:13px;outline:none;">[Perfil o Objeto 1]</div>
              <div contenteditable="true" style="font-size:11px;color:#64748b;outline:none;">Descripción detallada.</div>
            </div>
          </div>
          <div style="background:white;border:1px solid #cbd5e1;border-radius:8px;padding:14px;display:flex;align-items:center;gap:12px;">
            <div style="width:48px;height:48px;background:#dcfce7;color:#16a34a;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">💡</div>
            <div>
              <div contenteditable="true" style="font-weight:bold;font-size:13px;outline:none;">[Perfil o Objeto 2]</div>
              <div contenteditable="true" style="font-size:11px;color:#64748b;outline:none;">Descripción detallada.</div>
            </div>
          </div>
        </div>
      </div><p><br/></p>
    `,
  },
];

// ==================== SHAPES MATCHING IMAGE 1 ====================
export const SHAPE_ITEMS: ShapeDefinition[] = [
  // --- Recently Used ---
  {
    id: 'line',
    name: 'Línea',
    category: 'lines',
    viewBox: '0 0 24 24',
    svgInner: '<line x1="3" y1="21" x2="21" y2="3" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round"/>',
    generateHtml: () => `
      <div class="word-shape-container" contenteditable="false" style="display:inline-block;margin:10px 14px;vertical-align:middle;text-align:center;">
        <svg width="120" height="40" viewBox="0 0 120 40"><line x1="5" y1="20" x2="115" y2="20" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/></svg>
      </div>
    `,
  },
  {
    id: 'arrow-line',
    name: 'Flecha',
    category: 'lines',
    viewBox: '0 0 24 24',
    svgInner: '<line x1="3" y1="21" x2="20" y2="4" stroke="#2563eb" stroke-width="2.5"/><polygon points="21,3 14,5 19,10" fill="#2563eb"/>',
    generateHtml: () => `
      <div class="word-shape-container" contenteditable="false" style="display:inline-block;margin:10px 14px;vertical-align:middle;text-align:center;">
        <svg width="130" height="40" viewBox="0 0 130 40"><line x1="5" y1="20" x2="115" y2="20" stroke="#2563eb" stroke-width="3"/><polygon points="125,20 110,12 110,28" fill="#2563eb"/></svg>
      </div>
    `,
  },
  {
    id: 'double-arrow',
    name: 'Flecha doble',
    category: 'lines',
    viewBox: '0 0 24 24',
    svgInner: '<line x1="5" y1="19" x2="19" y2="5" stroke="#2563eb" stroke-width="2"/><polygon points="21,3 15,4 20,9" fill="#2563eb"/><polygon points="3,21 9,20 4,15" fill="#2563eb"/>',
    generateHtml: () => `
      <div class="word-shape-container" contenteditable="false" style="display:inline-block;margin:10px 14px;vertical-align:middle;text-align:center;">
        <svg width="130" height="40" viewBox="0 0 130 40"><line x1="15" y1="20" x2="115" y2="20" stroke="#2563eb" stroke-width="3"/><polygon points="125,20 110,12 110,28" fill="#2563eb"/><polygon points="5,20 20,12 20,28" fill="#2563eb"/></svg>
      </div>
    `,
  },
  {
    id: 'elbow-connector',
    name: 'Conector en ángulo',
    category: 'lines',
    viewBox: '0 0 24 24',
    svgInner: '<path d="M4 4 h10 v16" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round"/>',
    generateHtml: () => `
      <div class="word-shape-container" contenteditable="false" style="display:inline-block;margin:10px 14px;vertical-align:middle;text-align:center;">
        <svg width="80" height="80" viewBox="0 0 80 80"><path d="M10 10 h50 v60" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/></svg>
      </div>
    `,
  },

  // --- Rectangles ---
  {
    id: 'rect',
    name: 'Rectángulo',
    category: 'rectangles',
    viewBox: '0 0 24 24',
    svgInner: '<rect x="3" y="5" width="18" height="14" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;">
        <div style="min-width:140px;min-height:70px;background:#eff6ff;border:2px solid #2563eb;border-radius:2px;padding:8px 12px;display:flex;align-items:center;justify-content:center;text-align:center;color:#1e3a8a;font-weight:600;font-size:13px;" contenteditable="true">
          [Rectángulo]
        </div>
      </div>
    `,
  },
  {
    id: 'rounded-rect',
    name: 'Rectángulo redondeado',
    category: 'rectangles',
    viewBox: '0 0 24 24',
    svgInner: '<rect x="3" y="5" width="18" height="14" rx="4" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;">
        <div style="min-width:140px;min-height:70px;background:#eff6ff;border:2px solid #2563eb;border-radius:12px;padding:8px 12px;display:flex;align-items:center;justify-content:center;text-align:center;color:#1e3a8a;font-weight:600;font-size:13px;" contenteditable="true">
          [Redondeado]
        </div>
      </div>
    `,
  },
  {
    id: 'snip-corner-rect',
    name: 'Esquinas cortadas',
    category: 'rectangles',
    viewBox: '0 0 24 24',
    svgInner: '<polygon points="7,5 21,5 21,15 17,19 3,19 3,9" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;">
        <div style="min-width:140px;min-height:70px;background:#eff6ff;border:2px solid #2563eb;clip-path:polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);padding:12px;display:flex;align-items:center;justify-content:center;text-align:center;color:#1e3a8a;font-weight:600;font-size:13px;" contenteditable="true">
          [Cortado]
        </div>
      </div>
    `,
  },

  // --- Basic Shapes ---
  {
    id: 'text-box',
    name: 'Cuadro de texto [A]',
    category: 'basic',
    viewBox: '0 0 24 24',
    svgInner: '<rect x="3" y="3" width="18" height="18" rx="2" fill="#f8fafc" stroke="#64748b" stroke-dasharray="2 2" stroke-width="1.8"/><text x="12" y="16" font-size="12" font-weight="bold" fill="#2563eb" text-anchor="middle">A</text>',
    generateHtml: () => `
      <div class="word-text-box" contenteditable="false" style="display:inline-block;margin:12px 0;width:100%;max-width:320px;">
        <div style="border:1.5px dashed #3b82f6;background:#f8fafc;padding:12px;border-radius:6px;" contenteditable="true">
          <strong>Cuadro de texto:</strong> Escribe tu texto libre aquí.
        </div>
      </div>
    `,
  },
  {
    id: 'oval',
    name: 'Óvalo / Círculo',
    category: 'basic',
    viewBox: '0 0 24 24',
    svgInner: '<ellipse cx="12" cy="12" rx="9" ry="7" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;">
        <div style="width:110px;height:80px;background:#eff6ff;border:2px solid #2563eb;border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;color:#1e3a8a;font-weight:600;font-size:12px;padding:6px;" contenteditable="true">
          [Óvalo]
        </div>
      </div>
    `,
  },
  {
    id: 'triangle',
    name: 'Triángulo isósceles',
    category: 'basic',
    viewBox: '0 0 24 24',
    svgInner: '<polygon points="12,3 21,20 3,20" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;text-align:center;">
        <svg width="100" height="90" viewBox="0 0 100 90">
          <polygon points="50,6 95,84 5,84" fill="#eff6ff" stroke="#2563eb" stroke-width="3"/>
          <text x="50" y="60" text-anchor="middle" fill="#1e3a8a" font-weight="bold" font-size="12">[Triángulo]</text>
        </svg>
      </div>
    `,
  },
  {
    id: 'diamond',
    name: 'Rombo / Diamante',
    category: 'basic',
    viewBox: '0 0 24 24',
    svgInner: '<polygon points="12,3 21,12 12,21 3,12" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;text-align:center;">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <polygon points="50,5 95,50 50,95 5,50" fill="#eff6ff" stroke="#2563eb" stroke-width="3"/>
          <text x="50" y="54" text-anchor="middle" fill="#1e3a8a" font-weight="bold" font-size="12">[Rombo]</text>
        </svg>
      </div>
    `,
  },
  {
    id: 'cylinder',
    name: 'Cilindro',
    category: 'basic',
    viewBox: '0 0 24 24',
    svgInner: '<ellipse cx="12" cy="6" rx="7" ry="3" fill="#dbeafe" stroke="#2563eb" stroke-width="1.8"/><path d="M5 6 v12 c0 1.6 3.1 3 7 3 s7 -1.4 7 -3 v-12" fill="#dbeafe" stroke="#2563eb" stroke-width="1.8"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;text-align:center;">
        <svg width="90" height="100" viewBox="0 0 90 100">
          <path d="M15 20 v60 c0 10 26 10 30 10 s30 0 30 -10 v-60" fill="#eff6ff" stroke="#2563eb" stroke-width="3"/>
          <ellipse cx="45" cy="20" rx="30" ry="12" fill="#dbeafe" stroke="#2563eb" stroke-width="3"/>
          <text x="45" y="60" text-anchor="middle" fill="#1e3a8a" font-weight="bold" font-size="11">[Cilindro]</text>
        </svg>
      </div>
    `,
  },
  {
    id: 'cube',
    name: 'Cubo 3D',
    category: 'basic',
    viewBox: '0 0 24 24',
    svgInner: '<polygon points="12,2 21,7 12,12 3,7" fill="#bfdbfe" stroke="#2563eb" stroke-width="1.8"/><polygon points="3,7 12,12 12,22 3,17" fill="#93c5fd" stroke="#2563eb" stroke-width="1.8"/><polygon points="21,7 12,12 12,22 21,17" fill="#60a5fa" stroke="#2563eb" stroke-width="1.8"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;text-align:center;">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <polygon points="50,10 90,30 50,50 10,30" fill="#bfdbfe" stroke="#2563eb" stroke-width="2.5"/>
          <polygon points="10,30 50,50 50,90 10,70" fill="#93c5fd" stroke="#2563eb" stroke-width="2.5"/>
          <polygon points="90,30 50,50 50,90 90,70" fill="#60a5fa" stroke="#2563eb" stroke-width="2.5"/>
          <text x="50" y="66" text-anchor="middle" fill="#1e3a8a" font-weight="bold" font-size="11">[Cubo]</text>
        </svg>
      </div>
    `,
  },
  {
    id: 'heart',
    name: 'Corazón',
    category: 'basic',
    viewBox: '0 0 24 24',
    svgInner: '<path d="M12 21 C6 15 3 11 3 7.5 C3 4.5 5.5 2.5 8.5 2.5 C10.2 2.5 11.5 3.3 12 4.5 C12.5 3.3 13.8 2.5 15.5 2.5 C18.5 2.5 21 4.5 21 7.5 C21 11 18 15 12 21 Z" fill="#fecdd3" stroke="#e11d48" stroke-width="2"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;text-align:center;">
        <svg width="80" height="80" viewBox="0 0 24 24">
          <path d="M12 21 C6 15 3 11 3 7.5 C3 4.5 5.5 2.5 8.5 2.5 C10.2 2.5 11.5 3.3 12 4.5 C12.5 3.3 13.8 2.5 15.5 2.5 C18.5 2.5 21 4.5 21 7.5 C21 11 18 15 12 21 Z" fill="#ffe4e6" stroke="#e11d48" stroke-width="2"/>
        </svg>
      </div>
    `,
  },
  {
    id: 'lightning',
    name: 'Rayo',
    category: 'basic',
    viewBox: '0 0 24 24',
    svgInner: '<polygon points="13,2 4,13 11,13 10,22 20,10 13,10" fill="#fef08a" stroke="#ca8a04" stroke-width="2"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;text-align:center;">
        <svg width="60" height="90" viewBox="0 0 24 24">
          <polygon points="13,2 4,13 11,13 10,22 20,10 13,10" fill="#fef08a" stroke="#ca8a04" stroke-width="2"/>
        </svg>
      </div>
    `,
  },
  {
    id: 'cloud',
    name: 'Nube',
    category: 'basic',
    viewBox: '0 0 24 24',
    svgInner: '<path d="M5 18 A4 4 0 0 1 5 10 A6 6 0 0 1 17 8 A5 5 0 0 1 20 14 A4 4 0 0 1 18 18 Z" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;text-align:center;">
        <svg width="100" height="70" viewBox="0 0 24 24">
          <path d="M5 18 A4 4 0 0 1 5 10 A6 6 0 0 1 17 8 A5 5 0 0 1 20 14 A4 4 0 0 1 18 18 Z" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/>
        </svg>
      </div>
    `,
  },

  // --- Block Arrows ---
  {
    id: 'block-arrow-right',
    name: 'Flecha derecha',
    category: 'arrows',
    viewBox: '0 0 24 24',
    svgInner: '<polygon points="2,8 14,8 14,3 22,12 14,21 14,16 2,16" fill="#dbeafe" stroke="#2563eb" stroke-width="1.8"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;text-align:center;">
        <svg width="120" height="60" viewBox="0 0 24 24">
          <polygon points="2,8 14,8 14,3 22,12 14,21 14,16 2,16" fill="#dbeafe" stroke="#2563eb" stroke-width="1.5"/>
        </svg>
      </div>
    `,
  },
  {
    id: 'block-arrow-left',
    name: 'Flecha izquierda',
    category: 'arrows',
    viewBox: '0 0 24 24',
    svgInner: '<polygon points="22,8 10,8 10,3 2,12 10,21 10,16 22,16" fill="#dbeafe" stroke="#2563eb" stroke-width="1.8"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;text-align:center;">
        <svg width="120" height="60" viewBox="0 0 24 24">
          <polygon points="22,8 10,8 10,3 2,12 10,21 10,16 22,16" fill="#dbeafe" stroke="#2563eb" stroke-width="1.5"/>
        </svg>
      </div>
    `,
  },
  {
    id: 'block-arrow-bidirectional',
    name: 'Flecha doble horizontal',
    category: 'arrows',
    viewBox: '0 0 24 24',
    svgInner: '<polygon points="2,12 8,6 8,9 16,9 16,6 22,12 16,18 16,15 8,15 8,18" fill="#dbeafe" stroke="#2563eb" stroke-width="1.8"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;text-align:center;">
        <svg width="130" height="50" viewBox="0 0 24 24">
          <polygon points="2,12 8,6 8,9 16,9 16,6 22,12 16,18 16,15 8,15 8,18" fill="#dbeafe" stroke="#2563eb" stroke-width="1.5"/>
        </svg>
      </div>
    `,
  },

  // --- Equation Shapes ---
  {
    id: 'eq-plus',
    name: 'Signo más (+)',
    category: 'equation',
    viewBox: '0 0 24 24',
    svgInner: '<polygon points="9,2 15,2 15,9 22,9 22,15 15,15 15,22 9,22 9,15 2,15 2,9 9,9" fill="#dbeafe" stroke="#2563eb" stroke-width="1.8"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;text-align:center;">
        <svg width="60" height="60" viewBox="0 0 24 24"><polygon points="9,2 15,2 15,9 22,9 22,15 15,15 15,22 9,22 9,15 2,15 2,9 9,9" fill="#dbeafe" stroke="#2563eb" stroke-width="1.8"/></svg>
      </div>
    `,
  },
  {
    id: 'eq-multiply',
    name: 'Multiplicación (×)',
    category: 'equation',
    viewBox: '0 0 24 24',
    svgInner: '<path d="M4 4 L20 20 M20 4 L4 20" stroke="#2563eb" stroke-width="4" stroke-linecap="round"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;text-align:center;">
        <svg width="50" height="50" viewBox="0 0 24 24"><path d="M4 4 L20 20 M20 4 L4 20" stroke="#2563eb" stroke-width="4" stroke-linecap="round"/></svg>
      </div>
    `,
  },

  // --- Flowchart ---
  {
    id: 'fc-process',
    name: 'Proceso (Rectángulo)',
    category: 'flowchart',
    viewBox: '0 0 24 24',
    svgInner: '<rect x="3" y="6" width="18" height="12" fill="#eff6ff" stroke="#1d4ed8" stroke-width="2"/>',
    generateHtml: () => `
      <div class="word-flowchart-node" contenteditable="false" style="display:inline-block;margin:8px;padding:8px 16px;background:#eff6ff;border:2px solid #2563eb;border-radius:4px;font-size:12px;font-weight:600;color:#1e3a8a;" contenteditable="true">
        Proceso
      </div>
    `,
  },
  {
    id: 'fc-decision',
    name: 'Decisión (Rombo)',
    category: 'flowchart',
    viewBox: '0 0 24 24',
    svgInner: '<polygon points="12,3 21,12 12,21 3,12" fill="#eff6ff" stroke="#1d4ed8" stroke-width="2"/>',
    generateHtml: () => `
      <div class="word-flowchart-node" contenteditable="false" style="display:inline-block;margin:8px;text-align:center;">
        <svg width="90" height="90" viewBox="0 0 100 100">
          <polygon points="50,6 94,50 50,94 6,50" fill="#eff6ff" stroke="#2563eb" stroke-width="3"/>
          <text x="50" y="54" text-anchor="middle" fill="#1e3a8a" font-weight="bold" font-size="11">¿Decisión?</text>
        </svg>
      </div>
    `,
  },
  {
    id: 'fc-document',
    name: 'Documento',
    category: 'flowchart',
    viewBox: '0 0 24 24',
    svgInner: '<path d="M3 4 h18 v12 c-4 -3 -6 3 -9 1 c-3 -2 -6 2 -9 0 Z" fill="#eff6ff" stroke="#1d4ed8" stroke-width="1.8"/>',
    generateHtml: () => `
      <div class="word-flowchart-node" contenteditable="false" style="display:inline-block;margin:8px;text-align:center;">
        <svg width="100" height="70" viewBox="0 0 100 70">
          <path d="M5 5 h90 v46 c-20 -10 -30 10 -45 5 c-15 -6 -30 8 -45 0 Z" fill="#eff6ff" stroke="#2563eb" stroke-width="3"/>
          <text x="50" y="34" text-anchor="middle" fill="#1e3a8a" font-weight="bold" font-size="12">[Documento]</text>
        </svg>
      </div>
    `,
  },

  // --- Stars and Banners ---
  {
    id: 'star-5',
    name: 'Estrella de 5 puntas',
    category: 'stars',
    viewBox: '0 0 24 24',
    svgInner: '<polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" fill="#fef08a" stroke="#ca8a04" stroke-width="1.8"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:10px 12px;vertical-align:middle;text-align:center;">
        <svg width="70" height="70" viewBox="0 0 24 24">
          <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" fill="#fef08a" stroke="#ca8a04" stroke-width="1.8"/>
        </svg>
      </div>
    `,
  },
  {
    id: 'banner-up',
    name: 'Cinta / Banner',
    category: 'stars',
    viewBox: '0 0 24 24',
    svgInner: '<path d="M4 7 L20 7 L17 11 L20 15 L4 15 L7 11 Z" fill="#dbeafe" stroke="#2563eb" stroke-width="1.8"/>',
    generateHtml: () => `
      <div class="word-shape-box" contenteditable="false" style="display:inline-block;margin:12px;vertical-align:middle;text-align:center;">
        <div style="background:#2563eb;color:white;padding:8px 32px;clip-path:polygon(16px 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 16px 100%, 0 50%);font-weight:bold;font-size:13px;display:inline-block;" contenteditable="true">
          ★ CINTA DESTACADA ★
        </div>
      </div>
    `,
  },

  // --- Callouts ---
  {
    id: 'callout-rounded',
    name: 'Llamada redondeada',
    category: 'callouts',
    viewBox: '0 0 24 24',
    svgInner: '<path d="M4 4 h16 a3 3 0 0 1 3 3 v7 a3 3 0 0 1 -3 3 h-7 l-4 4 v-4 h-5 a3 3 0 0 1 -3 -3 v-7 a3 3 0 0 1 3 -3 Z" fill="#eff6ff" stroke="#2563eb" stroke-width="1.8"/>',
    generateHtml: () => `
      <div class="word-callout-bubble" contenteditable="false" style="display:inline-block;margin:12px 0;max-width:320px;">
        <div style="position:relative;background:#eff6ff;border:2px solid #2563eb;border-radius:12px;padding:12px 16px;color:#1e3a8a;font-size:13px;" contenteditable="true">
          ¡Escribe aquí tu comentario o bocadillo de diálogo!
          <div style="position:absolute;bottom:-10px;left:24px;width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-top:10px solid #2563eb;"></div>
        </div>
      </div>
    `,
  },
];

// ==================== SYMBOLS ====================
export const SYMBOL_ITEMS = [
  'Ω', 'π', 'µ', '∑', '√', '∞', '∫', '≈', '≠', '≤', '≥', '±', '×', '÷', '°',
  '©', '®', '™', '§', '¶', '€', '£', '¥', '$', '•', '✓', '✗', '➜', '★', '☆',
  'α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'ρ', 'σ', 'τ', 'φ', 'ω', 'Δ', '∇',
];

// ==================== WORDART PRESETS ====================
export const WORDART_PRESETS: WordArtPreset[] = [
  {
    id: 'wa-gradient-blue',
    name: 'Degradado Azul Ejecutivo',
    cssStyle: 'background: linear-gradient(135deg, #1e3a8a, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 900; font-size: 28px;',
    sampleText: 'Texto WordArt Azul',
  },
  {
    id: 'wa-sunset',
    name: 'Atardecer Cálido',
    cssStyle: 'background: linear-gradient(135deg, #ea580c, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 900; font-size: 28px;',
    sampleText: 'Texto Creativo Sunset',
  },
  {
    id: 'wa-3d-shadow',
    name: 'Relieve 3D Sólido',
    cssStyle: 'color: #1e293b; text-shadow: 2px 2px 0px #94a3b8, 4px 4px 0px #cbd5e1; font-weight: 900; font-size: 28px;',
    sampleText: 'Relieve 3D Moderno',
  },
  {
    id: 'wa-outline',
    name: 'Contorno Neón',
    cssStyle: '-webkit-text-stroke: 1.5px #2563eb; color: transparent; font-weight: 900; font-size: 28px; letter-spacing: 1px;',
    sampleText: 'Contorno Tipográfico',
  },
];

// ==================== ICONS SVG MAPPING ====================
export const ICON_SVG_PATHS: Record<string, string> = {
  'home': '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  'search': '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  'settings': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'heart': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  'star': '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  'bell': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  'lock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'shield': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  'check': '<polyline points="20 6 9 17 4 12"/>',
  'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'edit-3': '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  'briefcase': '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  'dollar-sign': '<line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  'bar-chart-3': '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  'credit-card': '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  'pie-chart': '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  'landmark': '<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  'shopping-bag': '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  'target': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  'percent': '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  'mail': '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  'message-square': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  'phone': '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  'send': '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  'inbox': '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  'at-sign': '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  'megaphone': '<path d="m3 11 18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  'laptop': '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55A1 1 0 0 1 20.38 20H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
  'smartphone': '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  'monitor': '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  'cpu': '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 14h3"/><path d="M1 9h3"/><path d="M1 14h3"/>',
  'server': '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
  'wifi': '<path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 20 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  'database': '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  'code': '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  'cloud': '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  'terminal': '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  'printer': '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  'graduation-cap': '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  'feather': '<path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/>',
  'lightbulb': '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  'atom': '<circle cx="12" cy="12" r="1"/><path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z"/><path d="M15.7 8.3c4.54-4.52 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z"/>',
  'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  'arrow-left': '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  'arrow-up': '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  'arrow-down': '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
  'activity': '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  'zap': '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  'coffee': '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>',
  'smile': '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
};
