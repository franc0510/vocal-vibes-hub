import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import LiveCaption from "./LiveCaption";

/**
 * Two callers now depend on this: illustrated anecdotes through the slideshow,
 * and plain ones directly. The case that matters most is the empty one — when
 * it draws nothing, the caller falls back to printing the whole transcription,
 * so "nothing" has to mean "no timestamps", never "not yet at a word".
 */
const segments = [
  { start_ms: 0, end_ms: 2000, text: "premier bout" },
  { start_ms: 2000, end_ms: 4000, text: "second bout" },
];

describe("LiveCaption", () => {
  it("montre la phrase du moment", () => {
    const { container } = render(<LiveCaption segments={segments} currentMs={2500} />);
    expect(container.textContent).toBe("second bout");
  });

  it("change de phrase quand l'audio avance", () => {
    const { container } = render(<LiveCaption segments={segments} currentMs={500} />);
    expect(container.textContent).toBe("premier bout");
  });

  it("ne rend rien sans horodatage — c'est ce qui déclenche le repli", () => {
    expect(render(<LiveCaption segments={[]} currentMs={0} />).container.firstChild).toBeNull();
    expect(render(<LiveCaption segments={null} currentMs={0} />).container.firstChild).toBeNull();
    expect(render(<LiveCaption currentMs={0} />).container.firstChild).toBeNull();
  });

  it("ne rend rien après la dernière phrase", () => {
    const { container } = render(<LiveCaption segments={segments} currentMs={9000} />);
    expect(container.firstChild).toBeNull();
  });

  it("laisse passer les gestes vers ce qu'il y a dessous", () => {
    // It sits over the story; capturing taps would break play/pause.
    const { container } = render(<LiveCaption segments={segments} currentMs={100} />);
    expect((container.firstChild as HTMLElement).className).toContain("pointer-events-none");
  });
});
