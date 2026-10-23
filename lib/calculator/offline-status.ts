import { engineBuild } from "./engine-build";

export function readOfflineStatus(message: unknown) {
  if (
    !message ||
    typeof message !== "object" ||
    !("type" in message) ||
    message.type !== "OFFLINE_STATUS" ||
    !("protocol" in message) ||
    message.protocol !== engineBuild.protocol ||
    !("engineId" in message) ||
    message.engineId !== engineBuild.id ||
    !("status" in message)
  )
    return;
  const status = message.status;
  if (
    !status ||
    typeof status !== "object" ||
    !("state" in status) ||
    typeof status.state !== "string" ||
    !("done" in status) ||
    typeof status.done !== "number" ||
    !Number.isSafeInteger(status.done) ||
    status.done < 0 ||
    !("total" in status) ||
    typeof status.total !== "number" ||
    !Number.isSafeInteger(status.total) ||
    status.total < status.done
  )
    return;
  if (
    status.state === "Ready" &&
    (!("protocol" in status) ||
      status.protocol !== engineBuild.protocol ||
      !("engineId" in status) ||
      status.engineId !== engineBuild.id ||
      !("version" in status) ||
      typeof status.version !== "string" ||
      !("completedAt" in status) ||
      typeof status.completedAt !== "number" ||
      !Number.isFinite(status.completedAt) ||
      status.completedAt <= 0)
  )
    return;
  if (
    status.state === "Ready" &&
    (status.done === 0 || status.done !== status.total)
  )
    return;
  return { state: status.state, done: status.done, total: status.total };
}
