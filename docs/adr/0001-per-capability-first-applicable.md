# Rules combine per capability, top rule wins

A workflow is an ordered rule list. For each capability (and each limit), on each subject (the subscription, or one item), the highest matching rule that mentions it decides; anything no rule decides is denied. We rejected whole-rule first-match (firewall style), because one matching rule would silence unrelated rules below it, and deny-overrides (IAM/Cedar), because it makes order meaningless and forces exceptions into `unless` clauses instead of a rule placed above.

## Consequences

- Exceptions go above the general rule. A lockdown such as "payment failed: allow `payment.update`, deny `*`" goes at the top.
- The builder warns about shadowed effects (a rule above with no conditions, or identical conditions, already decides the same capability) and possible conflicts (a rule above gives the opposite answer for the same capability).
- Every trace records which rule decided each capability and which effects were overridden.
