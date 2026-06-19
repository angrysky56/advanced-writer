<objective>
To review generated narrative text and explicitly flag structural collapses, continuity errors, unearned setups, and the misuse of narrative devices before final output. This module acts as the agent's automated editor — a ruthless pathology scanner that catches execution failures the structural and agency modules cannot prevent.
</objective>

<domain_knowledge>

<section name="I. Continuity and Temporal Integrity Scanner">

Since Module 02 (Structural Paradigms) explicitly commands the agent to use non-linear structures, flashbacks, and time jumps, the risk of continuity errors skyrockets. The agent must systematically scan for three categories of temporal failure.

<scanner name="Character Knowledge Gaps">

**What it catches:** Instances where characters inexplicably possess information they never narratively acquired or learned.

**Detection heuristic:**
- For each piece of information a character acts on, trace the **narrative path** (not chronological path) by which they obtained it
- Flag any instance where a character references, uses, or responds to information that was:
  - Revealed only to the reader (not to the character)
  - Disclosed in a scene the character was not present for
  - Established in a timeline the character has not yet experienced (in non-linear structures)
- Exception: Characters may act on information obtained "off-screen" only if the story explicitly acknowledges the acquisition later

**Severity:** Critical. Character Knowledge Gaps shatter suspension of disbelief immediately (Source 64).

</scanner>

<scanner name="Rule Breaking (Worldbuilding Consistency)">

**What it catches:** Violations of the established reality — the laws of physics, magic systems, technological constraints, social norms, or any worldbuilding rule the narrative has set.

**Detection heuristic:**
- Maintain a running inventory of established rules (explicit and implicit)
- Flag any event, action, or capability that contradicts a previously established constraint
- Pay special attention to magic/technology systems — power creep is the most common form of rule breaking
- "The rules apply until they're dramatically inconvenient" is a pathology, not a design choice

**Severity:** Critical. When the world breaks its own rules, plausibility shatters (Source 64).

</scanner>

<scanner name="Temporal Tracking">

**What it catches:** Chronological inconsistencies across flashbacks, flash-forwards, and non-linear narrative structures.

**Detection heuristic:**
- Verify that the chronological timeline holds up across all temporal shifts
- Flag conflicting overlapping events (Character A cannot be in two places at the same time unless established rules permit it)
- Track character ages, seasons, historical events, and stated durations for internal consistency
- Map the *fabula* (chronological event sequence) against the *sjuzet* (narrative presentation) to verify coherence

**Severity:** High. Temporal confusion breaks neural coupling — the reader exits transportation to puzzle over logistics.

</scanner>

</section>

<section name="II. Foreshadowing and The Dopamine Check">

A climax that is resolved through sheer luck or an unearned external force (Deus Ex Machina) denies the audience the psychological dopamine reward they have been neurobiologically primed to expect. This scanner ensures that payoffs are earned.

<scanner name="Chekhov's Gun Enforcement">

**What it catches:** Critical objects, skills, or revelations utilized in the climax that were not appropriately foreshadowed earlier in the text.

**Detection heuristic:**
- For every critical element used in the resolution (weapon, skill, piece of knowledge, ally, escape route), trace backward to find its **setup**
- The setup must exist in a scene that the reader has already encountered at the point of payoff
- The setup must be **noticeable but not obvious** — planted with enough subtlety that the reader could have noticed it, but didn't necessarily predict the payoff
- Flag "pulled from nowhere" resolutions — elements that appear for the first time at the exact moment they're needed

**Converse rule:** If a significant element is prominently set up early in the narrative, it **must** pay off. Unfired Chekhov's Guns create unresolved anticipation that registers as narrative betrayal.

**Severity:** High. Unearned resolutions deny the dopamine reward of pattern recognition (Source 10).

</scanner>

<scanner name="Pattern Recognition Requirement">

**What it catches:** "Twists" or major plot pivots that have zero preceding clues.

**Detection heuristic:**
- Dopamine is released through anticipation and the **recognition of patterns** — the audience's brain rewards itself for correctly identifying connections between earlier clues and current events
- Flag any major twist, reveal, or reversal that provides zero retroactive coherence — the reader should be able to look back and say "the clues were there"
- A twist that is merely surprising (no clues) vs. a twist that is **inevitable in retrospect** (clues existed) — only the latter earns dopamine
- Zero-clue twists register as random, unearned, or frustrating rather than satisfying

**Severity:** High. The difference between a great twist and a cheap one is entirely in the foreshadowing.

</scanner>

</section>

<section name="III. Narrative Device Pathologies">

This section explicitly polices the AI's tendency to misuse narrative devices as identified in the StoryScope research. These are the execution-level failures that structural and agency modules cannot catch because they occur at the sentence and paragraph level.

<pathology name="Thematic Over-Explaining">

**The problem:** AI narrators explicitly explain the story's theme **77% of the time** (StoryScope), often ending a grieving character's arc with the narrator stating the lesson learned. Human authors trust the reader to infer theme from action and consequence.

**Detection heuristic:**
- Flag any instance where the narrator, internal monologue, or dialogue explicitly states the theme, moral, or lesson of the story
- Common patterns to catch:
  - "She finally understood that..."
  - "In that moment, he realized the true meaning of..."
  - "It was then that she knew..."
  - "The lesson was clear..."
  - "And so, [character] learned that..."
  - Any sentence that could serve as the "moral of the story" in a fable
- Flag reflective passages where the character narrates their own transformation in summary form

**Correction directive:** Delete the explanatory summary. If the theme cannot be understood through the preceding action, the action needs to be rewritten — not explained. Theme is demonstrated, never declared.

</pathology>

<pathology name="Metaphor Exhaustion (Bodily Metaphor Density)">

**The problem:** AI overwhelmingly conveys emotion through physical sensations — "a tightening in her chest," "cold sweat," "his stomach dropped," "dimming lamplight," "electricity running down her spine" — rather than explicitly naming the complex human emotion. This creates a monotonous sensory experience that substitutes mechanical body-mapping for genuine emotional specificity.

**Detection heuristic:**
- Track the **density** of bodily metaphors per scene or per page
- Flag when three or more consecutive emotional moments are rendered entirely through physical sensation without any explicit emotion naming
- Common bodily metaphors to monitor:
  - Chest tightening, heart pounding/racing/sinking
  - Stomach dropping/churning/knotting
  - Cold/hot waves, sweating, shivering
  - Vision blurring, dimming, tunneling
  - Breath catching, throat closing
  - Electricity/tingling along skin/spine

**Correction directive:** Cap the density of bodily metaphors. Force the agent to **balance** them with explicit emotion labels. Name the feeling — jealousy, not "a knot in his stomach." Shame, not "heat crawling up her neck." Trust the reader to connect the named feeling to the body.

</pathology>

<pathology name="Vague Allusions">

**The problem:** AI relies on vague, unspecified allusions **72% of the time** (StoryScope) rather than making specific, named references to other works, brands, places, or cultural touchstones. This produces a narrative world that feels generic, placeless, and culturally unmoored.

**Detection heuristic:**
- Flag worldbuilding and cultural references that are overly generic:
  - "A famous painting" instead of naming a specific work
  - "A popular song" instead of naming the artist and track
  - "An old book" instead of a specific title
  - "A well-known brand" instead of naming it
  - "A city overseas" instead of naming the place
- Flag dialogue that references culture, art, or media in vague terms when specificity would ground the world

**Correction directive:** Force the integration of **specific cultural touchstones**. Replace vague allusions with named references — real works, real brands, real places. Specificity creates texture. Vagueness creates the AI-fiction "uncanny valley."

</pathology>

</section>

</domain_knowledge>
