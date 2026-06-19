<required_reading>

Load the following references before beginning this workflow:

- `references/03-archetypal-database.md` — Jungian archetypes, hamartia, Shadow, Persona Engine, Living Index
- `references/04-agency-enforcement.md` — Want→Decision→Action→Consequence, false-activity filter, ambivalent agency

Template used in this workflow:

- `templates/character-profile.md`

</required_reading>

<objective>

Create deep, psychologically-anchored character profiles that function as persistent,
modular entities. Characters built through this workflow have immutable Jungian cores,
evolving memory banks, and persona engine directives that allow them to be "cast" into
different stories while maintaining identity consistency.

This workflow can be used standalone (to build a character library) or invoked by
`workflows/create-narrative.md` during Step 5 (Character Assembly).

</objective>

<mode_awareness>

This workflow respects the 3-mode system:

- **Brainstorm Q&A (DEFAULT):** Walk through each character dimension with targeted
  questions. Build the character collaboratively with the user.
- **Collaborative:** Generate each major section (Core, Living Index, Persona Engine),
  pause for feedback, then continue.
- **Fast-Auto:** Generate the complete character profile in one pass using all available
  context.

**Mode-switch triggers (active at all steps):**
- "Let's brainstorm" / "ask me questions" → Brainstorm Q&A
- "Let's collaborate" / "work with me" → Collaborative
- "Just go" / "auto mode" / "fast mode" → Fast-Auto
- "Pause" / "stop" → Halt and await direction

</mode_awareness>

<process>

**Step 1 — Mode Check**

Acknowledge the current operating mode. Default to Brainstorm Q&A if unspecified.

State: *"I'm in [Mode Name] mode. You can switch at any time."*

Ask (in Brainstorm): *"Are we building a protagonist, antagonist, or supporting character?
Do you have an existing story context, or is this for the character library?"*

---

**Step 2 — Define the Immutable Core**

The Immutable Core is the psychological foundation that NEVER changes, regardless of which
story the character appears in. It prevents the character from drifting into a generic,
moralizing AI default.

**2a. Jungian Archetype Selection**

Present the 12 Jungian Archetypes and guide the user to select one:

| Archetype | Core Strategy | Vulnerability | Shadow Expression |
|---|---|---|---|
| **The Innocent** | Optimism, faith | Naïveté, denial | Blind obedience, willful ignorance |
| **The Orphan** | Resilience, realism | Cynicism, victimhood | Manipulation through pity |
| **The Hero** | Mastery, courage | Hubris, recklessness | Tyranny, need to dominate |
| **The Caregiver** | Nurturing, generosity | Martyrdom, enabling | Guilt-tripping, smothering control |
| **The Explorer** | Autonomy, discovery | Restlessness, commitment-phobia | Aimless wandering, inability to belong |
| **The Rebel** | Liberation, revolution | Self-destruction, nihilism | Anarchic destruction, chaos for its own sake |
| **The Lover** | Intimacy, passion | Obsession, loss of identity | Jealousy, emotional manipulation |
| **The Creator** | Innovation, vision | Perfectionism, impracticality | Narcissistic creation, god complex |
| **The Jester** | Joy, presence | Frivolity, avoidance | Cruelty disguised as humor, emotional deflection |
| **The Sage** | Wisdom, understanding | Detachment, paralysis by analysis | Dogmatism, intellectual superiority |
| **The Magician** | Transformation, power | Corruption, manipulation | Deception, reality distortion |
| **The Ruler** | Order, responsibility | Rigidity, authoritarianism | Tyranny, inability to relinquish control |

*Mode behavior:*
- **Brainstorm Q&A:** Present the table. Ask: "Which of these resonates with your character?
  What draws them? What scares them?" Use answers to narrow the archetype.
- **Collaborative:** Suggest 2–3 archetypes based on available context. Present with
  rationale. Wait for selection.
- **Fast-Auto:** Select the archetype that best fits the character description. State choice
  and reasoning.

**2b. Hamartia Definition**

The hamartia is NOT a quirky weakness. It is a fundamental error in judgment or perception
that drives the character's behavior and causes real harm.

Following Truby's framework, link the psychological flaw directly to a moral weakness:

- **Psychological flaw:** The deep misunderstanding of the world
- **Moral weakness:** HOW this flaw actively hurts others

**The critical question:** *"How is this flaw hurting others right now? Who specifically is
being damaged, and how?"*

The flaw must generate collateral damage to allies or the environment. If it doesn't, it's
a personality trait, not a hamartia.

*Mode behavior:*
- **Brainstorm Q&A:** Ask the user to describe the flaw. Push for specificity on the moral
  weakness. Reject answers that don't identify concrete harm to others.
- **Collaborative:** Propose a hamartia derived from the archetype's vulnerability column.
  Present the implied moral weakness. Wait for approval.
- **Fast-Auto:** Derive from archetype. State explicitly.

**2c. Shadow Identification**

The Shadow is the repressed, hidden, or denied aspect of the character's personality — the
part they refuse to acknowledge.

- What does this character deny about themselves?
- What behavior do they condemn in others that they secretly exhibit?
- What would they become if they gave in to their worst impulses?

**2d. Aristotelian Ethos**

Define the character's persuasive credibility — what makes the audience trust, distrust,
respect, or despise this person:

- **Phronesis** (practical wisdom) — How competent are they?
- **Aretê** (moral virtue) — How virtuous do they appear vs. how virtuous are they?
- **Eunoia** (goodwill) — Do they genuinely care about others?

---

**Step 3 — Build the Living Index**

The Living Index is the dynamic, evolving layer that changes as the character is used across
stories or scenes.

**3a. Skills, Knowledge, Capabilities**
- What can this character DO? What expertise do they carry?
- What knowledge gaps create vulnerability?

**3b. Individuation State**
Track where the character is on their psychological journey of integrating their conscious
and unconscious minds:
- **Pre-Individuation:** Fully identified with their persona mask. Shadow is completely
  repressed. (Most characters START here.)
- **Shadow Encounter:** The character is confronted with their Shadow, often through the
  antagonist or a crisis. Denial is the default response.
- **Integration Struggle:** Active wrestling with the Shadow. Ambivalence. Regression.
  Painful self-awareness.
- **Post-Individuation:** The Shadow is acknowledged and integrated (not eliminated). The
  character operates with authentic self-knowledge. (Rare — this is the destination, not
  the starting point.)

**3c. Relationship Mapping**
- Who are the enduring bonds?
- What is the quality of each relationship (trust, dependency, rivalry, unspoken love)?
- How does the hamartia affect each relationship?

*Mode behavior:*
- **Brainstorm Q&A:** Walk through each subsection with questions.
- **Collaborative:** Generate the full Living Index. Pause for review.
- **Fast-Auto:** Derive all fields from context. Proceed.

---

**Step 4 — Generate Persona Engine Directives**

These directives govern how the agent writes AS this character — not about them, but
through their subjective lens.

**4a. Subjective Filtering Rules**
When generating dialogue or internal monologue for this character, the agent must filter ALL
sensory details and decisions through the character's specific Ethos and Archetype. The
agent's default omniscient "AI" voice is strictly suppressed.

Define:
- What does this character NOTICE in a room? (Based on archetype — a Hero notices threats;
  a Caregiver notices who looks hurt; a Sage notices patterns.)
- What do they IGNORE or dismiss?
- What language register do they use? (Formal, street, technical, poetic, clipped?)

**4b. Voice Notes and Dialogue Patterns**
- Sentence length tendencies (terse? verbose? cyclical?)
- Verbal tics, recurring phrases, avoidances
- What topics make them eloquent? What topics make them inarticulate?
- How do they lie? (Omission, deflection, elaborate fabrication, silence?)

**4c. Ambivalent Agency Permissions**
The agent MUST allow this character to make morally ambiguous choices that align with their
hamartia. Define:
- What morally gray choices is this character CAPABLE of making?
- What line will they NOT cross (or believe they won't cross)?
- Under what pressure would they cross that line?

AI models default to "helpful, harmless, good" protagonists. These permissions explicitly
override that default for this character.

---

**Step 5 — Shadow-Match the Antagonist**

If the character being built is a protagonist, construct or select a shadow-matched
antagonist:

1. **Same Desire:** The antagonist must compete for the EXACT SAME goal as the protagonist.
   They cannot want something unrelated.

2. **Conflicting Moral Values:** The antagonist represents a different answer to the same
   moral question the protagonist is wrestling with.

3. **Externalized Shadow:** The antagonist physically manifests the protagonist's repressed
   Shadow — the version of themselves they refuse to become.

4. **Not a Random Villain:** The antagonist is psychologically tethered to the protagonist.
   Their conflict is philosophical, not just physical.

*Mode behavior:*
- **Brainstorm Q&A:** Ask: "What does your protagonist want most? Now imagine someone who
  wants the exact same thing, but for completely different reasons. Who is that person?"
- **Collaborative:** Propose an antagonist profile derived from the protagonist's Shadow.
  Present the logic. Wait for approval.
- **Fast-Auto:** Generate the shadow-matched antagonist. Explain the psychological tether.

---

**Step 6 — Output**

Generate the complete character profile using `templates/character-profile.md`.

The final output must include:
- Immutable Core (Archetype, Hamartia, Shadow, Ethos)
- Living Index (Skills, Individuation State, Relationships)
- Persona Engine Directives (Subjective Filtering, Voice, Ambivalent Agency)
- Shadow-Matched Antagonist (if protagonist)

*Mode behavior:*
- **Brainstorm Q&A / Collaborative:** Present the completed profile. Ask if any section
  needs adjustment.
- **Fast-Auto:** Output the complete profile. State any assumptions made.

</process>

<success_criteria>

The character profile is complete when ALL of the following are true:

- [ ] A specific Jungian Archetype has been selected (not generic or blended without intention)
- [ ] The hamartia is defined AND the moral weakness explicitly identifies who is being hurt and how
- [ ] The Shadow is defined as the repressed, denied aspect — not just "the opposite"
- [ ] The Aristotelian Ethos covers phronesis, aretê, and eunoia
- [ ] The Individuation State is explicitly placed on the four-stage spectrum
- [ ] Persona Engine directives include subjective filtering, voice notes, AND ambivalent agency
- [ ] If protagonist: a Shadow-Matched antagonist exists who competes for the same desire with conflicting values
- [ ] The character is NOT a "helpful, harmless, good" AI default — the hamartia generates real harm
- [ ] The profile is output using `templates/character-profile.md`

</success_criteria>
