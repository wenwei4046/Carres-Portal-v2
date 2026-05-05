import { describe, it, expect } from 'vitest';
import {
  SOP_STANDARD,
  SOP_SOFA_SPECIAL,
  SUPPLIER_SOP,
  sopFor,
  type SopDef,
  type LogisticsStageV3,
} from './sops';

describe('SUPPLIER_SOP / sopFor', () => {
  it('all SUPPLIER_SOP entries resolve via sopFor', () => {
    expect(sopFor('nice-future', 'mattress')).toBe(SOP_STANDARD);
    expect(sopFor('hookka', 'sofa')).toBe(SOP_SOFA_SPECIAL);
    expect(sopFor('hookka', 'bedframe')).toBe(SOP_STANDARD);
  });

  it('sopFor throws on unknown supplier', () => {
    expect(() => sopFor('unknown', 'sofa')).toThrow(/No SOP for supplier/);
  });

  it('sopFor throws on byCategory miss', () => {
    expect(() => sopFor('hookka', 'unknown_category')).toThrow(/No SOP for/);
  });

  // Sanity: the SUPPLIER_SOP constant itself contains both fixed-SOP and
  // byCategory variants — guards against accidental flattening of the map.
  it('SUPPLIER_SOP contains both shapes (fixed SOP + byCategory)', () => {
    expect(SUPPLIER_SOP['nice-future']).toBe(SOP_STANDARD);
    const hookka = SUPPLIER_SOP['hookka'];
    expect(hookka).toBeDefined();
    expect(hookka && 'byCategory' in hookka).toBe(true);
  });
});

describe('SOP shape invariants', () => {
  const sops: Array<[string, SopDef]> = [
    ['SOP_STANDARD', SOP_STANDARD],
    ['SOP_SOFA_SPECIAL', SOP_SOFA_SPECIAL],
  ];

  it.each(sops)('%s starts with awaiting_logistics_action', (_name, sop) => {
    expect(sop.stages[0]).toBe<LogisticsStageV3>('awaiting_logistics_action');
  });

  it.each(sops)('%s ends with delivered', (_name, sop) => {
    expect(sop.stages[sop.stages.length - 1]).toBe<LogisticsStageV3>('delivered');
  });

  it.each(sops)('%s transitions form a DAG (no cycles reachable)', (_name, sop) => {
    // For each starting stage, follow every outgoing transition path —
    // visited set must never see the same stage twice along any path.
    const adjacency = new Map<LogisticsStageV3, LogisticsStageV3[]>();
    for (const t of sop.transitions) {
      const tos = adjacency.get(t.from) ?? [];
      tos.push(t.to);
      adjacency.set(t.from, tos);
    }

    const visit = (node: LogisticsStageV3, path: Set<LogisticsStageV3>): void => {
      if (path.has(node)) {
        throw new Error(`Cycle detected at ${node} (path: ${[...path].join(' -> ')})`);
      }
      const next = adjacency.get(node) ?? [];
      const newPath = new Set(path);
      newPath.add(node);
      for (const child of next) visit(child, newPath);
    };

    for (const stage of sop.stages) {
      expect(() => visit(stage, new Set())).not.toThrow();
    }
  });

  it.each(sops)('%s every transition.from is in stages', (_name, sop) => {
    for (const t of sop.transitions) {
      expect(sop.stages).toContain(t.from);
    }
  });

  it.each(sops)('%s every transition.to is in stages', (_name, sop) => {
    for (const t of sop.transitions) {
      expect(sop.stages).toContain(t.to);
    }
  });

  it.each(sops)('%s every transition.rpc is a non-empty string', (_name, sop) => {
    for (const t of sop.transitions) {
      expect(typeof t.rpc).toBe('string');
      expect(t.rpc.length).toBeGreaterThan(0);
    }
  });

  it('SOP_SOFA_SPECIAL allows two transitions from awaiting_logistics_action via receive RPC', () => {
    const matches = SOP_SOFA_SPECIAL.transitions.filter(
      t => t.from === 'awaiting_logistics_action' && t.rpc === 'logistics_receive_po_with_do'
    );
    expect(matches).toHaveLength(2);
    const tos = matches.map(t => t.to).sort();
    expect(tos).toEqual(['ready_to_dispatch', 'waiting']);
  });
});
