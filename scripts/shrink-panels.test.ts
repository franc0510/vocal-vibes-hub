import { describe, it, expect } from "vitest";
import { storagePath } from "./shrink-panels";

/**
 * The whole approach rests on writing back to the same path: the URLs already
 * stored in post_illustrations stay valid, no database row is touched, and the
 * script can be run twice without harm. Recovering that path from the public
 * URL is therefore the one place a mistake would be expensive — it would
 * either fail loudly or, worse, write to the wrong object.
 */
const base = "https://x.supabase.co/storage/v1/object/public/story_images/";

describe("storagePath", () => {
  it("retrouve le chemin dans le bucket", () => {
    expect(storagePath(`${base}user-1/post-2/3.jpg`)).toBe("user-1/post-2/3.jpg");
  });

  it("décode les caractères échappés", () => {
    expect(storagePath(`${base}user%201/post.jpg`)).toBe("user 1/post.jpg");
  });

  it("rend null pour une URL d'un autre bucket", () => {
    // Writing a story panel over someone's avatar would be the costly mistake.
    const other = "https://x.supabase.co/storage/v1/object/public/avatars/a.jpg";
    expect(storagePath(other)).toBeNull();
  });

  it("rend null pour une URL qui n'est pas du stockage", () => {
    expect(storagePath("https://ailleurs.example/image.jpg")).toBeNull();
  });
});
