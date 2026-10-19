import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE } from "../../lib/style";
import { animState } from "./animate";

const anim = (over: Partial<typeof DEFAULT_STYLE.animation>) => ({ ...DEFAULT_STYLE.animation, ...over });

describe("animState", () => {
  it("is fully shown with no animation", () => {
    expect(animState(anim({}), 0, 2000, 1000)).toEqual({ alpha: 1, scale: 1, rotateDeg: 0, dx: 0, dy: 0, wipe: 1, wipeSoftness: 0 });
  });

  it("fades in and out over the set durations", () => {
    const a = anim({ in: "fade", out: "fade", in_ms: 400, out_ms: 400 });
    expect(animState(a, 0, 2000, 0).alpha).toBe(0);
    expect(animState(a, 0, 2000, 200).alpha).toBeGreaterThan(0.5);
    expect(animState(a, 0, 2000, 1000).alpha).toBe(1);
    expect(animState(a, 0, 2000, 1999).alpha).toBeLessThan(0.01);
  });

  it("never lets in/out take more than half of a short subtitle", () => {
    const a = anim({ in: "fade", in_ms: 3000 });
    expect(animState(a, 0, 1000, 500).alpha).toBe(1);
  });

  it("scales, spins, slides and wipes in", () => {
    expect(animState(anim({ in: "scale" }), 0, 2000, 50).scale).toBeLessThan(1);
    expect(animState(anim({ in: "spin" }), 0, 2000, 50).rotateDeg).toBeLessThan(0);
    expect(animState(anim({ in: "slide" }), 0, 2000, 50).dy).toBeGreaterThan(0);
    expect(animState(anim({ in: "reveal" }), 0, 2000, 100).wipe).toBeLessThan(1);
    expect(animState(anim({ in: "gradient" }), 0, 2000, 100).wipeSoftness).toBeGreaterThan(0);
  });

  it("loops are gentle and deterministic", () => {
    const pulse = animState(anim({ loop: "pulse" }), 0, 5000, 250);
    expect(pulse.scale).toBeGreaterThan(1);
    expect(pulse.scale).toBeLessThan(1.06);
    expect(animState(anim({ loop: "bounce" }), 0, 5000, 300)).toEqual(animState(anim({ loop: "bounce" }), 0, 5000, 300));
  });
});
