'use client'

/**
 * StepWizard — Reusable Multi-Step Flow Component
 * =================================================
 *
 * Used for: customer onboarding, provider registration, provider onboarding.
 *
 * Features:
 *   - Progress bar + step indicators always visible at top
 *   - Step labels visible (not hidden behind numbers)
 *   - Current step clearly highlighted, completed steps marked with ✓
 *   - Back/Next navigation with validation gate (canProceed prop)
 *   - Keyboard: Enter to proceed (when canProceed), Escape has no effect (no accidental dismissal)
 *   - Step history preserved — users can go back without losing data
 *
 * Usage:
 *   <StepWizard
 *     steps={[
 *       { id: 'account',  label: 'Account',  description: 'Your details' },
 *       { id: 'hardware', label: 'Hardware', description: 'Your GPUs' },
 *       { id: 'stake',    label: 'Stake',    description: 'Security deposit' },
 *     ]}
 *     currentStep={step}
 *     onStepChange={setStep}
 *     canProceed={formIsValid}
 *     onComplete={handleSubmit}
 *     completeLabel="Launch Node"
 *   >
 *     {step === 0 && <AccountForm />}
 *     {step === 1 && <HardwareForm />}
 *     {step === 2 && <StakeForm />}
 *   </StepWizard>
 */

import { ReactNode, useEffect, useCallback, KeyboardEvent } from 'react'

export interface WizardStep {
  id:          string
  label:       string
  description: string
  optional?:   boolean
}

interface StepWizardProps {
  steps:         WizardStep[]
  currentStep:   number
  onStepChange:  (step: number) => void
  canProceed?:   boolean
  onComplete:    () => void | Promise<void>
  completeLabel?: string
  completing?:   boolean   // show spinner on complete button
  children:      ReactNode
  /** Show a secondary "skip" link on the last step */
  onSkip?:       () => void
  skipLabel?:    string
}

export function StepWizard({
  steps,
  currentStep,
  onStepChange,
  canProceed = true,
  onComplete,
  completeLabel = 'Finish',
  completing = false,
  children,
}: StepWizardProps) {
  const isFirst = currentStep === 0
  const isLast  = currentStep === steps.length - 1
  const pct     = Math.round(((currentStep) / (steps.length - 1)) * 100)

  const goNext = useCallback(() => {
    if (canProceed && !isLast) onStepChange(currentStep + 1)
    else if (canProceed && isLast) onComplete()
  }, [canProceed, isLast, currentStep, onStepChange, onComplete])

  const goBack = useCallback(() => {
    if (!isFirst) onStepChange(currentStep - 1)
  }, [isFirst, currentStep, onStepChange])

  // Enter key to proceed when focused on the wizard
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Enter' && e.target instanceof HTMLElement && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
        goNext()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [goNext])

  return (
    <div className="w-full">

      {/* ── Step indicator ──────────────────────────────────────────────── */}
      <div className="mb-8">
        {/* Progress bar */}
        <div className="h-1 bg-slate-100 rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Step pills */}
        <div className="flex items-center justify-between">
          {steps.map((step, i) => {
            const done    = i < currentStep
            const current = i === currentStep
            return (
              <div key={step.id} className="flex items-center flex-1 last:flex-none">
                {/* Step circle */}
                <button
                  type="button"
                  onClick={() => done && onStepChange(i)}
                  disabled={!done}
                  className={`flex-shrink-0 flex flex-col items-center gap-1 group ${done ? 'cursor-pointer' : 'cursor-default'}`}
                  aria-current={current ? 'step' : undefined}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                    done    ? 'bg-blue-500 border-blue-500 text-white'            :
                    current ? 'bg-white border-blue-500 text-blue-600'            :
                              'bg-white border-slate-200 text-slate-400'
                  }`}>
                    {done ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M20 6L9 17l-5-5"/>
                      </svg>
                    ) : (
                      <span>{i + 1}</span>
                    )}
                  </div>
                  <div className="text-center hidden sm:block">
                    <p className={`text-xs font-semibold leading-none ${current ? 'text-blue-600' : done ? 'text-slate-600' : 'text-slate-400'}`}>
                      {step.label}
                    </p>
                    <p className="text-[10px] text-slate-400 leading-none mt-0.5">{step.description}</p>
                  </div>
                </button>

                {/* Connector line */}
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 transition-all ${i < currentStep ? 'bg-blue-500' : 'bg-slate-200'}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Step content ────────────────────────────────────────────────── */}
      <div className="min-h-[320px]">
        {children}
      </div>

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
        <button
          type="button"
          onClick={goBack}
          disabled={isFirst}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-0 disabled:pointer-events-none transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back
        </button>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            Step {currentStep + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={isLast ? onComplete : goNext}
            disabled={!canProceed || completing}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              canProceed && !completing
                ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-sm'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {completing ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Processing…
              </>
            ) : isLast ? (
              <>{completeLabel} <span>→</span></>
            ) : (
              <>Continue <span>→</span></>
            )}
          </button>
        </div>
      </div>

    </div>
  )
}
