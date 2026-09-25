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

/**
 * Finds the node for a given pid anywhere in the forest, or undefined if no
 * process with that pid was in the input. Walks the tree rather than
 * requiring callers to keep their own pid index around.
 */
export function findNode(nodes: ProcessNode[], pid: number): ProcessNode | undefined {
  for (const node of nodes) {
    if (node.pid === pid) return node;
    const found = findNode(node.children, pid);
    if (found) return found;
  }
  return undefined;
}

/**
 * Returns the chain of nodes from the root down to (but not including) the
 * node with the given pid, ordered root-first. Empty if the pid isn't
 * present or is itself a root.
 */
export function getAncestors(nodes: ProcessNode[], pid: number): ProcessNode[] {
  const path: ProcessNode[] = [];

  const walk = (candidates: ProcessNode[]): boolean => {
    for (const node of candidates) {
      if (node.pid === pid) return true;
      path.push(node);
      if (walk(node.children)) return true;
      path.pop();
    }
    return false;
  };

  return walk(nodes) ? path : [];
}

/**
 * Returns every node reachable below the node with the given pid, in
 * depth-first order. Empty if the pid isn't present or has no children.
 */
export function getDescendants(nodes: ProcessNode[], pid: number): ProcessNode[] {
  const start = findNode(nodes, pid);
  if (!start) return [];

  const descendants: ProcessNode[] = [];
  const walk = (node: ProcessNode) => {
    for (const child of node.children) {
      descendants.push(child);
      walk(child);
    }
  };
  walk(start);
  return descendants;
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
