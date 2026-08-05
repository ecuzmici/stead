# Machine layer

Agents own this tree. **Humans never review it.** It can be as big and
noisy as agents need; the human-facing contract lives entirely in
`/GUARANTEES.md`, and the two are related by `stead check`, not by
anyone reading this directory.

| Subtree | Contents | Regenerable? |
|---------|----------|--------------|
| `tickets/` | Agent-facing work decomposition (`decompose-work`) | yes |
| `lemmas/` | Reusable proved facts (`lemma-librarian`) | yes |
| `failures/` | Minimized counterexamples (`counterexample-curator`) | yes |
| `transcripts/` | Raw agent session logs | yes |
| `decisions/` | Signed decision requests, `DR-###.md` | **NO — durable trace of human intent** |

Everything here except `decisions/` may be deleted and regenerated at
any time. Never garbage-collect `decisions/`.
