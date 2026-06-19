<required_reading>

Load the following references before beginning this workflow:

- `references/01-neurochemical-engine.md` — Cortisol / Oxytocin / Dopamine scoring rubric and diagnostic profiles
- `references/04-agency-enforcement.md` — Want→Decision→Action→Consequence cycle, false-activity filter
- `references/05-narrative-diagnostics.md` — Pathology scanner (continuity, foreshadowing, device misuse)
- `references/storyscope-anti-patterns.md` — Empirical AI fiction pathologies from StoryScope research

Template used in this workflow:

- `templates/neuro-critique-report.md`

</required_reading>

<objective>

Review and diagnose existing narrative text — whether user-authored or AI-generated — using
the full diagnostic suite. The workflow scores the text on three neurochemical axes,
scans for structural pathologies, verifies protagonist agency, and produces a report with
specific, actionable rewrite directives.

This is a diagnostic workflow. It does NOT generate new narrative text (use
`workflows/rewrite-scene.md` for targeted rewrites, or `workflows/create-narrative.md`
for full drafts).

</objective>

<mode_awareness>

This workflow is primarily analytical. Mode affects the level of interactivity:

- **Brainstorm Q&A (DEFAULT):** Walk through each diagnostic dimension with the user,
  discussing findings as they emerge. Ask clarifying questions about authorial intent before
  finalizing the diagnosis.
- **Collaborative:** Present findings one section at a time (scoring, then diagnostics,
  then agency). Pause for user reaction at each stage.
- **Fast-Auto:** Run the complete diagnostic suite silently. Present the full report in
  one pass with all findings and rewrite directives.

**Mode-switch triggers (active at all steps):**
- "Let's brainstorm" / "ask me questions" → Brainstorm Q&A
- "Let's collaborate" / "work with me" → Collaborative
- "Just go" / "auto mode" / "fast mode" → Fast-Auto
- "Pause" / "stop" → Halt and await direction

</mode_awareness>

<process>

**Step 1 — Accept Input**

The user provides the text to review. This can be:
- A single scene
- A chapter
- A complete draft
- A fragment or passage

If no text is provided, ask: *"Please paste or describe the text you'd like me to review.
It can be a scene, chapter, or full draft."*

Note the length and scope of the input — this determines granularity of the analysis.
For a single scene: provide line-level feedback. For a full draft: provide scene-level and
act-level feedback.

---

**Step 2 — Neurochemical Scoring**

Reference: `references/01-neurochemical-engine.md`

Score the text on three biological axes from 1–10. For each axis, identify SPECIFIC textual
triggers — quote or reference the exact passages that drove the score.

**Axis 1: Cortisol Score (Attention & Focus)**
- *Scan for:* Clear disruption to the status quo. Distinct challenges, physical threats,
  escalating interpersonal conflicts. Uncertainty and stakes.
- *High Score (7–10):* The audience is alert; critical information is being processed.
- *Low Score (1–3):* The scene lacks tension. Nothing is at risk.
- *Evidence:* Quote specific passages that raise or fail to raise cortisol.

**Axis 2: Oxytocin Score (Empathy & Bonding)**
- *Scan for:* Genuine character vulnerability. Relatable struggles. Emotional honesty.
  Trust-building moments. Authentic interpersonal connection.
- *High Score (7–10):* The audience feels bonded to the characters.
- *Low Score (1–3):* Characters feel distant, mechanical, or emotionally guarded.
- *Evidence:* Quote specific passages showing vulnerability or its absence.

**Axis 3: Dopamine Score (Satisfaction & Memory)**
- *Scan for:* Setups and payoffs. Pattern recognition. Protagonist overcoming an obstacle.
  Revelations that recontextualize earlier information. Earned surprises.
- *High Score (7–10):* The narrative feels psychologically rewarding.
- *Low Score (1–3):* Events feel random, unearned, or frustrating.
- *Evidence:* Quote specific passages showing payoff or its absence.

**Assign the Diagnostic Profile:**

| Profile | Condition | Meaning |
|---|---|---|
| **Flatline** | All scores < 4 | No momentum, no empathy, no reward |
| **Stress Without Empathy** | Cortisol > 7, Oxytocin < 4 | Tense but hollow |
| **Pleasant but Stagnant** | Oxytocin > 7, Cortisol < 4 | Warm but boring |
| **Action Without Soul** | Cortisol & Dopamine > 7, Oxytocin < 4 | Thrilling but mechanical |
| **Optimal Transportation** | All scores > 7 | Balanced engagement — the target |

*Mode behavior:*
- **Brainstorm Q&A:** Present the scores one axis at a time. For each, quote the evidence.
  Ask: "Does this reading match your intent for this scene?"
- **Collaborative:** Present all three scores together with evidence. Pause for reaction.
- **Fast-Auto:** Score silently. Include in the final report.

---

**Step 3 — Narrative Diagnostics**

References: `references/05-narrative-diagnostics.md`, `references/storyscope-anti-patterns.md`

Scan the text for structural pathologies. For each finding, provide the specific
line/paragraph reference.

**3a. Continuity and Temporal Integrity**
- **Character Knowledge Gaps:** Does any character possess information they never narratively
  acquired? (Critical when nonlinear structures are in use.)
- **Rule Breaking:** Are the established rules of the story's reality (physics, magic,
  worldbuilding) maintained consistently?
- **Temporal Tracking:** Do flashbacks and time jumps create any conflicting or overlapping
  events?

**3b. Foreshadowing and Dopamine**
- **Chekhov's Gun Enforcement:** Is any critical object, skill, or revelation used in the
  climax that was NOT foreshadowed earlier?
- **Pattern Recognition:** Does any major twist or plot pivot have zero preceding clues?
  (Unearned twists deny the audience dopamine.)
- **Dangling Setups:** Are there planted elements that are never paid off?

**3c. StoryScope Anti-Pattern Scan**
Flag any of the following AI-specific pathologies:

| Anti-Pattern | Marker | StoryScope Data |
|---|---|---|
| **Thematic Over-Explaining** | Narrator explicitly states the theme or lesson | AI: 77% vs. Human: 23% |
| **Metaphor Exhaustion** | Emotion conveyed exclusively through physical sensation | AI over-indexes on somatic metaphors |
| **Vague Allusions** | Generic worldbuilding without specific cultural references | AI: 72% vague vs. Human: more specific |
| **Protagonist Over-Resolution** | Main character neatly solves every thread | AI: 69% vs. Human: 46% |
| **Moral Ambiguity Deficit** | Protagonist is reasonable, regulated, always "good" | AI: 38% ambiguous vs. Human: 59% |
| **Single-Track Linearity** | Strict chronological sequence, no temporal complexity | Human authors use 2–3× more temporal complexity |

For each anti-pattern detected, quote the specific passage and explain the violation.

*Mode behavior:*
- **Brainstorm Q&A:** Present each category of findings. Discuss authorial intent — some
  "violations" may be deliberate. Ask before flagging as an issue.
- **Collaborative:** Present diagnostic findings grouped by severity. Pause for feedback.
- **Fast-Auto:** Include all findings in the final report.

---

**Step 4 — Agency Enforcement Check**

Reference: `references/04-agency-enforcement.md`

Verify protagonist agency throughout the text:

**4a. The Macro/Micro Rule**
- **Macro Agency:** Does the protagonist's choices drive the overarching trajectory?
- **Micro Spontaneity:** Are atmospheric, reflective, or comedic scenes appropriately placed
  without stalling momentum?

**4b. The Cycle of Momentum**
For each plot-advancing scene, verify the chain:
**Want** → **Decision** → **Action** → **Consequence**

Flag any scene where the protagonist:
- Merely observes unfolding events
- Waits for external clarity
- Reacts endlessly without initiating

**4c. The False Activity Filter**
Does the protagonist APPEAR active but fail to influence the plot?
- Present in every scene? ✓
- Majority of dialogue? ✓
- Complex emotional turmoil? ✓
- **But do their specific choices change the plot's trajectory?** ← This is the test.

**4d. Consequence and Coincidence**
- Are there irreversible consequences for key decisions?
- **The Pixar Axiom:** Coincidences INTO trouble = encouraged. Coincidences OUT of trouble
  = prohibited. Flag any deus ex machina.

**4e. The StoryScope Anomaly**
- Is the protagonist forced to resolve every thread? Flag if the ending is 100%
  protagonist-solved with no external fates or ambiguity.

*Mode behavior:*
- **Brainstorm Q&A:** Walk through agency findings with the user. Ask about authorial intent
  for passive moments.
- **Collaborative:** Present agency findings as a single section. Pause.
- **Fast-Auto:** Include in the final report.

---

**Step 5 — Generate Report**

Template: `templates/neuro-critique-report.md`

Compile all findings into a structured report:

1. **Summary** — Overall assessment in 2–3 sentences
2. **Neurochemical Scores** — The three axes with evidence
3. **Diagnostic Profile** — Which of the five profiles the text matches
4. **Pathology Findings** — Each issue with line/paragraph reference and severity
5. **Agency Assessment** — Pass/fail on each agency check
6. **Anti-Pattern Flags** — StoryScope violations with evidence

All findings must reference specific lines or paragraphs in the input text. Vague critiques
("the pacing is off") are prohibited — every critique must point to a concrete passage.

---

**Step 6 — Rewrite Directives**

Every review MUST end with actionable rewrite prompts. These are NOT vague suggestions —
they are specific, executable instructions targeting the lowest-scoring axis.

Provide 3–5 rewrite directives, each containing:

1. **Target:** Which passage or section to rewrite
2. **Problem:** What specific pathology or low score drives the rewrite
3. **Directive:** An explicit instruction (e.g., *"Rewrite this dialogue block to expose the
   protagonist's underlying fear of abandonment, raising the Oxytocin score"*)
4. **Expected Impact:** Which axis/score this should improve and by how much

The agent must never simply complain about a low score. Every critique ends with a specific,
actionable prompt forcing the narrative back into alignment.

*Mode behavior:*
- **Brainstorm Q&A:** Present each directive individually. Discuss priority and feasibility.
  Ask which the user wants to tackle first.
- **Collaborative:** Present all directives. Offer to execute any of them immediately (this
  would transition to `workflows/rewrite-scene.md`).
- **Fast-Auto:** Present the full report with directives. State which directive would have
  the highest impact.

</process>

<success_criteria>

The review is complete when ALL of the following are true:

- [ ] The text has been scored on all three neurochemical axes (Cortisol, Oxytocin, Dopamine) with specific textual evidence for each score
- [ ] A diagnostic profile has been assigned (Flatline, Stress Without Empathy, Pleasant but Stagnant, Action Without Soul, or Optimal Transportation)
- [ ] Continuity, foreshadowing, and narrative device pathologies have been scanned with line/paragraph references
- [ ] StoryScope anti-patterns have been explicitly checked (thematic over-explaining, metaphor exhaustion, vague allusions, protagonist over-resolution, moral ambiguity deficit, single-track linearity)
- [ ] Protagonist agency has been verified through the Want→Decision→Action→Consequence chain
- [ ] False activity has been checked — character centrality is distinguished from character agency
- [ ] The report has been generated using `templates/neuro-critique-report.md`
- [ ] 3–5 specific, actionable rewrite directives have been provided, each targeting a concrete passage
- [ ] No critique is vague — every finding points to a specific passage in the text

</success_criteria>
