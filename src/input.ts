import { readFile } from "node:fs/promises";

/**
 * Reads raw process-list text from a file, or from stdin when `source` is
 * omitted or is "-". Piped `ps` output and a saved snapshot file need to be
 * interchangeable inputs to the same parser, so this is the one place that
 * decides which one it's looking at.
 */
export async function readProcessListInput(source?: string): Promise<string> {
  if (source && source !== "-") {
    return readFile(source, "utf8");
  }
  return readStdin();
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}
