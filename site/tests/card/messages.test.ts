import { describe, expect, it } from "vitest";
import {
  farFromTraining,
  nearestTrainingLine,
  neighbourLabel,
  splitMessage,
} from "../../src/card/model";

describe("splitMessage", () => {
  it("uses the published wording for every split", () => {
    expect(splitMessage("train")).toBe("Seen in training");
    expect(splitMessage("validation")).toBe(
      "Validation: used to decide when training stopped, never trained on",
    );
    expect(splitMessage("held_out")).toBe("Held out: the model never saw this molecule");
    expect(splitMessage("cross_validated")).toBe(
      "Cross-validated: predicted by a model that never saw this molecule",
    );
  });
});

describe("farFromTraining", () => {
  it("warns below the distance threshold", () => {
    expect(farFromTraining("validation", 0.29)).toBe(
      "Far from training data (nearest training molecule: 0.29)",
    );
    expect(farFromTraining("held_out", 0.05)).toBe(
      "Far from training data (nearest training molecule: 0.05)",
    );
  });

  it("stays quiet at the threshold or when there is no comparison", () => {
    expect(farFromTraining("validation", 0.3)).toBeNull();
    expect(farFromTraining("held_out", null)).toBeNull();
    expect(farFromTraining("train", 0.1)).toBeNull();
  });
});

describe("neighbourLabel", () => {
  it("reports both similarities to two decimals", () => {
    expect(neighbourLabel({ id: "1", name: "Test", odour: 0.932134, structure: 0.246 })).toBe(
      "odour 0.93, structure 0.25",
    );
  });
});

describe("nearestTrainingLine", () => {
  it("states the nearest training similarity for molecules the model never trained on", () => {
    expect(nearestTrainingLine("validation", 0.390244)).toBe("Nearest training molecule: 0.39");
    expect(nearestTrainingLine("held_out", 0.3)).toBe("Nearest training molecule: 0.30");
    expect(nearestTrainingLine("cross_validated", 0.5)).toBe("Nearest training molecule: 0.50");
  });

  it("uses the far-from-training wording below the threshold", () => {
    expect(nearestTrainingLine("held_out", 0.29)).toBe(
      "Far from training data (nearest training molecule: 0.29)",
    );
  });

  it("says nothing for training molecules or a missing comparison", () => {
    expect(nearestTrainingLine("train", 0.1)).toBeNull();
    expect(nearestTrainingLine("validation", null)).toBeNull();
  });
});
