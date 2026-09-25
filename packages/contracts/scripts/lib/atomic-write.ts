import { openSync, writeSync, fsyncSync, closeSync, renameSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/// Best-effort fsync of a directory entry so a `rename` into it is durable across a crash. Not all
/// platforms allow opening a directory for fsync (e.g. Windows) — a failure here only weakens
/// durability, never correctness, so it is swallowed.
function fsyncDir(dir: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(dir, "r");
    fsyncSync(fd);
  } catch {
    // ignore — durability best-effort only
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/// Serialize `data` to pretty JSON and write it to `target` atomically: a unique `O_EXCL` temp
/// file in the SAME directory (so `rename` is atomic on one filesystem), fsync'd, then renamed
/// over the target — a crash mid-write never leaves a partial/corrupt manifest. A bigint replacer
/// is defense-in-depth (a validated manifest has no bigint fields; blocks/amounts serialize as
/// decimal strings, never floats).
export function writeJsonAtomic(target: string, data: unknown): void {
  const dir = dirname(target);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${String(process.pid)}-${String(Date.now())}.tmp`);
  const json =
    JSON.stringify(
      data,
      (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ) + "\n";
  const fd = openSync(tmp, "wx"); // wx = O_CREAT | O_EXCL — fail if a temp with this name exists
  try {
    writeSync(fd, json);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, target);
  fsyncDir(dir); // make the rename itself durable, not just the file contents
}
