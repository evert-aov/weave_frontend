import { Space } from '../../core/models/space.model';

/** Reconstruye niveles después de enlazar el árbol, independientemente del orden de la API. */
export function buildSpaceTree(spaces: readonly Space[]): Space[] {
  const nodes = new Map(spaces.map(space => [space._id, { ...space, children: [] as Space[], level: 0 }]));
  const roots: Space[] = [];
  for (const space of spaces) {
    const node = nodes.get(space._id)!;
    const parent = space.parentId ? nodes.get(space.parentId.toString()) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const assignLevels = (branch: Space[], level: number): void => {
    for (const space of branch) {
      space.level = level;
      assignLevels(space.children ?? [], level + 1);
    }
  };
  assignLevels(roots, 0);
  return roots;
}
