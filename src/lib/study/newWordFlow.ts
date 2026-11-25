import type { GradeValue } from "./engine";

export type NewWordStep = "present" | "teaching" | "recognition" | "recall";
export type NewWordAction = "unfamiliar" | "familiar" | "learned" | "fallback-recall" | "recognized" | "not-recognized" | "recall-good" | "recall-hard" | "recall-again";

export interface NewWordTransition {
  step: NewWordStep | "done";
  rating?: GradeValue;
}

/** 三步式初学：熟悉感只路由；再认正确最多 Hard；回忆才可 Good。 */
export function transitionNewWord(step: NewWordStep, action: NewWordAction): NewWordTransition {
  switch (action) {
    case "unfamiliar":
      return step === "present" ? { step: "teaching" } : { step };
    case "familiar":
      return step === "present" ? { step: "recognition" } : { step };
    case "learned":
      return step === "teaching" ? { step: "recall" } : { step };
    case "fallback-recall":
      return step === "recognition" ? { step: "recall" } : { step };
    case "recognized":
      return step === "recognition" ? { step: "done", rating: 2 } : { step };
    case "not-recognized":
      return step === "recognition" ? { step: "teaching", rating: 1 } : { step };
    case "recall-good":
      return step === "recall" ? { step: "done", rating: 3 } : { step };
    case "recall-hard":
      return step === "recall" ? { step: "done", rating: 2 } : { step };
    case "recall-again":
      return step === "recall" ? { step: "done", rating: 1 } : { step };
  }
}
