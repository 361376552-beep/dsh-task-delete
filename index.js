/**
 * Host half of @local/dsh-task-delete.
 *
 * Registers one exact HTTP route on the local webserver. The browser half
 * (client.js) POSTs { sessionId } there from the sidebar session menu.
 *
 * Delete strategy (safety first):
 *  - Archive the session through the workspace controller first. This is the
 *    official registry path: the sidebar row disappears live via the registry
 *    delta, and running work refuses archival (we surface that as "running").
 *  - Then move the on-disk session directory and its projection cache into
 *    $DSH_HOME/trash/task-delete-<stamp>/ (recoverable; nothing is hard-deleted).
 *  - workspace.json itself is never hand-edited; the registry owns its writes.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const inject = ["webServer", "workspaceController"];

const ROUTE = "/dsh-task-delete/delete";
const SESSION_ID = /^session-[0-9a-zA-Z-]{4,120}$/;

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function remoteCode(error) {
  if (!error || typeof error !== "object") return undefined;
  return error.code ?? error.remoteCode ?? error.data?.code;
}

/** Move one path into the trash root, keeping a stable relative layout. */
async function moveToTrash(source, trashRoot, relative) {
  const dest = path.join(trashRoot, relative);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rename(source, dest);
  return dest;
}

export function apply(ctx) {
  const handler = async (req, res) => {
    try {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, reason: "method", message: "仅支持 POST" });
        return;
      }
      // A custom header makes browsers preflight cross-origin calls, which we
      // never answer with CORS headers: web drive-by deletion is not possible.
      if (req.headers["x-dsh-task-delete"] !== "1") {
        sendJson(res, 403, { ok: false, reason: "forbidden", message: "缺少插件请求头" });
        return;
      }
      const raw = await readBody(req, 4096);
      let sessionId;
      try {
        sessionId = JSON.parse(raw)?.sessionId;
      } catch {
        sendJson(res, 400, { ok: false, reason: "bad-json", message: "请求体不是合法 JSON" });
        return;
      }
      if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) {
        sendJson(res, 400, { ok: false, reason: "bad-session-id", message: "sessionId 不合法" });
        return;
      }

      // 1) Registry archival: live sidebar removal + running-work protection.
      let archived = false;
      try {
        await ctx.workspaceController.archiveSession({ sessionId });
        archived = true;
      } catch (error) {
        const code = remoteCode(error);
        if (code === "workspace/session-active") {
          sendJson(res, 409, {
            ok: false,
            reason: "running",
            message: "任务正在运行，请先停止它再删除",
          });
          return;
        }
        if (code !== "session/not-found") throw error;
        // Unknown to the registry (orphan on disk): fall through to file move.
      }

      // 2) Move transcript + projection cache to the recoverable trash.
      const home = dshHome();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const trashRoot = path.join(home, "trash", `task-delete-${stamp}`);
      const moved = [];

      const sessionsRoot = path.join(home, "sessions");
      let sessionDir = null;
      try {
        for (const entry of await fs.readdir(sessionsRoot, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const candidate = path.join(sessionsRoot, entry.name, sessionId);
          try {
            const stat = await fs.lstat(candidate);
            if (stat.isDirectory()) {
              sessionDir = candidate;
              break;
            }
          } catch {
            /* not in this workspace slug */
          }
        }
      } catch {
        /* no sessions root */
      }
      if (sessionDir) {
        moved.push(await moveToTrash(sessionDir, trashRoot, path.join("sessions", sessionId)));
      }

      const cacheFile = path.join(home, "storages", "session_projcache", "sessions", `${sessionId}.json`);
      try {
        await fs.access(cacheFile);
        moved.push(await moveToTrash(cacheFile, trashRoot, path.join("projcache", `${sessionId}.json`)));
      } catch {
        /* no projection cache */
      }

      if (!archived && moved.length === 0) {
        sendJson(res, 404, { ok: false, reason: "not-found", message: "注册表和磁盘上都找不到这个任务" });
        return;
      }
      sendJson(res, 200, { ok: true, archived, moved, trash: moved.length > 0 ? trashRoot : null });
    } catch (error) {
      ctx.logger?.warn?.(error instanceof Error ? error : new Error(String(error)));
      sendJson(res, 500, {
        ok: false,
        reason: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  ctx.effect(
    () => ctx.webServer.register({ kind: "exact", path: ROUTE, handler }),
    "task-delete: delete route",
  );
}
