# Project instructions

Molten Forge does not automatically load `AGENTS.md` from accessible paths.

The app is a general-purpose agent, so adding a folder gives the model file
access only; it does not let that folder inject behavior into the assistant.
If a user wants project instructions applied, they can ask the model to read the
exact `AGENTS.md` path through the normal `read` tool.

Example:

```text
Read C:\Prime\GitHub\my-project\AGENTS.md and follow it for this task.
```

The loaded file is treated as ordinary user-provided project context and remains
below system, developer, and app instructions.
