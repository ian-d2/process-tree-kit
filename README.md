# process-tree-kit

A small TypeScript library for turning a flat process listing — the kind
`ps -eo pid,ppid,command` prints — into a navigable process tree.

## The problem

`ps` gives you a flat list of pid/ppid/command triples. Reconstructing the
parent-child structure — what spawned what — means writing the same bit of
bookkeeping every time you need it. This library does that once: parse the
flat list, link it into a tree, walk it.

It has to work with input from two different places: a live pipe
(`ps -eo pid,ppid,command | node script.js`) and a saved snapshot (a file
captured earlier, useful for postmortem debugging after the processes in
question are long gone). Both are common enough that reading from stdin and
reading from a file are both first-class, not one bolted onto the other.

## Usage

```ts
import {
  readProcessListInput,
  parseProcessList,
  buildProcessTree,
  renderTree,
} from "process-tree-kit";

// From a saved snapshot file:
const fromFile = await readProcessListInput("./snapshot.txt");

// From stdin (omit the argument, or pass "-"):
const fromStdin = await readProcessListInput();

const records = parseProcessList(fromStdin);
const roots = buildProcessTree(records);
console.log(renderTree(roots));
```

Given input like:

```
PID   PPID  COMMAND
1     0     /sbin/init
120   1     systemd-journald
455   1     sshd
981   455   sshd: user@pts/0
982   981   -zsh
```

`renderTree` prints:

```
/sbin/init (1)
├── systemd-journald (120)
└── sshd (455)
    └── sshd: user@pts/0 (981)
        └── -zsh (982)
```

## Capturing input

To feed this from a live system, either save a snapshot:

```sh
ps -eo pid,ppid,command > snapshot.txt
```

or pipe it directly into a script that calls `readProcessListInput()` with
no argument:

```sh
ps -eo pid,ppid,command | node your-script.js
```

`parseProcessList` skips the header row and any line that doesn't match
`PID PPID COMMAND...`, so both forms of input work without preprocessing.

## Status

Early skeleton. Parsing, tree building, and ASCII rendering work; nothing
else does yet. Not published to npm.

## License

MIT
