/**
 * Discord Server Setup MCP Server Entry Point
 *
 * This is the main entry point for the MCP server that provides tools
 * for automating Discord server setup via the Discord Bot API.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Import guild tools
import {
  listGuildsToolDefinition,
  selectGuildToolDefinition,
  getGuildInfoToolDefinition,
  listGuildsHandler,
  selectGuildHandler,
  getGuildInfoHandler,
  ListGuildsInputSchema,
  SelectGuildInputSchema,
  GetGuildInfoInputSchema,
} from './tools/guild.js';

// Import channel tools
import {
  createCategoryToolDefinition,
  createChannelToolDefinition,
  editChannelToolDefinition,
  deleteChannelToolDefinition,
  createCategoryHandler,
  createChannelHandler,
  editChannelHandler,
  deleteChannelHandler,
  CreateCategoryInputSchema,
  CreateChannelInputSchema,
  EditChannelInputSchema,
  DeleteChannelInputSchema,
} from './tools/channels.js';

// Import role tools
import {
  createRoleToolDefinition,
  editRoleToolDefinition,
  deleteRoleToolDefinition,
  reorderRolesToolDefinition,
  createRoleHandler,
  editRoleHandler,
  deleteRoleHandler,
  reorderRolesHandler,
  CreateRoleInputSchema,
  EditRoleInputSchema,
  DeleteRoleInputSchema,
  ReorderRolesInputSchema,
} from './tools/roles.js';

// Import settings tools
import {
  updateServerSettingsToolDefinition,
  setVerificationLevelToolDefinition,
  setContentFilterToolDefinition,
  setDefaultNotificationsToolDefinition,
  updateServerSettingsHandler,
  setVerificationLevelHandler,
  setContentFilterHandler,
  setDefaultNotificationsHandler,
  UpdateServerSettingsInputSchema,
  SetVerificationLevelInputSchema,
  SetContentFilterInputSchema,
  SetDefaultNotificationsInputSchema,
} from './tools/settings.js';

// Import template tools
import {
  listTemplatesToolDefinition,
  previewTemplateToolDefinition,
  applyTemplateToolDefinition,
  listTemplatesHandler,
  previewTemplateHandler,
  applyTemplateHandler,
  ListTemplatesInputSchema,
  PreviewTemplateInputSchema,
  ApplyTemplateInputSchema,
} from './tools/templates.js';

// Import content tools
import {
  sendMessageToolDefinition,
  postEmbedToolDefinition,
  pinMessageToolDefinition,
  createForumPostToolDefinition,
  postViaWebhookToolDefinition,
  postMessageWithComponentsToolDefinition,
  sendMessageHandler,
  postEmbedHandler,
  pinMessageHandler,
  createForumPostHandler,
  postViaWebhookHandler,
  postMessageWithComponentsHandler,
  SendMessageInputSchema,
  PostEmbedInputSchema,
  PinMessageInputSchema,
  CreateForumPostInputSchema,
  PostViaWebhookInputSchema,
  PostMessageWithComponentsInputSchema,
} from './tools/content.js';

// Import blueprint tools
import {
  applyBlueprintToolDefinition,
  planBlueprintToolDefinition,
  exportServerToolDefinition,
  applyBlueprintHandler,
  planBlueprintHandler,
  exportServerHandler,
  ApplyBlueprintInputSchema,
  PlanBlueprintInputSchema,
  ExportServerInputSchema,
} from './tools/blueprint.js';

// Import server-feature tools
import { configureAutomodToolDefinition, configureAutomodHandler, ConfigureAutomodInputSchema } from './tools/automod.js';
import { createScheduledEventToolDefinition, createScheduledEventHandler, CreateScheduledEventInputSchema } from './tools/events.js';
import { createInviteToolDefinition, createInviteHandler, CreateInviteInputSchema } from './tools/invites.js';
import {
  enableCommunityToolDefinition, enableCommunityHandler, EnableCommunityInputSchema,
  configureOnboardingToolDefinition, configureOnboardingHandler, ConfigureOnboardingInputSchema,
  setWelcomeScreenToolDefinition, setWelcomeScreenHandler, SetWelcomeScreenInputSchema,
} from './tools/community.js';
import { setServerBrandingToolDefinition, setServerBrandingHandler, SetServerBrandingInputSchema } from './tools/branding.js';

// Server metadata
const SERVER_NAME = 'discord-setup-mcp';
const SERVER_VERSION = '3.1.0';

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Register a tool: validate input against the zod schema, run the handler
 * (sync or async), and serialize the result — or any thrown error — as JSON
 * text content.
 */
function registerTool<T extends z.ZodObject<any>>(
  server: McpServer,
  definition: { name: string; description: string; inputSchema: unknown },
  schema: T,
  handler: (input: z.infer<T>) => ToolResult | Promise<ToolResult>
): void {
  server.registerTool(
    definition.name,
    { description: definition.description, inputSchema: schema.shape },
    async (params: unknown) => {
      let result: ToolResult;
      try {
        const parseResult = schema.safeParse(params);
        if (!parseResult.success) {
          result = { success: false, error: `Validation error: ${parseResult.error.message}` };
        } else {
          result = await handler(parseResult.data);
        }
      } catch (error) {
        result = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );
}

/**
 * Create and configure the MCP server with all tools registered
 */
function createServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: `Discord Server Setup MCP Server

Builds out and fills a Discord server through a bot over the REST API: structure
(channels, categories, roles, permissions, settings), content (messages, embeds,
pins, forum posts, webhook personas, link buttons), server features (AutoMod,
scheduled events, invites, Community, onboarding, welcome screen, branding),
and full custom blueprints applied idempotently.

Important: a bot CANNOT create a blank server (Discord rejects it). The user
must create an empty server and invite the bot to it first.

Tool categories:
- Guild: list_guilds, select_guild, get_guild_info
- Blueprints (preferred for whole-server builds): plan_blueprint (dry-run),
  apply_blueprint (idempotent), export_server (clone to blueprint)
- Channels: create_category, create_channel, edit_channel, delete_channel
- Roles: create_role, edit_role, delete_role, reorder_roles
- Settings: update_server_settings, set_verification_level, set_content_filter,
  set_default_notifications
- Content: send_message, post_embed, pin_message, create_forum_post,
  post_via_webhook, post_message_with_components (link buttons only)
- Server features: configure_automod, create_scheduled_event, create_invite,
  enable_community, configure_onboarding, set_welcome_screen, set_server_branding
- Templates: list_templates, preview_template, apply_template

Permission names use SCREAMING_SNAKE_CASE (e.g. VIEW_CHANNEL, MANAGE_MESSAGES).
Announcement/stage channels, onboarding, and the welcome screen require the
Community feature — run enable_community first.

Workflow:
1. list_guilds to see available servers, select_guild to set the active one
2. For a whole server: plan_blueprint to preview, then apply_blueprint
3. For single operations: use the individual channel/role/content tools`,
    }
  );

  // Guild tools
  registerTool(server, listGuildsToolDefinition, ListGuildsInputSchema, listGuildsHandler);
  registerTool(server, selectGuildToolDefinition, SelectGuildInputSchema, selectGuildHandler);
  registerTool(server, getGuildInfoToolDefinition, GetGuildInfoInputSchema, getGuildInfoHandler);

  // Channel tools
  registerTool(server, createCategoryToolDefinition, CreateCategoryInputSchema, createCategoryHandler);
  registerTool(server, createChannelToolDefinition, CreateChannelInputSchema, createChannelHandler);
  registerTool(server, editChannelToolDefinition, EditChannelInputSchema, editChannelHandler);
  registerTool(server, deleteChannelToolDefinition, DeleteChannelInputSchema, deleteChannelHandler);

  // Role tools
  registerTool(server, createRoleToolDefinition, CreateRoleInputSchema, createRoleHandler);
  registerTool(server, editRoleToolDefinition, EditRoleInputSchema, editRoleHandler);
  registerTool(server, deleteRoleToolDefinition, DeleteRoleInputSchema, deleteRoleHandler);
  registerTool(server, reorderRolesToolDefinition, ReorderRolesInputSchema, reorderRolesHandler);

  // Settings tools
  registerTool(server, updateServerSettingsToolDefinition, UpdateServerSettingsInputSchema, updateServerSettingsHandler);
  registerTool(server, setVerificationLevelToolDefinition, SetVerificationLevelInputSchema, setVerificationLevelHandler);
  registerTool(server, setContentFilterToolDefinition, SetContentFilterInputSchema, setContentFilterHandler);
  registerTool(server, setDefaultNotificationsToolDefinition, SetDefaultNotificationsInputSchema, setDefaultNotificationsHandler);

  // Template tools
  registerTool(server, listTemplatesToolDefinition, ListTemplatesInputSchema, listTemplatesHandler);
  registerTool(server, previewTemplateToolDefinition, PreviewTemplateInputSchema, previewTemplateHandler);
  registerTool(server, applyTemplateToolDefinition, ApplyTemplateInputSchema, applyTemplateHandler);

  // Content tools
  registerTool(server, sendMessageToolDefinition, SendMessageInputSchema, sendMessageHandler);
  registerTool(server, postEmbedToolDefinition, PostEmbedInputSchema, postEmbedHandler);
  registerTool(server, pinMessageToolDefinition, PinMessageInputSchema, pinMessageHandler);
  registerTool(server, createForumPostToolDefinition, CreateForumPostInputSchema, createForumPostHandler);
  registerTool(server, postViaWebhookToolDefinition, PostViaWebhookInputSchema, postViaWebhookHandler);
  registerTool(server, postMessageWithComponentsToolDefinition, PostMessageWithComponentsInputSchema, postMessageWithComponentsHandler);

  // Blueprint tools
  registerTool(server, applyBlueprintToolDefinition, ApplyBlueprintInputSchema, applyBlueprintHandler);
  registerTool(server, planBlueprintToolDefinition, PlanBlueprintInputSchema, planBlueprintHandler);
  registerTool(server, exportServerToolDefinition, ExportServerInputSchema, exportServerHandler);

  // Server-feature tools
  registerTool(server, configureAutomodToolDefinition, ConfigureAutomodInputSchema, configureAutomodHandler);
  registerTool(server, createScheduledEventToolDefinition, CreateScheduledEventInputSchema, createScheduledEventHandler);
  registerTool(server, createInviteToolDefinition, CreateInviteInputSchema, createInviteHandler);
  registerTool(server, enableCommunityToolDefinition, EnableCommunityInputSchema, enableCommunityHandler);
  registerTool(server, configureOnboardingToolDefinition, ConfigureOnboardingInputSchema, configureOnboardingHandler);
  registerTool(server, setWelcomeScreenToolDefinition, SetWelcomeScreenInputSchema, setWelcomeScreenHandler);
  registerTool(server, setServerBrandingToolDefinition, SetServerBrandingInputSchema, setServerBrandingHandler);

  return server;
}

/**
 * Main entry point
 */
async function main() {
  // Create server
  const server = createServer();
  const transport = new StdioServerTransport();

  console.error('Discord Server Setup MCP Server starting...');

  // Connect server to transport
  await server.connect(transport);

  console.error(
    'Discord Server Setup MCP Server running on stdio (REST-only; no gateway connection).'
  );

  // Graceful shutdown handling — REST is stateless, nothing to close.
  const shutdown = async () => {
    console.error('Shutting down Discord MCP Server...');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run the server
main().catch((error) => {
  console.error('Fatal error starting MCP server:', error);
  process.exit(1);
});
