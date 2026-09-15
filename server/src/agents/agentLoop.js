/**
 * RAPID Agents — shared multi-tool agent loop
 *
 * Small tool-calling loop reused by the narrow agents in
 * agents/specialists/*.js and agents/dispatchExecutionAgent.js. Each
 * specialist passes exactly one bound tool; the execution agent passes
 * three (two read tools for re-verification, one write tool to act).
 * citizenIntakeAgent.js predates this and has its own inline two-tool
 * loop; left as-is rather than refactored onto this helper, to avoid
 * touching an already-verified working agent.
 */
const aiConfig = require('../config/aiConfig');

const MAX_TOOL_TURNS = 5;

/**
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {object} params.userPayload - JSON-serializable context for the model.
 * @param {Array<{ definition: object, execute: Function }>} params.tools
 * @returns {Promise<object>} Parsed JSON final answer — throws on failure.
 */
async function runToolAgent({ systemPrompt, userPayload, tools }) {
  const client = aiConfig.getClient();
  const toolMap = Object.fromEntries(tools.map((t) => [t.definition.function.name, t]));

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(userPayload) }
  ];

  let finalContent = null;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const response = await client.chat.completions.create({
      model: aiConfig.AZURE_OPENAI_DEPLOYMENT,
      messages,
      tools: tools.map((t) => t.definition),
      tool_choice: 'auto',
      response_format: { type: 'json_object' },
      temperature: 0.1
    });

    const message = response.choices[0].message;
    messages.push(message);

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const call of message.tool_calls) {
        const tool = toolMap[call.function.name];
        let result;
        try {
          result = tool ? await tool.execute() : { error: `Unknown tool "${call.function.name}"` };
        } catch (err) {
          result = { error: err.message };
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }

    finalContent = message.content;
    break;
  }

  if (!finalContent) {
    throw new Error(`Agent did not produce a final answer within ${MAX_TOOL_TURNS} tool-call turns.`);
  }

  return JSON.parse(finalContent);
}

module.exports = { runToolAgent };
