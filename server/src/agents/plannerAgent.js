/**
 * RAPID Agents — Planner (Incident Briefing Orchestrator)
 *
 * Multi-agent, planner-executor pipeline: delegates to three specialist
 * agents (dispatch, airspace, comms — see agents/specialists/*.js), each
 * its own LLM call wrapping exactly one existing deterministic service as
 * a tool, then synthesizes their reports into one controller-facing
 * briefing.
 *
 * Deliberate design choice: the ORCHESTRATION TOPOLOGY here — dispatch
 * always runs first, airspace/comms only run (in parallel) if dispatch
 * found a safe drone — is fixed application code, not an LLM decision.
 * No LLM ever decides whether to skip the airspace safety check; only
 * what to say about its result. This mirrors the rest of the codebase's
 * philosophy (deterministic scaffolding, LLM reasoning layered on top)
 * and keeps the control flow itself auditable rather than generative.
 *
 * Audit logging is a plain call into the existing securityAuditLogger,
 * not a fourth specialist — writing a log entry needs no reasoning.
 *
 * generateBriefing() is purely advisory — it never dispatches anything.
 * Acting on its recommendation requires a separate, explicit human step:
 * confirmDispatch() below, which is the only path in this codebase that
 * can trigger dispatchExecutionAgent.js's real actuator. Every successful
 * briefing is stashed in `pendingProposals` (in-memory, same ephemeral-state
 * convention as communicationService.js's `sessions` Map) so confirmDispatch
 * can verify a human is confirming something an agent actually proposed —
 * the confirm request only ever needs an incidentId; the drone comes from
 * this server-side record, never from client input.
 */
const db = require('../config/database');
const aiConfig = require('../config/aiConfig');
const dispatchSpecialist = require('./specialists/dispatchSpecialist');
const airspaceSpecialist = require('./specialists/airspaceSpecialist');
const commsSpecialist = require('./specialists/commsSpecialist');
const dispatchExecutionAgent = require('./dispatchExecutionAgent');
const securityAuditLogger = require('../services/security/securityAuditLogger');

const PROPOSAL_TTL_MS = 5 * 60 * 1000; // 5 minutes — force a fresh briefing rather than confirming stale world-state
const pendingProposals = new Map(); // incidentId -> { recommendedDroneId, generatedAt }

const SYNTHESIZER_SYSTEM_PROMPT = `You are RAPID's briefing synthesizer. You have reports from up to three specialist agents about an active incident — dispatch, airspace safety, and communications. Combine them into a single, coherent briefing for a police controller who has final authority over any action.

If a controller question was given, make sure your briefing actually answers it. Do not invent facts beyond what the specialist reports state. If a specialist's report is missing or marked as an error, say so plainly rather than guessing what it would have found.

Respond with ONLY a single JSON object (no prose, no markdown fences):
{
  "briefing": "<2-5 sentence natural-language briefing synthesizing all available specialist reports>"
}`;

async function synthesize({ incident, controllerQuestion, dispatchResult, airspaceResult, commsResult }) {
  const client = aiConfig.getClient();
  const response = await client.chat.completions.create({
    model: aiConfig.AZURE_OPENAI_DEPLOYMENT,
    messages: [
      { role: 'system', content: SYNTHESIZER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          incidentTitle: incident.title,
          incidentCategory: incident.category,
          incidentSeverity: incident.severity,
          controllerQuestion,
          dispatchReport: dispatchResult,
          airspaceReport: airspaceResult,
          commsReport: commsResult
        })
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  if (!parsed || typeof parsed.briefing !== 'string' || !parsed.briefing.trim()) {
    throw new Error('Synthesizer did not return a valid briefing.');
  }
  return parsed.briefing;
}

async function runSpecialistSafely(name, fn) {
  try {
    return { name, ok: true, result: await fn(), error: null };
  } catch (err) {
    console.error(`🤖 ${name} specialist failed:`, err.message);
    return { name, ok: false, result: null, error: err.message };
  }
}

/**
 * @param {{ incidentId: string, controllerQuestion?: string|null, actor?: object|null }} params
 * @returns {Promise<object>} { briefing, structured, specialistResults, timestamp }
 */
async function generateBriefing({ incidentId, controllerQuestion = null, actor = null }) {
  const incident = await db.incidents.get(incidentId);
  if (!incident) {
    const err = new Error(`Incident ${incidentId} not found.`);
    err.status = 404;
    throw err;
  }

  const dispatchOutcome = await runSpecialistSafely('dispatch', () =>
    dispatchSpecialist.run({ incident, controllerQuestion })
  );
  const dispatchResult = dispatchOutcome.ok ? dispatchOutcome.result : null;

  let airspaceOutcome = { name: 'airspace', ok: false, result: null, error: 'Skipped — no recommended drone to check a route for.' };
  let commsOutcome = { name: 'comms', ok: false, result: null, error: 'Skipped — no recommended drone to check comms for.' };

  if (dispatchResult && dispatchResult.recommendedDroneId) {
    [airspaceOutcome, commsOutcome] = await Promise.all([
      runSpecialistSafely('airspace', () => airspaceSpecialist.run({ incident, dispatchResult, controllerQuestion })),
      runSpecialistSafely('comms', () => commsSpecialist.run({ incident, dispatchResult, controllerQuestion }))
    ]);
  }

  const briefing = await synthesize({
    incident,
    controllerQuestion,
    dispatchResult: dispatchOutcome.ok ? dispatchOutcome.result : { error: dispatchOutcome.error },
    airspaceResult: airspaceOutcome.ok ? airspaceOutcome.result : { error: airspaceOutcome.error },
    commsResult: commsOutcome.ok ? commsOutcome.result : { error: commsOutcome.error }
  });

  const structured = {
    recommendedDroneId: dispatchResult ? dispatchResult.recommendedDroneId : null,
    airspaceClear: airspaceOutcome.ok ? airspaceOutcome.result.clear : null,
    commsReady: commsOutcome.ok ? commsOutcome.result.ready : null
  };

  securityAuditLogger
    .logEvent({
      action: securityAuditLogger.EVENTS.AI_BRIEFING_GENERATED,
      actor,
      target: { incidentId },
      details: {
        recommendedDroneId: structured.recommendedDroneId,
        airspaceClear: structured.airspaceClear,
        questionAsked: !!controllerQuestion
      }
    })
    .catch((err) => console.error('Security audit log write failed:', err.message));

  pendingProposals.set(incidentId, {
    recommendedDroneId: structured.recommendedDroneId,
    generatedAt: Date.now()
  });

  return {
    briefing,
    structured,
    specialistResults: {
      dispatch: dispatchOutcome,
      airspace: airspaceOutcome,
      comms: commsOutcome
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * The only path that can actually dispatch a drone via an agent. Requires
 * a prior successful generateBriefing() call for the same incidentId —
 * see the module doc comment above for why.
 *
 * @param {{ incidentId: string, actor?: object|null }} params
 * @returns {Promise<{ executed: boolean, summary: string, dispatchResult: object|null }>}
 */
async function confirmDispatch({ incidentId, actor = null }) {
  const proposal = pendingProposals.get(incidentId);
  if (!proposal) {
    const err = new Error('No pending AI briefing found for this incident. Generate a briefing first via POST /api/agents/incident-briefing.');
    err.status = 404;
    throw err;
  }

  if (Date.now() - proposal.generatedAt > PROPOSAL_TTL_MS) {
    pendingProposals.delete(incidentId);
    const err = new Error('The AI briefing for this incident has expired — world state may have changed. Generate a fresh briefing before confirming.');
    err.status = 409;
    throw err;
  }

  if (!proposal.recommendedDroneId) {
    pendingProposals.delete(incidentId);
    const err = new Error('The last briefing found no safe drone to dispatch — nothing to confirm.');
    err.status = 409;
    throw err;
  }

  const outcome = await dispatchExecutionAgent.confirmAndExecute({
    incidentId,
    approvedDroneId: proposal.recommendedDroneId
  });

  // One-time use — confirming again requires a fresh briefing, so a
  // second accidental confirm can't re-dispatch off a stale approval.
  pendingProposals.delete(incidentId);

  securityAuditLogger
    .logEvent({
      action: securityAuditLogger.EVENTS.AI_DISPATCH_CONFIRMED,
      actor,
      target: { incidentId, droneId: proposal.recommendedDroneId },
      details: { executed: outcome.executed, summary: outcome.summary }
    })
    .catch((err) => console.error('Security audit log write failed:', err.message));

  return outcome;
}

module.exports = { generateBriefing, confirmDispatch };
