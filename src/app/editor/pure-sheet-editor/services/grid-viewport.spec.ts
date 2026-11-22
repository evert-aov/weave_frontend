import { GridAxis } from './grid-viewport';

describe('Sparse grid viewport', () => {
  it('bounds the rendered window even for Excel maximum dimensions', () => {
    const axis = new GridAxis(1048576, 24, { 100: 48, 900000: 72 });
    expect(axis.window(0, 600, 6).indices.length).toBeLessThan(40);
    const far = axis.window(axis.offset(900000), 600, 6);
    expect(far.indices).toContain(900000);
    expect(far.indices.length).toBeLessThan(45);
    expect(far.before + far.after + axis.offset(far.indices.at(-1)! + 1) - axis.offset(far.indices[0])).toBe(axis.offset(1048576));
  });
  it('maps resized rows/columns to positions and clamps at sheet boundaries', () => {
    const axis = new GridAxis(10, 20, { 1: 60, 4: 10 });
    expect(axis.offset(2)).toBe(80);
    expect(axis.indexAt(79)).toBe(1);
    expect(axis.indexAt(80)).toBe(2);
    expect(axis.window(-100, 20, 2).indices[0]).toBe(0);
    expect(axis.window(999999, 100, 2).indices.at(-1)).toBe(9);
  });

  it('assigns zero size to hidden indices and maps coordinates to adjacent visible bands', () => {
    const axis = new GridAxis(6, 20, { 1: 40 }, [1, 2]);
    expect(axis.isHidden(1)).toBe(true);
    expect(axis.isHidden(2)).toBe(true);
    expect(axis.offset(1)).toBe(20);
    expect(axis.offset(3)).toBe(20);
    expect(axis.indexAt(19)).toBe(0);
    expect(axis.indexAt(20)).toBe(3);
  });
});
