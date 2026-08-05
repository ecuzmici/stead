"""Property test for pack() — anchor for E2 (SAMPLED tier).

Stdlib only, fixed seed: the anchor must be deterministic (Stead S1
applies transitively to every anchored check).
"""
import random
import sys

from packer import pack

rng = random.Random(0x57EAD)

for case in range(2000):
    n = rng.randrange(0, 40)
    costs = [rng.randrange(0, 500) for _ in range(n)]
    budget = rng.randrange(0, 3000)

    sel, total = pack(costs, budget)

    # Never exceeds the budget.
    assert total <= budget, (costs, budget, sel, total)
    # Valid, strictly increasing indices — each item at most once, order kept.
    assert all(0 <= i < n for i in sel), (costs, budget, sel)
    assert all(a < b for a, b in zip(sel, sel[1:])), (costs, budget, sel)
    # Total is exactly the cost of the selection.
    assert total == sum(costs[i] for i in sel), (costs, budget, sel, total)
    # Greedy: an item is skipped only when it would not have fit at its turn.
    running = 0
    chosen = set(sel)
    for k, c in enumerate(costs):
        if k in chosen:
            running += c
        else:
            assert running + c > budget, (costs, budget, sel, k)
    # Deterministic.
    assert pack(costs, budget) == (sel, total)

print("token-packer properties: ok (2000 cases)")
sys.exit(0)
