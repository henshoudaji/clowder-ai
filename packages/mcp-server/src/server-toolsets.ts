import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  callbackMemoryTools,
  callbackTools,
  evidenceTools,
  gameActionTools,
  limbTools,
  reflectTools,
  richBlockRulesTools,
  scheduleTools,
  sessionChainTools,
  signalStudyTools,
  signalsTools,
} from './tools/index.js';

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: never) => Promise<unknown>;
};

const collabTools: readonly ToolDef[] = [
  ...callbackTools,
  ...richBlockRulesTools,
  ...gameActionTools,
  ...scheduleTools,
];

const memoryTools: readonly ToolDef[] = [
  ...callbackMemoryTools,
  ...evidenceTools,
  ...reflectTools,
  ...sessionChainTools,
];

const signalTools: readonly ToolDef[] = [...signalsTools, ...signalStudyTools];

function registerTools(server: McpServer, tools: readonly ToolDef[]): void {
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.inputSchema, async (args) => {
      const result = await tool.handler(args as never);
      return {
        ...(result as Record<string, unknown>),
      } as { content: Array<{ type: 'text'; text: string }>; isError?: boolean; [key: string]: unknown };
    });
  }
}

export function registerCollabToolset(server: McpServer): void {
  registerTools(server, collabTools);
}

export function registerMemoryToolset(server: McpServer): void {
  registerTools(server, memoryTools);
}

export function registerSignalToolset(server: McpServer): void {
  registerTools(server, signalTools);
}

const limbNodeTools: readonly ToolDef[] = [...limbTools];

export function registerLimbToolset(server: McpServer): void {
  registerTools(server, limbNodeTools);
}

export function registerFullToolset(server: McpServer): void {
  registerCollabToolset(server);
  registerMemoryToolset(server);
  registerSignalToolset(server);
  registerLimbToolset(server);
}

/**
 * Compact descriptions for narrow-context models (e.g. GLM-5 196K).
 * OpenAI ChatCompletions serializes tool definitions into prompt_length,
 * so verbose descriptions (GOTCHA/TIP/WORKFLOW) waste ~100K+ tokens.
 * Compact mode keeps only the first sentence of each description.
 */
const COMPACT_DESCRIPTIONS: Record<string, string> = {
  // Collab
  cat_cafe_post_message: 'Post an async message to Clowder AI chat mid-task.',
  cat_cafe_get_pending_mentions: 'Get recent @-mentions for you. Call ack_mentions after processing.',
  cat_cafe_ack_mentions: 'Acknowledge processed mentions up to a message ID.',
  cat_cafe_get_thread_context: 'Get recent messages from a thread. Pass threadId for cross-thread.',
  cat_cafe_list_threads: 'List thread summaries. Filter by keyword or activeSince.',
  cat_cafe_feat_index: 'Lookup feature entries by featId or query.',
  cat_cafe_cross_post_message: 'Post a message to a different thread by threadId.',
  cat_cafe_list_tasks: 'List tasks with optional threadId/catId/status filters.',
  cat_cafe_list_skills:
    'List Cat Cafe shared skills available at runtime. Use before search/grep for workflow tasks; retry with exact skill name if intent search is empty.',
  cat_cafe_load_skill: 'Load one Cat Cafe shared skill by exact name.',
  cat_cafe_update_task: 'Update status of a task you own (doing/blocked/done).',
  cat_cafe_create_rich_block: 'Create a rich block (card/diff/checklist/media_gallery/audio/interactive). Must have kind, v:1, unique id.',
  cat_cafe_generate_document: 'Generate PDF/DOCX/MD from Markdown and deliver to IM.',
  cat_cafe_request_permission: 'Request user permission before a sensitive action.',
  cat_cafe_check_permission_status: 'Check status of a permission request by requestId.',
  cat_cafe_register_pr_tracking: 'Register a PR for review notification routing.',
  cat_cafe_update_workflow: 'Update SOP workflow stage for a Feature.',
  cat_cafe_multi_mention: 'Invoke up to 3 cats in parallel. Requires searchEvidenceRefs or overrideReason.',
  cat_cafe_start_vote: 'Start a voting session with cat voters.',
  cat_cafe_update_bootcamp_state: 'Update bootcamp training state for a thread.',
  cat_cafe_bootcamp_env_check: 'Run environment check for bootcamp.',
  cat_cafe_get_rich_block_rules: 'Get full rich block schema rules. Call once per session before creating blocks.',
  cat_cafe_submit_game_action: 'Submit a game action (kill/guard/divine/vote/speak/last_words).',
  cat_cafe_list_scheduled_tasks: 'List all registered scheduled tasks (builtin + dynamic) with status.',
  cat_cafe_list_schedule_templates: 'List available schedule task templates (reminder, web-digest, repo-activity).',
  cat_cafe_preview_scheduled_task: 'Preview a scheduled task draft before creating it.',
  cat_cafe_register_scheduled_task: 'Create a new scheduled task from a template. Preview first.',
  cat_cafe_remove_scheduled_task: 'Remove a dynamic scheduled task by ID.',
  // Memory
  cat_cafe_retain_memory_callback: 'Retain a durable memory item with optional tags.',
  cat_cafe_search_evidence: 'Search project knowledge base. Modes: lexical/semantic/hybrid.',
  cat_cafe_reflect: 'Ask a reflective question synthesizing project knowledge.',
  cat_cafe_list_session_chain: 'List session chain for a thread by catId.',
  cat_cafe_read_session_events: 'Read events from a sealed session (raw/chat/handoff views).',
  cat_cafe_read_session_digest: 'Read extractive digest of a sealed session.',
  cat_cafe_read_invocation_detail: 'Read all events for a specific invocation.',
  // Signals
  signal_list_inbox: 'List recent signal articles from inbox.',
  signal_get_article: 'Get full signal article detail by id or URL.',
  signal_search: 'Search signal articles by keyword.',
  signal_mark_read: 'Mark a signal article as read.',
  signal_summarize: 'Generate a concise summary for a signal article.',
  signal_update_article: 'Update article status, tags, or note.',
  signal_delete_article: 'Soft-delete signal articles by IDs.',
  signal_link_thread: 'Link/unlink a Signal article to a thread.',
  signal_start_study: 'Start studying a Signal article.',
  signal_save_notes: 'Save study notes for an article.',
  signal_list_studies: 'List study artifacts for an article.',
  signal_generate_podcast: 'Generate a podcast from an article (essence/deep mode).',
  // Limbs
  limb_list_available: 'List online limb nodes and capabilities.',
  limb_invoke: 'Invoke a capability on a limb node.',
  limb_pair_list: 'List pending limb pairing requests.',
  limb_pair_approve: 'Approve a limb pairing request.',
  // File tools (MCP-provided)
  read_file: 'Read file content by path.',
  write_file: 'Write content to a file.',
  list_files: 'List files in a directory.',
};

function compactTools(tools: readonly ToolDef[]): readonly ToolDef[] {
  return tools.map((t) => {
    const compact = COMPACT_DESCRIPTIONS[t.name];
    if (!compact) {
      console.error(`[compact-mcp] Missing compact description for tool: ${t.name}, using verbose fallback`);
    }
    return compact ? { ...t, description: compact } : t;
  });
}

/**
 * Register all tools with compact (one-line) descriptions.
 * Keeps full functionality — only descriptions are shortened.
 * Use for models where tool definitions count toward prompt_length.
 */
export function registerCompactToolset(server: McpServer): void {
  registerTools(server, compactTools(collabTools));
  registerTools(server, compactTools(memoryTools));
  registerTools(server, compactTools(signalTools));
  registerTools(server, compactTools(limbNodeTools));
}
