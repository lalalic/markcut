/** Shared structured-output contract for the Codex eval runner. */
export function outputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      decisions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: {type: 'string'},
            action: {type: 'string', enum: ['vision', 'author', 'storyboard', 'native_preview', 'mcp_review', 'render', 'verify', 'repair', 'report']},
            authority: {type: 'string', enum: ['source_media', 'selected_video_template', 'video_md']},
            completion_gates: {type: 'array', items: {type: 'string', enum: ['verify', 'real_playback', 'human_review']}},
            reason: {type: 'string'},
          },
          required: ['id', 'action', 'authority', 'completion_gates', 'reason'],
        },
      },
    },
    required: ['decisions'],
  };
}

/** Preserve the model's decisions; normalize only recognized legacy envelopes. */
export function parseOutput(raw, expectedIds) {
  let parsed;
  let schemaCompliant = true;
  try { parsed = JSON.parse(raw); }
  catch {
    const fence = raw.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
    if (!fence) throw new Error('Response is neither JSON nor a single complete JSON code fence');
    parsed = JSON.parse(fence[1]);
    schemaCompliant = false;
  }
  let decisions;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length === 1 && Array.isArray(parsed.decisions)) {
    decisions = parsed.decisions;
  } else if (Array.isArray(parsed)) {
    decisions = parsed;
    schemaCompliant = false;
  } else if (expectedIds.length === 1 && parsed && typeof parsed === 'object' && parsed.id === expectedIds[0]) {
    decisions = [parsed];
    schemaCompliant = false;
  } else {
    throw new Error('Response has no valid decisions array');
  }
  if (decisions.length !== expectedIds.length || decisions.some((decision, index) => decision?.id !== expectedIds[index])) {
    throw new Error('Response count or case identifiers differ from the input');
  }
  return {decisions, schemaCompliant};
}
