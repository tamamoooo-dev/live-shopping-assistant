# Super Search — Documentation

Living engineering references for the project. These are **not** one-off research
notes — they evolve over time and are the source of truth for expansion decisions.

| Document | What it is | When to consult it |
|---|---|---|
| [FEASIBILITY-VALIDATION.md](FEASIBILITY-VALIDATION.md) | **Evidence-based** validation of every candidate retailer/platform — Worker-egress reachability, search tech, data quality, connector, effort, confidence, and a ✅/🟡/🔴 verdict. Includes the reproducible probe method and a revision log. | **Before deciding to build, defer, or skip any retailer.** This is the authority — decisions cite its evidence, not assumptions. |
| [EXPANSION-ROADMAP.md](EXPANSION-ROADMAP.md) | The 12-month strategic plan — tiering, effort×impact roadmap, platform multipliers, rejected retailers, and the "Future Opportunities" feature backlog (loyalty, coupons, basket optimization, price intelligence, etc.). | When planning *what* to work on next and *why* — sequencing and product direction. |

Project current-state and rules live in [../HANDOFF.md](../HANDOFF.md); milestone
history in [../HISTORY.md](../HISTORY.md).

## Maintenance rules (both documents)

1. **Update in place; never fork.** A new investigation edits the relevant rows
   here and records what changed — it does **not** create a new disconnected
   report.
2. **Do not overwrite a conclusion without new evidence.** When evidence changes,
   supersede the old row, bump the score, and add a dated line to the
   FEASIBILITY-VALIDATION revision log (§8).
3. **Feasibility beats theory.** Where the roadmap's assumptions and the validation
   evidence disagree, FEASIBILITY-VALIDATION.md wins.
4. **Reproducibility.** Every verdict is re-checkable via the §1 probe method
   (`wrangler dev --remote` egress vs residential `curl`).
