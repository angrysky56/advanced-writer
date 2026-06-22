# Workflow: StoryScope Final Review

**Purpose:** Run the ultimate structural audit on a completed manuscript using 10 parallel AI specialists and synthesize a prioritized action plan using the `storyscope_final_review` and `apply_storyscope_revisions` tools.

## Prerequisites

- A completed manuscript (or substantial act).

## Steps

### 1. Launch StoryScope Audit

1. Invoke the `storyscope_final_review` MCP tool on the manuscript.
2. The tool dispatches 10 parallel specialist lenses:
   - Plot, Agents, Perspective, Temporal Structure, Setting, Style, Events, Revelation, Situatedness, Social Networks.
3. The tool waits for all 10 reports and synthesizes them into an Executive Summary (Draft 2 Action Plan).

### 2. Review Action Plan

1. Present the Executive Summary to the user.
2. Discuss the prioritized action items. The user may choose to accept all, reject some, or modify the plan.

### 3. Autonomous Application

1. Once the Action Plan is approved, invoke the `apply_storyscope_revisions` MCP tool.
2. The tool autonomously traverses the manuscript and applies the approved edits.
3. The tool generates a change log detailing the specific alterations made.

## Essential Principles Applied

- **All Principles**: The 10 specialists are explicitly designed to enforce all Advanced Writer essential principles simultaneously.
