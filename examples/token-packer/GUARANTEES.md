# GUARANTEES — token-packer example

E1  pack() never exceeds the token budget, for every possible input.  OPEN
E2  pack() is greedy, order-preserving, duplicate-free, and exact-totaled on sampled inputs.  SAMPLED

## Given

## Out of scope
Packing optimality (greedy is the spec, not the best possible fill);
performance.
