"""Token-budget packer — hand-port of packer.dfy's Pack method.

The Dafny file is the specification; this module must match it
observably. The property test (test_packer.py) samples that agreement
and the packer's own contract.
"""


def pack(costs, budget):
    """Greedily pack items (in order) into a token budget.

    Returns (selected_indices, total). Contract (mirrors packer.dfy):
    total <= budget; indices are valid and strictly increasing;
    total == sum(costs[i] for i in selected_indices).
    """
    sel = []
    total = 0
    for k, cost in enumerate(costs):
        if total + cost <= budget:
            sel.append(k)
            total += cost
    return sel, total
