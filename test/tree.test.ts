import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseProcessList,
  buildProcessTree,
  findNode,
  getAncestors,
  getDescendants,
} from "../src/tree.js";

test("parseProcessList", async (t) => {
  await t.test("parses pid, ppid, and command from a line", () => {
    const [record] = parseProcessList("1 0 /sbin/init");
    assert.deepEqual(record, { pid: 1, ppid: 0, command: "/sbin/init" });
  });

  await t.test("keeps spaces inside the command", () => {
    const [record] = parseProcessList("981 455 sshd: user@pts/0");
    assert.equal(record.command, "sshd: user@pts/0");
  });

  await t.test("skips a header row", () => {
    const records = parseProcessList("PID PPID COMMAND\n1 0 init");
    assert.equal(records.length, 1);
    assert.equal(records[0].pid, 1);
  });

  await t.test("skips blank lines and lines that don't match the shape", () => {
    const records = parseProcessList("\n1 0 init\n\ngarbage line\n");
    assert.equal(records.length, 1);
  });

  await t.test("trims trailing whitespace and handles CRLF line endings", () => {
    const records = parseProcessList("1 0 init  \r\n2 1 child \r\n");
    assert.equal(records.length, 2);
    assert.equal(records[0].command, "init");
    assert.equal(records[1].command, "child");
  });

  await t.test("returns an empty array for empty input", () => {
    assert.deepEqual(parseProcessList(""), []);
  });
});

test("buildProcessTree", async (t) => {
  await t.test("links a child under its parent", () => {
    const roots = buildProcessTree([
      { pid: 1, ppid: 0, command: "init" },
      { pid: 2, ppid: 1, command: "child" },
    ]);
    assert.equal(roots.length, 1);
    assert.equal(roots[0].pid, 1);
    assert.equal(roots[0].children.length, 1);
    assert.equal(roots[0].children[0].pid, 2);
  });

  await t.test("treats a record with no matching ppid as a root", () => {
    const roots = buildProcessTree([{ pid: 5, ppid: 999, command: "orphan" }]);
    assert.equal(roots.length, 1);
    assert.equal(roots[0].pid, 5);
  });

  await t.test("treats a self-parented record as a root", () => {
    const roots = buildProcessTree([
      { pid: 1, ppid: 1, command: "init" },
      { pid: 2, ppid: 1, command: "child" },
    ]);
    assert.equal(roots.length, 1);
    assert.equal(roots[0].pid, 1);
    assert.equal(roots[0].children[0].pid, 2);
  });

  await t.test("preserves the order children appear in the input", () => {
    const roots = buildProcessTree([
      { pid: 1, ppid: 0, command: "init" },
      { pid: 3, ppid: 1, command: "second" },
      { pid: 2, ppid: 1, command: "first" },
    ]);
    assert.deepEqual(
      roots[0].children.map((child) => child.pid),
      [3, 2],
    );
  });

  await t.test("builds a multi-level tree", () => {
    const roots = buildProcessTree([
      { pid: 1, ppid: 0, command: "init" },
      { pid: 455, ppid: 1, command: "sshd" },
      { pid: 981, ppid: 455, command: "sshd: user@pts/0" },
      { pid: 982, ppid: 981, command: "-zsh" },
    ]);
    const sshd = roots[0].children[0];
    const session = sshd.children[0];
    assert.equal(session.children[0].command, "-zsh");
  });

  await t.test("returns an empty forest for empty input", () => {
    assert.deepEqual(buildProcessTree([]), []);
  });
});

function sampleTree() {
  return buildProcessTree([
    { pid: 1, ppid: 0, command: "init" },
    { pid: 455, ppid: 1, command: "sshd" },
    { pid: 981, ppid: 455, command: "sshd: user@pts/0" },
    { pid: 982, ppid: 981, command: "-zsh" },
    { pid: 120, ppid: 1, command: "systemd-journald" },
  ]);
}

test("findNode", async (t) => {
  await t.test("finds a root node", () => {
    assert.equal(findNode(sampleTree(), 1)?.command, "init");
  });

  await t.test("finds a deeply nested node", () => {
    assert.equal(findNode(sampleTree(), 982)?.command, "-zsh");
  });

  await t.test("returns undefined for a pid not in the tree", () => {
    assert.equal(findNode(sampleTree(), 999), undefined);
  });
});

test("getAncestors", async (t) => {
  await t.test("lists ancestors root-first", () => {
    const ancestors = getAncestors(sampleTree(), 982);
    assert.deepEqual(
      ancestors.map((node) => node.pid),
      [1, 455, 981],
    );
  });

  await t.test("returns an empty array for a root node", () => {
    assert.deepEqual(getAncestors(sampleTree(), 1), []);
  });

  await t.test("returns an empty array for a pid not in the tree", () => {
    assert.deepEqual(getAncestors(sampleTree(), 999), []);
  });
});

test("getDescendants", async (t) => {
  await t.test("lists descendants in depth-first order", () => {
    const descendants = getDescendants(sampleTree(), 1);
    assert.deepEqual(
      descendants.map((node) => node.pid),
      [455, 981, 982, 120],
    );
  });

  await t.test("returns an empty array for a leaf node", () => {
    assert.deepEqual(getDescendants(sampleTree(), 982), []);
  });

  await t.test("returns an empty array for a pid not in the tree", () => {
    assert.deepEqual(getDescendants(sampleTree(), 999), []);
  });
});
