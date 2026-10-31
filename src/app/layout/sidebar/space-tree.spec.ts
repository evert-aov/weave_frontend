import { describe, expect, it } from 'vitest';
import { Space } from '../../core/models/space.model';
import { buildSpaceTree } from './space-tree';

function space(id: string, parentId?: string): Space {
  return { _id: id, name: id, parentId, color: 'indigo', userId: 'user' };
}

describe('space tree layout', () => {
  it('computes indentation correctly when the API returns children before their parents', () => {
    const tree = buildSpaceTree([space('course', 'semester'), space('semester', 'university'), space('university')]);
    expect(tree.map(node => node._id)).toEqual(['university']);
    expect(tree[0].level).toBe(0);
    expect(tree[0].children?.[0].level).toBe(1);
    expect(tree[0].children?.[0].children?.[0].level).toBe(2);
  });

  it('does not change the shared list and keeps orphaned spaces visible', () => {
    const source = [space('orphan', 'missing'), space('root')];
    const tree = buildSpaceTree(source);
    expect(tree.map(node => node._id)).toEqual(['orphan', 'root']);
    expect(source[0].children).toBeUndefined();
    expect(source[0].level).toBeUndefined();
  });
});
