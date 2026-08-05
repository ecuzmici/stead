// Token-budget packer — the canonical Stead demo of a HOLDS-tier module.
// Verify with: dafny verify packer.dfy
// Compile to Python with: dafny build --target:py packer.dfy
// Toolchain: Dafny 4.x. The core stead CLI has zero Dafny dependency;
// this example is optional.

// Sum of the selected items' costs.
function SumOf(costs: seq<nat>, sel: seq<nat>): nat
  requires forall i :: 0 <= i < |sel| ==> sel[i] < |costs|
{
  if |sel| == 0 then 0
  else SumOf(costs, sel[..|sel| - 1]) + costs[sel[|sel| - 1]]
}

// Greedily pack items (in order) into a token budget.
method Pack(costs: seq<nat>, budget: nat) returns (sel: seq<nat>, total: nat)
  // E1: the packed total never exceeds the budget.
  ensures total <= budget
  // Selection is a set of valid, strictly increasing indices (each item
  // at most once, original order preserved).
  ensures forall i :: 0 <= i < |sel| ==> sel[i] < |costs|
  ensures forall i, j :: 0 <= i < j < |sel| ==> sel[i] < sel[j]
  // The reported total is exactly the cost of what was selected.
  ensures total == SumOf(costs, sel)
{
  sel := [];
  total := 0;
  var k := 0;
  while k < |costs|
    invariant 0 <= k <= |costs|
    invariant total <= budget
    invariant forall i :: 0 <= i < |sel| ==> sel[i] < k
    invariant forall i, j :: 0 <= i < j < |sel| ==> sel[i] < sel[j]
    invariant total == SumOf(costs, sel)
  {
    if total + costs[k] <= budget {
      assert (sel + [k])[..|sel|] == sel;
      sel := sel + [k];
      total := total + costs[k];
    }
    k := k + 1;
  }
}
