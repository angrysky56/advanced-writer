# Workflow: Expand to Novel

**Purpose:** Outline a scene-by-scene Beat Sheet and run an autonomous background drafting loop to write the entire manuscript chapter-by-chapter using the `expand_to_novel` MCP tool.

## Prerequisites

- A completed `story-architecture-brief.md`.
- Completed Character Profiles (`character-profile.md`) for the main cast.

## Steps

### 1. Beat Sheet Generation

1. Use the `story-architecture-brief.md` to generate a detailed scene-by-scene Beat Sheet.
2. Ensure every scene has a clear goal, conflict, and disaster/resolution that advances the plot or character arc.
3. Review the Beat Sheet with the user and obtain approval.

### 2. Autonomous Drafting Loop (Fast-Auto Mode)

1. Invoke the `expand_to_novel` MCP tool, passing the approved Beat Sheet and character profiles.
2. The tool will spawn background tasks to write the manuscript chapter by chapter.
3. The tool utilizes the `continue_narrative` tool internally to string scenes together.
4. Notify the user that drafting is in progress and will take time.

### 3. Progressive Review

1. As chapters are completed, use the `review_narrative` tool to run neurochemical scoring and diagnostics on them.
2. Present the chapter and its diagnostic report to the user.
3. If necessary, use `rewrite_scene` to fix any identified pathologies before the loop advances too far.

## Essential Principles Applied

- **Mandatory Nonlinearity**: Ensure the Beat Sheet includes structural complexity (flashbacks, parallel timelines) if appropriate.
- **Earned Catharsis**: Ensure the climax outlined in the Beat Sheet requires a severe cost.
