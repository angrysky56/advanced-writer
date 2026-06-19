<objective>
A consolidated reference of empirically identified AI narrative pathologies from the StoryScope research ("StoryScope: Investigating idiosyncrasies in AI fiction" — Jenna Russell et al.). Each anti-pattern includes the specific statistical comparison, a detection heuristic, and a correction directive. This file exists to make AI fiction indistinguishable from — or superior to — human fiction by systematically eliminating the shared, convergent defaults that betray machine authorship.
</objective>

<domain_knowledge>

<section name="Research Summary">

The StoryScope study confirms that AI models have converged on a tight, shared narrative space. Regardless of the specific model or prompt, AI-generated fiction exhibits a statistically identifiable set of tendencies that distinguish it from human-authored work. These tendencies are not random — they are structural consequences of how LLMs are trained (predicting the most likely next token) and aligned (to be helpful, harmless, and universally "good").

The following anti-patterns represent the **specific, measurable gaps** between AI and human narrative practice.

</section>

<anti_pattern name="Thematic Over-Explaining">

**The statistic:** AI explicitly states themes **77%** of the time. Human authors leave themes implicit, trusting the reader to extract meaning from action and consequence.

**Description:** AI narrators have a compulsive need to summarize the lesson, moral, or thematic meaning of events — typically in the final paragraphs, internal monologue, or dialogue. This produces the "fable effect" where every story ends with a stated moral, robbing the reader of the interpretive act that creates deep engagement.

**Detection heuristic:**
- Scan for narrator or character statements that summarize theme, lesson, or moral
- Flag "realization" statements: "She finally understood that...", "In that moment, he realized...", "The lesson was clear..."
- Flag reflective codas where the character narrates their own growth in summary form
- Flag dialogue where characters articulate the story's meaning to each other explicitly

**Correction directive:** Delete the thematic summary. If the preceding narrative does not communicate the theme through action and consequence alone, the narrative must be rewritten — not annotated. The reader earns the meaning by witnessing the cost.

</anti_pattern>

<anti_pattern name="Protagonist-Driven Resolution Bias">

**The statistic:** **69%** of AI stories feature protagonist-driven resolutions vs. only **46%** in human-authored fiction.

**Description:** AI models desperately want the main character to neatly solve everything. Every thread is resolved through the protagonist's direct action. Human writers are far more comfortable with:
- Ambiguous endings where the outcome is uncertain
- External fates (events beyond the protagonist's control)
- Partial resolutions where some threads remain open
- Ironic resolutions where victory and defeat are intertwined

**Detection heuristic:**
- At the story's conclusion, inventory all active narrative threads
- Check: Is the protagonist the direct causal agent of resolution for each thread?
- If the protagonist resolves > 70% of threads through direct action, the ending is exhibiting AI bias
- Flag endings where the protagonist experiences total, unambiguous success across all dimensions

**Correction directive:** Introduce at least one thread that resolves through external forces, ambiguity, or ironic reversal. Allow the protagonist to fail at something they cared about, even as they succeed at the central goal. Or allow the central goal to be achieved at a cost that makes "victory" ambiguous.

</anti_pattern>

<anti_pattern name="Moral Ambivalence Deficit">

**The statistic:** Only **38%** of AI protagonists are morally ambivalent, compared to **59%** in human fiction.

**Description:** AI models are constitutionally aligned to be helpful, harmless, and universally "good." Their baseline protagonist output is a character who is reasonable, emotionally regulated, and eager to learn a wholesome lesson. This produces sanitized, predictable characters who lack the moral complexity that makes human fiction compelling.

**Detection heuristic:**
- Assess the protagonist's moral profile across the narrative
- Flag protagonists who never make a morally questionable decision
- Flag protagonists whose flaws are "safe" (clumsiness, shyness, overwork) rather than genuinely damaging
- Flag protagonists who never hurt anyone they care about through their own choices
- Check: Does the protagonist's *hamartia* cause real collateral damage?

**Correction directive:** Anchor the protagonist to an immutable *hamartia* that produces moral consequences. Ensure they make at least one decision that a reasonable reader could disagree with. Their flaw must actively hurt others — not merely inconvenience them.

</anti_pattern>

<anti_pattern name="Vague Cultural Allusions">

**The statistic:** AI relies on vague allusions **72%** of the time, while human authors make specific, named references to real works, brands, and places.

**Description:** AI-generated fiction inhabits a culturally generic world. Characters listen to "a song" rather than a specific track. They reference "a famous painting" rather than naming the work. Cities are "overseas" rather than named. This creates the AI-fiction "uncanny valley" — a world that feels plausible but textureless, like a movie set with no brand names.

**Detection heuristic:**
- Scan for cultural references that lack specificity
- Flag: "a famous painting," "a popular song," "an old book," "a well-known brand," "a city overseas"
- Flag dialogue that discusses culture, art, music, or media in generic terms
- Compare the density of named vs. unnamed cultural references

**Correction directive:** Replace vague allusions with specific, named references. Characters should listen to specific songs, reference specific books, visit specific places, and wear specific brands. Specificity creates the texture that separates a lived-in world from a generated one.

</anti_pattern>

<anti_pattern name="Bodily Metaphor Over-Reliance">

**The statistic:** AI overwhelmingly conveys emotion through physical sensations (tightening chests, cold sweat, dimming lamplight) rather than explicitly naming complex human feelings.

**Description:** Rather than naming emotions with precision and nuance, AI fiction defaults to a limited repertoire of bodily metaphors. Fear is "a tightening in her chest." Anxiety is "his stomach churning." Love is "electricity down her spine." This creates a monotonous sensory experience where every emotion is rendered through the same small set of physical responses, substituting mechanical body-mapping for genuine emotional specificity.

**Detection heuristic:**
- Track bodily metaphor density per scene
- Flag three or more consecutive emotional moments rendered entirely through physical sensation
- Monitor for the most common AI bodily metaphors:
  - Chest: tightening, aching, swelling, heavy
  - Heart: pounding, racing, sinking, hammering
  - Stomach: dropping, churning, knotting, hollow
  - Temperature: cold waves, heat, burning, ice
  - Vision: blurring, tunneling, dimming, sharpening
  - Breath: catching, hitching, stopping, ragged

**Correction directive:** Cap bodily metaphor density. For every physical sensation used to convey emotion, require at least one instance of **explicit emotion naming**. "She was jealous" is more honest and more specific than "a knot twisted in her stomach." Balance the sensory with the semantic.

</anti_pattern>

<anti_pattern name="Single-Track Plot Structure">

**The statistic:** AI defaults to single-track, chronological causal chains. Human authors utilize temporal complexity — time jumps, flashbacks, parallel timelines, and non-chronological revelation.

**Description:** AI-generated fiction almost always proceeds in strict chronological order along a single causal chain: A causes B, B causes C, C causes D. Human fiction routinely employs:
- Flashbacks and flash-forwards that delay or recontextualize revelations
- Parallel subplots that run independently before converging
- Non-chronological ordering where the *sjuzet* (presentation) diverges from the *fabula* (chronology)
- Multiple timelines that create meaning through juxtaposition

**Detection heuristic:**
- Map the narrative's temporal structure: is it strictly chronological?
- Count the number of independent subplot threads
- Check for any non-linear temporal techniques
- If the entire narrative can be described as "and then... and then... and then..." it is exhibiting AI structural bias

**Correction directive:** Mandate at least one temporal disruption — a flashback, flash-forward, or non-chronological revelation. Integrate at least one subplot that parallels, contrasts, or independently challenges the central theme. Break the single-track causal chain.

</anti_pattern>

</domain_knowledge>
