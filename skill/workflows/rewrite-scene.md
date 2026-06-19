<required_reading>

Load the following references before beginning this workflow:

- `references/01-neurochemical-engine.md` — Cortisol / Oxytocin / Dopamine scoring rubric and diagnostic profiles
- `references/05-narrative-diagnostics.md` — Pathology scanner (continuity, foreshadowing, device misuse)
- `references/storyscope-anti-patterns.md` — Empirical AI fiction pathologies from StoryScope research
- `references/00-master-core-directives.md` — Essential principles (Logprob Override, Anti-Moralization, etc.)

Template used in this workflow:

- `templates/neuro-critique-report.md`

</required_reading>

<objective>

Take an existing scene and produce a targeted, diagnostically-driven rewrite that raises
the lowest-scoring neurochemical axis while applying all essential principles. The workflow
scores the original, identifies specific pathologies, rewrites with precision, re-scores
the result, and presents a before/after comparison explaining what changed and why.

This workflow operates at the SCENE level — a single coherent unit of narrative action.
For full-draft review without rewriting, use `workflows/review-narrative.md`. For building
a story from scratch, use `workflows/create-narrative.md`.

</objective>

<mode_awareness>

This workflow respects the 3-mode system:

- **Brainstorm Q&A (DEFAULT):** Present the scoring and pathology analysis. Discuss which
  issues to prioritize. Ask the user what matters most before rewriting.
- **Collaborative:** Score and diagnose, then present findings. Rewrite one section at a
  time, pausing for feedback on each.
- **Fast-Auto:** Score, diagnose, rewrite, re-score, and present the full comparison in
  one pass.

**Mode-switch triggers (active at all steps):**
- "Let's brainstorm" / "ask me questions" → Brainstorm Q&A
- "Let's collaborate" / "work with me" → Collaborative
- "Just go" / "auto mode" / "fast mode" → Fast-Auto
- "Pause" / "stop" → Halt and await direction

</mode_awareness>

<process>

**Step 1 — Accept Scene**

The user provides existing scene text to rewrite.

If no text is provided, ask: *"Please paste the scene you'd like me to rewrite. I'll score
it, identify what's weakest, and produce a targeted revision."*

Confirm the scope:
- Is this an isolated scene or part of a larger draft?
- Are there specific concerns the user wants addressed? (If so, factor these into the
  rewrite priorities alongside the diagnostic findings.)
- Are there elements the user wants PRESERVED? (Characters, specific dialogue, plot points
  that must remain.)

*Mode behavior:*
- **Brainstorm Q&A:** Ask clarifying questions about context and constraints.
- **Collaborative:** Ask briefly about preservation constraints. Accept the scene.
- **Fast-Auto:** Accept the scene. Infer context from the text itself.

---

**Step 2 — Initial Scoring**

Reference: `references/01-neurochemical-engine.md`

Score the ORIGINAL scene on the three neurochemical axes (1–10):

**Cortisol (Attention & Focus)**
- *Scan for:* Disruption to status quo, challenges, threats, escalating conflict, stakes
- *Evidence:* Quote specific passages that raise or fail to raise tension
- *Score:* [1–10]

**Oxytocin (Empathy & Bonding)**
- *Scan for:* Character vulnerability, relatable struggles, emotional honesty, trust-building
- *Evidence:* Quote specific passages showing connection or distance
- *Score:* [1–10]

**Dopamine (Satisfaction & Memory)**
- *Scan for:* Setups and payoffs, pattern recognition, protagonist overcoming obstacles,
  earned revelations
- *Evidence:* Quote specific passages showing reward or its absence
- *Score:* [1–10]

**Assign the Diagnostic Profile:**

| Profile | Condition |
|---|---|
| **Flatline** | All scores < 4 |
| **Stress Without Empathy** | Cortisol > 7, Oxytocin < 4 |
| **Pleasant but Stagnant** | Oxytocin > 7, Cortisol < 4 |
| **Action Without Soul** | Cortisol & Dopamine > 7, Oxytocin < 4 |
| **Optimal Transportation** | All scores > 7 |

If the scene scores "Optimal Transportation," inform the user that the scene is already
well-balanced. Ask if they still want a rewrite targeting a different goal, or offer to
review a different scene.

*Mode behavior:*
- **Brainstorm Q&A:** Present scores with evidence. Discuss: "The weakest axis is [X].
  Here's why. Does this match your sense of what's not working?"
- **Collaborative:** Present the full scoring. Pause for reaction.
- **Fast-Auto:** Score silently. Proceed to pathology identification.

---

**Step 3 — Identify Specific Pathologies**

References: `references/05-narrative-diagnostics.md`, `references/storyscope-anti-patterns.md`

Scan the original scene for structural and stylistic pathologies. For each finding, quote
the specific passage.

**3a. Narrative Device Pathologies**

| Pathology | What to Look For |
|---|---|
| **Thematic Over-Explaining** | Does the narrator explicitly state the theme, moral, or what the character "learned"? (AI does this 77% of the time.) |
| **Metaphor Exhaustion** | Are emotions conveyed exclusively through physical sensation (tightening chest, cold sweat, dimming light)? Count somatic metaphors per paragraph — flag if density exceeds 2–3 per scene without any explicitly named emotions. |
| **Vague Allusions** | Does the worldbuilding rely on generic descriptions instead of specific, named cultural touchstones? (AI uses vague allusions 72% of the time.) |

**3b. Structural Pathologies**

| Pathology | What to Look For |
|---|---|
| **False Activity** | Is the protagonist present and talking but not making choices that alter the plot? |
| **Deus Ex Machina** | Is a problem solved by coincidence, luck, or an unearned external force? |
| **Single-Track Linearity** | Does the scene follow a strict A→B→C chronological sequence with no temporal complexity? |
| **Protagonist Over-Resolution** | Does the protagonist neatly solve the problem with no loose ends or ambiguity? |
| **Moral Ambiguity Deficit** | Is the protagonist unrealistically reasonable, emotionally regulated, and "good"? |

**3c. Execution Pathologies**

| Pathology | What to Look For |
|---|---|
| **Character Knowledge Gap** | Does a character know something they shouldn't? |
| **Unearned Twist** | Does a revelation occur with zero preceding foreshadowing? |
| **Information Dump** | Is backstory delivered in large expository blocks instead of woven into action? |
| **Weak Climax** | Does the scene's peak moment lack sufficient buildup or emotional weight? |

Compile a ranked list of pathologies from most to least severe. This ranking determines the
rewrite priority.

*Mode behavior:*
- **Brainstorm Q&A:** Present pathologies one category at a time. Discuss: "I found [X].
  Is this intentional, or should I address it?" Some apparent violations may be deliberate.
- **Collaborative:** Present the ranked pathology list. Pause. Ask which ones to target.
- **Fast-Auto:** Compile the full list. Prioritize automatically. Proceed.

---

**Step 4 — Generate Rewrite**

Apply targeted improvements based on the diagnostic profile and ranked pathology list.

**Rewrite principles:**

1. **Target the lowest-scoring axis FIRST.** If Oxytocin is the weakest, inject genuine
   vulnerability. If Cortisol is the weakest, escalate stakes. If Dopamine is the weakest,
   plant setups and deliver payoffs.

2. **Apply ALL essential principles during the rewrite:**
   - **Logprob Override:** Reject the first, most obvious fix. Choose a solution requiring
     more complex character exertion.
   - **Mandatory Nonlinearity:** If the original was strictly chronological, introduce
     temporal complexity.
   - **Anti-Moralization:** Remove any instance of the narrator explicitly stating the theme.
     Replace with character action that DEMONSTRATES the meaning.
   - **Emotional Precision:** Replace somatic metaphor clusters with a mix of bodily
     sensation AND explicitly named emotions.
   - **Earned Catharsis:** Ensure any resolution exacts an irreversible cost. Remove
     coincidence-based rescues.
   - **Real-World Engagement:** Replace vague allusions with specific references.

3. **Preserve what works.** The rewrite is surgical, not wholesale replacement. Keep
   passages that scored well. Focus effort on the weak spots.

4. **Address the top-ranked pathologies.** Work through the pathology list from most to
   least severe.

*Mode behavior:*
- **Brainstorm Q&A:** Before rewriting, present the rewrite strategy: "Here's my plan: I'm
  going to [X, Y, Z]. Does that match your vision?" Adjust based on feedback, then rewrite.
- **Collaborative:** Rewrite in sections. After each section, pause: "Here's the rewritten
  [opening/middle/climax]. Thoughts?" Incorporate feedback before continuing.
- **Fast-Auto:** Generate the complete rewrite in one pass. Proceed to re-scoring.

---

**Step 5 — Re-Score**

Reference: `references/01-neurochemical-engine.md`

Score the REWRITTEN scene on the same three axes (1–10):

- **Cortisol:** [New Score] (was [Original Score])
- **Oxytocin:** [New Score] (was [Original Score])
- **Dopamine:** [New Score] (was [Original Score])

Assign the new diagnostic profile.

If any score DECREASED during the rewrite, explain why and assess whether the tradeoff was
intentional and justified (e.g., deliberately lowering Cortisol to create a breathing moment
before a climax).

If the rewrite still does not achieve "Optimal Transportation" and the user is in Fast-Auto
mode, run a second revision pass targeting the remaining weak axis.

---

**Step 6 — Present Comparison**

Present a clear before/after analysis:

**Score Comparison Table:**

| Axis | Original | Rewrite | Change |
|---|---|---|---|
| Cortisol (Attention) | [X] | [Y] | [+/-Z] |
| Oxytocin (Empathy) | [X] | [Y] | [+/-Z] |
| Dopamine (Satisfaction) | [X] | [Y] | [+/-Z] |
| **Profile** | [Original Profile] | [New Profile] | |

**What Changed and Why:**

For each significant change, explain:
1. **What was modified** — The specific passage or element
2. **Why it was modified** — Which pathology or low score drove the change
3. **What it achieves** — The intended neurochemical or structural improvement
4. **What essential principle was applied** — Which of the six principles guided the change

**Pathologies Resolved:**
List which pathologies from Step 3 were addressed and which (if any) remain.

**Remaining Opportunities:**
If the scene is not yet at "Optimal Transportation," note what further revisions could
achieve. Offer to run another rewrite pass.

*Mode behavior:*
- **Brainstorm Q&A:** Walk through the comparison. Discuss each change. Ask: "Does this
  version better match your intent?"
- **Collaborative:** Present the comparison table and explanation. Ask if the user wants
  another pass or is satisfied.
- **Fast-Auto:** Present the full comparison. If not at Optimal Transportation, state what
  a second pass would target.

</process>

<success_criteria>

The scene rewrite is complete when ALL of the following are true:

- [ ] The original scene has been scored on all three neurochemical axes with specific textual evidence
- [ ] A diagnostic profile has been assigned to the original
- [ ] Specific pathologies have been identified with quoted passages from the original
- [ ] StoryScope anti-patterns have been checked (thematic over-explaining, metaphor exhaustion, vague allusions, protagonist over-resolution, moral ambiguity deficit, single-track linearity)
- [ ] The rewrite targets the lowest-scoring axis first
- [ ] All six essential principles have been applied during the rewrite (Logprob Override, Nonlinearity, Anti-Moralization, Emotional Precision, Earned Catharsis, Real-World Engagement)
- [ ] The rewrite preserves elements that scored well — it is surgical, not wholesale
- [ ] The rewritten scene has been re-scored on the same three axes
- [ ] A before/after comparison table has been presented with scores and profile changes
- [ ] Each significant change is explained: what changed, why, what it achieves, which principle was applied
- [ ] Any score decrease is explicitly acknowledged and justified

</success_criteria>
