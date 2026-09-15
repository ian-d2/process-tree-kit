export interface ProcessRecord {
  pid: number;
  ppid: number;
  command: string;
}

export interface ProcessNode extends ProcessRecord {
  children: ProcessNode[];
}

const RECORD_LINE = /^(\d+)\s+(\d+)\s+(.+)$/;

/**
 * Parses text in the shape of `ps -eo pid,ppid,command` output: one process
 * per line, pid and ppid as the first two whitespace-separated fields,
 * everything after that treated as the command (which may itself contain
 * spaces). Header rows and any line that doesn't match that shape are
 * skipped rather than raising, since real captures often carry one.
 */
export function parseProcessList(text: string): ProcessRecord[] {
  const records: ProcessRecord[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const match = line.match(RECORD_LINE);
    if (!match) continue;
    const [, pidStr, ppidStr, command] = match;
    records.push({
      pid: Number(pidStr),
      ppid: Number(ppidStr),
      command: command.trim(),
    });
  }
  return records;
}

/**
 * Links flat records into a forest. A record is a root if nothing in the
 * input claims to be its parent, or if it lists itself as its own parent
 * (pid 0/1 on some systems does this) — both cases show up in real captures.
 */
export function buildProcessTree(records: ProcessRecord[]): ProcessNode[] {
  const nodesByPid = new Map<number, ProcessNode>();
  for (const record of records) {
    nodesByPid.set(record.pid, { ...record, children: [] });
  }

  const roots: ProcessNode[] = [];
  for (const node of nodesByPid.values()) {
    const parent = node.ppid === node.pid ? undefined : nodesByPid.get(node.ppid);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** Renders a forest as a `tree`-style ASCII diagram, one line per process. */
export function renderTree(nodes: ProcessNode[]): string {
  const lines: string[] = [];

  const walk = (node: ProcessNode, prefix: string, isLast: boolean, isRoot: boolean) => {
    const label = `${node.command} (${node.pid})`;
    lines.push(isRoot ? label : `${prefix}${isLast ? "└── " : "├── "}${label}`);
    const childPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
    node.children.forEach((child, index) => {
      walk(child, childPrefix, index === node.children.length - 1, false);
    });
  };

  nodes.forEach((node, index) => walk(node, "", index === nodes.length - 1, true));
  return lines.join("\n");
}
