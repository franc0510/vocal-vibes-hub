import { describe, it, expect } from "vitest";
import { parseRestBody } from "./import-bench-output";

/**
 * The import uploaded eleven panels, upserted them successfully, and then died
 * on `Unexpected end of JSON input` while reading PostgREST's reply. The write
 * had gone through; only the parsing failed. These pin the shapes a PostgREST
 * reply actually takes, since the status alone does not say whether there is a
 * body to parse.
 */
describe("parseRestBody", () => {
  it("returns null for 204, which PATCH with return=minimal gives", () => {
    expect(parseRestBody(204, "")).toBeNull();
  });

  it("returns null for 201 with an empty body — the case that broke the import", () => {
    // A bulk POST with `Prefer: resolution=merge-duplicates,return=minimal`
    // answers 201 Created and sends nothing. Treating "not 204" as "has JSON"
    // is what threw away a successful insert of every panel.
    expect(parseRestBody(201, "")).toBeNull();
  });

  it("tolerates a body that is only whitespace", () => {
    expect(parseRestBody(200, "\n")).toBeNull();
  });

  it("still parses a real payload", () => {
    expect(parseRestBody(200, '[{"id":"abc"}]')).toEqual([{ id: "abc" }]);
  });

  it("does not swallow a malformed body", () => {
    // Silence here would hide a genuine protocol problem behind an empty result.
    expect(() => parseRestBody(200, "{oops")).toThrow();
  });
});
