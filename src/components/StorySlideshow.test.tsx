import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import StorySlideshow from "./StorySlideshow";
import type { IllustrationPanel } from "@/services/illustrationService";

/**
 * Which rendering wins, and why.
 *
 * The panels are plain images driven by the audio position: they pan, cross-fade
 * and scrub identically everywhere, and the captions stay live text. The MP4
 * added nothing in the app and could refuse to start on iOS, leaving a frozen
 * poster over a story that was working underneath — which is exactly what
 * happened in production. So panels win whenever they exist; the file is what
 * leaves the app when an anecdote is shared.
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

  it("joue les planches, pas le MP4, dès qu'il y a des planches", () => {
    const { container } = render(
      <StorySlideshow panels={panels} currentMs={200} videoUrl="https://x/v.mp4" />
    );
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("change de planche quand l'audio avance — le symptôme signalé", () => {
    const first = render(<StorySlideshow panels={panels} currentMs={200} videoUrl="https://x/v.mp4" />);
    const second = render(<StorySlideshow panels={panels} currentMs={1500} videoUrl="https://x/v.mp4" />);
    expect(first.container.querySelector("img")?.getAttribute("src")).toBe("https://x/0.jpg");
    expect(second.container.querySelector("img")?.getAttribute("src")).toBe("https://x/1.jpg");
  });

  it("joue le MP4 quand il n'y a aucune planche", () => {
    const { container } = render(
      <StorySlideshow panels={[]} currentMs={0} videoUrl="https://x/v.mp4" />
    );
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    // Muted and inline, sinon iOS bascule en plein écran ou refuse la lecture.
    expect(video!.muted).toBe(true);
    expect(video!.getAttribute("playsinline")).not.toBeNull();
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

  it("n'applique aucun zoom ni panoramique à la planche", () => {
    // The Ken Burns drift was distracting more than it was atmospheric. The
    // fade between panels stays; the panel itself is left alone.
    const { container } = render(
      <StorySlideshow panels={panels} currentMs={500} videoUrl="https://x/v.mp4" />
    );
    const img = container.querySelector("img") as HTMLElement;
    expect(img.style.transform).toBe("");
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
