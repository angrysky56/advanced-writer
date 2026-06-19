<required_reading>

Load the following references before beginning this workflow:

- `references/02-structural-paradigms.md` — Truby, Dramatica, Kishōtenketsu, Fichtean frameworks with anti-pathology directives
- `references/00-master-core-directives.md` — Supreme directives (Logprob Override, Entropy Mandate, Earned Catharsis)

Template used in this workflow:

- `templates/story-architecture-brief.md`

</required_reading>

<objective>

Help the user select the optimal structural paradigm for their narrative, then produce an
architecture skeleton using that framework. The workflow moves through diagnostic
questioning, framework recommendation, alternative comparison, and architecture output.

This workflow is designed to be used standalone (when a user asks "what structure should I
use?") or can be invoked by `workflows/create-narrative.md` at Step 4.

</objective>

<mode_awareness>

This workflow respects the 3-mode system:

- **Brainstorm Q&A (DEFAULT):** Ask diagnostic questions to understand the story's core
  driver. Present framework recommendations with full rationale. Discuss alternatives.
- **Collaborative:** Present the diagnostic questions as a brief checklist. Recommend a
  framework, pause for approval, then generate the architecture skeleton.
- **Fast-Auto:** Analyze the story description, select the framework, generate the
  architecture skeleton. Present the result with rationale.

**Mode-switch triggers (active at all steps):**
- "Let's brainstorm" / "ask me questions" → Brainstorm Q&A
- "Let's collaborate" / "work with me" → Collaborative
- "Just go" / "auto mode" / "fast mode" → Fast-Auto
- "Pause" / "stop" → Halt and await direction

</mode_awareness>

<process>

**Step 1 — Intake**

Reference: `references/02-structural-paradigms.md`

Understand what the user is working with:
- Do they have a logline, premise, or existing draft?
- Do they already have a structural intuition ("I think it should be three acts" or "I want
  something nontraditional")?
- What is the story's core driver — character flaw, external conflict, multiple perspectives,
  or emotional atmosphere?

*Mode behavior:*
- **Brainstorm Q&A:** Ask: *"Tell me about your story. What's the core idea? Don't worry
  about structure yet — I want to understand what drives this narrative."*
- **Collaborative:** Ask for a brief logline or premise. Accept what is given.
- **Fast-Auto:** Extract the story driver from whatever the user has provided. Proceed.

---

**Step 2 — Diagnostic Questions**

Ask targeted questions to identify which framework best serves the story. The agent should
determine the answers to these questions either through direct inquiry (Brainstorm) or
inference (Fast-Auto):

**Question 1: Is this story driven by a character's internal flaw?**
- Does the protagonist have a deep psychological weakness that causes harm to others?
- Is the story fundamentally about the protagonist wrestling with (and possibly overcoming
  or being destroyed by) this flaw?
- → If YES: Strong match for **Truby's Organic Architecture**

**Question 2: Does this story require multiple perspectives or an objective/subjective split?**
- Is the "protagonist" (objective story driver) different from the "main character"
  (subjective audience lens)?
- Are there four or more distinct throughlines that must be interwoven?
- → If YES: Strong match for **Dramatica Theory**

**Question 3: Does this story achieve its emotional impact without adversarial combat?**
- Is there no clear antagonist or enemy?
- Does the story rely on atmosphere, philosophical juxtaposition, or the recontextualization
  of familiar elements?
- → If YES: Strong match for **Kishōtenketsu**

**Question 4: Is the goal relentless tension from the first page to the last?**
- Should the story start in media res?
- Is the plot structured as escalating crises with backstory woven into reactions?
- → If YES: Strong match for **Fichtean Curve**

**Disqualification check:** If the user's instinct is "Save the Cat!" or a generic
three-act structure, gently redirect:

*"Save the Cat! can produce highly predictable narratives when followed dogmatically. Let me
show you frameworks that are specifically designed to avoid that predictability while still
giving you structural rigor."*

*Mode behavior:*
- **Brainstorm Q&A:** Ask these as conversational questions, 1–2 at a time. Use the
  user's answers to narrow the field. Follow up on ambiguity.
- **Collaborative:** Present all four questions as a checklist. Let the user answer.
  Recommend based on responses.
- **Fast-Auto:** Answer all four questions based on available context. Select the framework.

---

**Step 3 — Present Recommendation**

Present the matched framework with comprehensive detail:

**For Truby's Organic Architecture:**
- **When to use:** The story is rooted in a protagonist's internal flaw (hamartia)
- **Key principle:** Before plotting, define the psychological flaw AND the moral weakness
  (how the flaw hurts others)
- **Key beats:**
  1. Weakness/Need — Establish the flaw and its collateral damage
  2. Desire — The protagonist's concrete, measurable goal
  3. Opponent — Shadow-matched antagonist competing for the same desire
  4. Plan — The protagonist's strategy (which will be wrong because of the flaw)
  5. Battle — The crucible that forces confrontation with the flaw
  6. Self-Revelation — Recognition of the hamartia (shown, never stated)
  7. New Equilibrium — The world reshaped by the protagonist's transformation or failure
- **Anti-pathology:** Do NOT have the narrator explain what the character learned

**For Dramatica Theory:**
- **When to use:** Complex narratives with multiple perspectives and throughlines
- **Key principle:** Separate the Protagonist (objective driver) from the Main Character
  (subjective lens)
- **Key beats:**
  1. Overall Story Throughline — The external plot everyone is involved in
  2. Main Character Throughline — The internal journey of the subjective lens
  3. Influence Character Throughline — The character who challenges the MC's worldview
  4. Relationship Story Throughline — The evolving dynamic between MC and Influence Character
- **Anti-pathology:** Do NOT collapse all throughlines into a single-track narrative

**For Kishōtenketsu:**
- **When to use:** Stories that achieve resonance through juxtaposition, not combat
- **Key principle:** Build profound emotional impact without adversarial conflict
- **Key beats:**
  1. Ki (Introduction) — Establish the baseline reality
  2. Shō (Development) — Deepen the baseline without disruption
  3. Ten (Twist) — Introduce an unexpected element that recontextualizes everything
  4. Ketsu (Conclusion) — Philosophically harmonize the original and the twist
- **Anti-pathology:** The "Ten" is NOT an explosion or battle — it is a shift in perspective

**For Fichtean Curve:**
- **When to use:** Thrillers, high-tension narratives, stories that demand relentless pace
- **Key principle:** Skip formal exposition; plunge into crisis from the first page
- **Key beats:**
  1. In Media Res opening — Crisis from sentence one
  2. Escalating Crises (roughly 2/3 of the story) — Each crisis more intense than the last
  3. Backstory woven into reactions — Essential history revealed through character behavior
     under pressure, not exposition dumps
  4. Climax — The accumulated crises converge
  5. Falling Action — Brief; the story doesn't linger
- **Anti-pathology:** Do NOT pause for exposition dumps. Backstory is embedded in action.

Include the rationale for WHY this framework matches the story's core driver.

*Mode behavior:*
- **Brainstorm Q&A:** Present the recommendation in full. Explain the reasoning. Ask:
  "Does this feel right for what you're building?"
- **Collaborative:** Present the recommendation. Pause for approval before proceeding.
- **Fast-Auto:** State the selection with rationale. Proceed to alternatives.

---

**Step 4 — Alternative Options**

Present 1–2 alternative frameworks showing how the SAME story could be told differently.
The value is in the contrast — helping the user see their story from multiple angles.

For each alternative:
- State which framework it is
- Explain what would CHANGE about the story under this framework
- Identify what would be GAINED and what would be LOST compared to the primary recommendation
- Give a concrete example of how a key scene or beat would differ

This is NOT about making the user doubt the recommendation. It is about deepening their
understanding of structural choice.

*Mode behavior:*
- **Brainstorm Q&A:** Present each alternative with a question: "Could you see your story
  working this way instead?" Discuss the tradeoffs.
- **Collaborative:** Present alternatives briefly. Let the user choose.
- **Fast-Auto:** List alternatives with brief rationale. Proceed with the primary selection.

---

**Step 5 — Output Architecture Skeleton**

Template: `templates/story-architecture-brief.md`

Using the selected framework, produce a framework-specific act/beat breakdown:

1. **Framework Identification** — Which paradigm and why
2. **Act/Beat Structure** — Every major structural unit with:
   - The beat's function in the story
   - The narrative content (what happens)
   - The neurochemical target (which axis is prioritized: Cortisol, Oxytocin, Dopamine)
3. **Anti-Pathology Directives Applied:**
   - Where nonlinearity will be introduced (time jumps, flashbacks, parallel threads)
   - Where subplot integration occurs
   - Where ambiguous endings or external fates are permitted
4. **Agency Checkpoints** — Which beats require protagonist Want→Decision→Action→Consequence
   and which are authorized for atmospheric immersion
5. **Foreshadowing Map** — What must be planted early for the climax to feel earned

The architecture skeleton is a planning document, not a draft. It should be detailed enough
that a writer (human or AI) could use it as a blueprint to generate the narrative.

*Mode behavior:*
- **Brainstorm Q&A:** Walk through the skeleton beat by beat. Ask for input on key decisions
  (e.g., "Where should the main flashback occur?").
- **Collaborative:** Generate the full skeleton. Pause for review. Adjust based on feedback.
- **Fast-Auto:** Generate the complete skeleton in one pass. Present with the framework
  rationale.

</process>

<success_criteria>

The framework selection is complete when ALL of the following are true:

- [ ] The story's core driver has been identified (character flaw, multiple perspectives, atmospheric resonance, or relentless tension)
- [ ] A specific structural paradigm has been selected with explicit rationale — NOT "Save the Cat!" or generic three-act
- [ ] The recommendation includes the full beat structure for the chosen framework
- [ ] 1–2 alternatives have been presented showing how the story would differ under other frameworks
- [ ] The architecture skeleton has been generated using `templates/story-architecture-brief.md`
- [ ] Anti-pathology directives are applied: nonlinearity planned, subplot integration marked, ambiguous endings permitted
- [ ] The Kishōtenketsu "Ten" is a perspective shift, NOT an explosion or battle (if that framework is selected)
- [ ] The skeleton distinguishes between agency-required beats and atmospheric-immersion beats

</success_criteria>
