import { describe, it, expect } from 'vitest';
import type { Note } from '../../../core/models/note.model';
import { retainWordSessions } from './word-sessions';
const doc = (id: string, docType: Note['docType'] = 'doc') => ({ _id:id, docType } as Note);
describe('bounded Word sessions', () => {
  it('retains Word while visiting another editor and updates the current input without duplicating it', () => {
    const first = doc('a'); const open = new Set(['a','b']);
    const cached = retainWordSessions([], first, open);
    expect(retainWordSessions(cached, doc('b','sheet'), open)[0]).toBe(first);
    const refreshed = { ...first, title:'Renamed' };
    expect(retainWordSessions(cached, refreshed, open)).toEqual([refreshed]);
  });
  it('keeps two recent editors and releases closed tabs', () => {
    const open = new Set(['a','b','c']);
    const cached = retainWordSessions([doc('a'),doc('b')], doc('c'), open);
    expect(cached.map(note => note._id)).toEqual(['b','c']);
    expect(retainWordSessions(cached, doc('c'), new Set(['b']))).toEqual([doc('b')]);
    expect(retainWordSessions(cached, null, new Set())).toEqual([]);
  });
});
