import { argmax, ruleWeights } from './rules';
import type { ActionId, DecisionResult, JevAnswers } from './types';
import type { DecisionRequest } from './world';

const base = (req: DecisionRequest) => ({
  id: req.key,
  contractVersion: 'jev-city-decision-v3' as const,
  scenario: req.input.scenario,
  citizenId: req.citizenId,
  simulatedAtMinute: req.input.simulationMinute,
});

export function rulesDecision(req: DecisionRequest, provenance: 'rules' | 'fallback' = 'rules', errorClass?: string): DecisionResult {
  const w = ruleWeights(req.input, req.seq);
  const top = argmax(w) as ActionId;
  return {
    ...base(req),
    engine: 'rules',
    provenance,
    requestedModel: null,
    resolvedModel: null,
    modelTopChoice: null,
    enactedChoice: top,
    samplingPolicy: 'argmax',
    ruleWeights: w,
    metrics: {
      upstreamRoundTripMs: null,
      browserRoundTripMs: null,
      inputTokens: null,
      outputTokens: null,
      estimatedApiCostUsd: null,
      status: provenance === 'fallback' ? 'fallback' : 'success',
      errorClass,
    },
  };
}

export function jevDecision(
  req: DecisionRequest,
  v: { model: string; answers: JevAnswers; usage: { input_tokens: number; output_tokens: number } },
  requestedModel: string,
  upstreamRoundTripMs: number,
  estimatedApiCostUsd: number | null,
): DecisionResult {
  const top = v.answers.next_action.choice as ActionId;
  return {
    ...base(req),
    engine: 'jev',
    provenance: 'live',
    requestedModel,
    resolvedModel: v.model,
    modelTopChoice: top,
    enactedChoice: top,
    samplingPolicy: 'argmax',
    answers: v.answers,
    metrics: {
      upstreamRoundTripMs,
      browserRoundTripMs: null,
      inputTokens: v.usage.input_tokens,
      outputTokens: v.usage.output_tokens,
      estimatedApiCostUsd,
      status: 'success',
      capturedAt: new Date().toISOString(),
    },
  };
}

/** A recorded live decision replayed: provenance flips to 'recorded'; timings are historical. */
export function asReplayed(d: DecisionResult): DecisionResult {
  return { ...d, engine: 'recording', provenance: 'recorded', metrics: { ...d.metrics, status: 'replayed' } };
}
