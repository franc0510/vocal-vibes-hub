import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import StorySlideshow from "./StorySlideshow";
import type { IllustrationPanel } from "@/services/illustrationService";

/**
 * An iOS <video> paints nothing until it has decoded a frame, so a story that
 * rendered the video alone showed a white rectangle for the first seconds — and
 * forever when the file failed to load. The panels have to be underneath.
 */
const panel = (idx: number, over: Partial<IllustrationPanel> = {}): IllustrationPanel => ({
  id: `p${idx}`,
  post_id: "post",
  idx,
  image_url: `https://x/${idx}.jpg`,
  caption: null,
  start_ms: idx * 1000,
  end_ms: (idx + 1) * 1000,
  ...over,
});

describe("StorySlideshow", () => {
  const panels = [panel(0), panel(1)];

  it("dessine une planche sous la vidéo, jamais un vide", () => {
    const { container } = render(
      <StorySlideshow panels={panels} currentMs={200} videoUrl="https://x/v.mp4" />
    );
    expect(container.querySelector("video")).not.toBeNull();
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("donne la première planche en poster, visible avant tout décodage", () => {
    const { container } = render(
      <StorySlideshow panels={panels} currentMs={0} videoUrl="https://x/v.mp4" />
    );
    expect(container.querySelector("video")?.getAttribute("poster")).toBe("https://x/0.jpg");
  });

  it("reste muette et en ligne, sinon iOS passe en plein écran", () => {
    const { container } = render(
      <StorySlideshow panels={panels} currentMs={0} videoUrl="https://x/v.mp4" />
    );
    const video = container.querySelector("video")!;
    expect(video.muted).toBe(true);
    expect(video.getAttribute("playsinline")).not.toBeNull();
  });

  it("affiche les planches seules quand il n'y a pas de vidéo", () => {
    const { container } = render(<StorySlideshow panels={panels} currentMs={1200} />);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://x/1.jpg");
  });

  it("ne rend rien quand il n'y a ni vidéo ni planche", () => {
    const { container } = render(<StorySlideshow panels={[]} currentMs={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("montre la légende du moment, pas toute la transcription", () => {
    // Each segment lasts past MIN_CAPTION_MS, so none is merged into the next —
    // otherwise the two would legitimately share one caption box.
    const segments = [
      { start_ms: 0, end_ms: 2000, text: "premier bout" },
      { start_ms: 2000, end_ms: 4000, text: "second bout" },
    ];
    const { container } = render(
      <StorySlideshow panels={panels} currentMs={2500} segments={segments} />
    );
    const text = container.textContent ?? "";
    expect(text).toContain("second bout");
    expect(text).not.toContain("premier bout");
  });
});
