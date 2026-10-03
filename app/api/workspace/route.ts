import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { validateState } from "@/lib/calculator/storage";
import {
  MAX_WORKSPACE_REQUEST_BYTES,
  WORKSPACE_SIZE_ERROR,
} from "@/lib/calculator/workspace-request";
export const dynamic = "force-dynamic";
const reply = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "Sign in to open your saved work." }, 401);
  try {
    if (!env.DB) throw Error("Database unavailable");
    const row = await env.DB.prepare(
      "SELECT state, revision FROM workspaces WHERE user_id = ?",
    )
      .bind(user.userId)
      .first<{ state: string; revision: number }>();
    return reply({
      user: { id: user.userId, name: user.displayName },
      state: row ? JSON.parse(row.state) : null,
      revision: row?.revision ?? 0,
    });
  } catch (error) {
    console.error("workspace_read_failed", error);
    return reply(
      {
        user: { id: user.userId, name: user.displayName },
        error:
          "Saved work is temporarily unavailable. Your offline copy is unchanged.",
      },
      503,
    );
  }
}
export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "Sign in again to sync your work." }, 401);
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    return reply({ error: "Invalid request origin." }, 403);
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return reply({ error: "Expected a workspace." }, 415);
  let encoded: string;
  let revision: number;
  try {
    const reader = request.body?.getReader();
    let length = 0;
    const chunks: Uint8Array[] = [];
    if (!reader) return reply({ error: "Missing workspace." }, 400);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_WORKSPACE_REQUEST_BYTES) {
        await reader.cancel();
        return reply(
          {
            error: WORKSPACE_SIZE_ERROR,
          },
          413,
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (body.account !== user.userId)
      return reply({ error: "Account changed. Reload before saving." }, 401);
    const state = validateState(body.state);
    if (!Number.isSafeInteger(body.revision) || body.revision < 0)
      return reply({ error: "Invalid save revision." }, 400);
    encoded = JSON.stringify(state);
    revision = body.revision;
  } catch (error) {
    console.error("workspace_validation_failed", error);
    return reply(
      {
        error: "Save could not complete. Your local working copy is preserved.",
      },
      400,
    );
  }
  try {
    if (!env.DB) throw Error("Database unavailable");
    const now = Date.now();
    const result =
      revision === 0
        ? await env.DB.prepare(
            "INSERT INTO workspaces (user_id,state,revision,updated_at) VALUES (?,?,1,?) ON CONFLICT(user_id) DO NOTHING",
          )
            .bind(user.userId, encoded, now)
            .run()
        : await env.DB.prepare(
            "UPDATE workspaces SET state=?, revision=revision+1, updated_at=? WHERE user_id=? AND revision=?",
          )
            .bind(encoded, now, user.userId, revision)
            .run();
    if (!result.meta.changes)
      return reply(
        {
          error: "Another device saved newer work. Both versions will be kept.",
        },
        409,
      );
    return reply({ revision: revision + 1 });
  } catch (error) {
    console.error("workspace_save_failed", error);
    return reply(
      {
        error:
          "Cloud saves are temporarily unavailable. Your local working copy is preserved.",
      },
      503,
    );
  }
}
