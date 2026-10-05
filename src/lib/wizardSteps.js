// wizardSteps.js: step navigation for PriorCreditWizard (1 type, 2 exam or course, 3 score, 4 confirm).
//
// A credit type without a score (transfer credit, Cambridge) goes from step 2 straight to step 4
// (`handleExamSelect`, `handleCourseSelect`), so Back from step 4 must return to step 2: step 3 would show a
// "What score did you receive?" page that can never load.

/** The step Back goes to from `step`. `hasScoreStep` is true for a credit type that asks for a score. */
export function previousStep(step, hasScoreStep) {
  if (step <= 1) return 1
  if (step === 4 && !hasScoreStep) return 2
  return step - 1
}
