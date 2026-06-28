/**
 * Canonical story identity.
 *
 * A story's `story_id` is used as a key in two places that MUST agree: the
 * workspace folder name and the Neo4j `story_ids` arrays. Historically the
 * folder was slugged (`workspace.sanitizeFilename`) while the graph stored the
 * raw, caller-supplied string. When the same title arrived in different forms
 * ("The Last Frequency", "the-last-frequency", "the_last_frequency"), the folder
 * collapsed them to one directory but the graph kept them as THREE separate
 * identities — so the cast/arc reuse guards never matched, and every run
 * regenerated the whole cast into the same shared folder (split canon).
 *
 * `storySlug` is the single normalizer both layers route through, so any
 * formatting of the same title resolves to exactly one identity. The transform
 * is intentionally identical to the legacy `sanitizeFilename` so existing
 * folders keep resolving to the same slug.
 */
export function storySlug(name: string): string {
  return (name ?? "").replace(/[^a-z0-9]/gi, "_").toLowerCase();
}
