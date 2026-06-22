# Workflow: Batch Revise Pathologies

**Purpose:** Spawn character personas to critique a failing draft, compile Character Demands, and rewrite scenes to honor them using the `batch_revise_pathologies` MCP tool.

## Prerequisites

- An existing scene or chapter draft that is underperforming (e.g., low neurochemical score).
- Established Character Profiles.

## Steps

### 1. Diagnostic Intake

1. Identify the draft to be revised.
2. Run `review_narrative` to establish a baseline neurochemical score and identify core pathologies (e.g., flat dialogue, lack of agency).

### 2. Character Writer's Room

1. Invoke the `batch_revise_pathologies` MCP tool.
2. The tool will load the character profiles of the agents involved in the scene.
3. The tool simulates the characters reading the scene and generating "Character Demands" (e.g., "I wouldn't just agree here, I want X", "This action violates my core fear").

### 3. Synthesis and Rewrite

1. The tool synthesizes the Character Demands into a coherent revision plan.
2. The tool rewrites the scene, aggressively altering the narrative to satisfy the characters' authentic psychological drives.

### 4. Verification

1. Re-run `review_narrative` on the newly revised scene.
2. Compare the new neurochemical score against the baseline to ensure the pathology was resolved.
3. Present the before/after and the Character Demands to the user.

## Essential Principles Applied

- **Logprob Override**: The Character Writer's Room specifically forces characters to act according to their complex psychology rather than predictable narrative tropes.
- **Protagonist Agency**: Ensures characters are driving the plot, not just reacting to it.
