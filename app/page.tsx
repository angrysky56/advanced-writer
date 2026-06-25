import Studio from "./studio/page";

// The Studio is now the primary surface. The classic dashboard lives at
// /classic until its remake replaces it.
export default function Page() {
  return <Studio />;
}
