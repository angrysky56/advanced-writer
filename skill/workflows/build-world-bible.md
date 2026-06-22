# Workflow: Build World Bible

**Purpose:** Autonomously expand a core premise or logline into a massive, consistent World Bible (factions, tech/magic, economics, geography) using the `build_world_bible` MCP tool.

## Prerequisites
- A core premise, logline, or basic concept.
- Agent operating in Advanced Writer context.

## Steps

### 1. Concept Intake (Brainstorm Mode)
1. Ask the user for the core premise of the world.
2. Ask 2-3 targeted questions to establish boundaries:
   - Is there magic or advanced technology? What are the rules and costs?
   - What is the primary conflict driving the world's current state (e.g., scarcity, ideological war)?
   - What is the tone (e.g., grimdark, hopeful, surreal)?

### 2. Autonomous Expansion (Fast-Auto Mode)
1. Invoke the `build_world_bible` MCP tool with the gathered context.
2. The tool will autonomously generate the complete World Bible, filling out the `world-bible.md` template.
3. The tool saves the output to disk.

### 3. Review and Refine (Collaborative Mode)
1. Present the generated World Bible to the user.
2. Ask for specific feedback on any section (e.g., "Do the factions feel balanced?", "Is the cost of magic steep enough?").
3. Manually edit the document or use `rewrite_scene` / standard editing to adjust sections based on feedback.

## Essential Principles Applied
- **Logprob Override**: Ensure the world has unexpected conflicts or subversions of genre tropes.
- **Anti-Moralization**: Ensure the world's history shows cause and effect, not clear "good vs evil" morality plays. 
