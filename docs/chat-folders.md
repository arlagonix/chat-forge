# Chat folders and default accessible paths

Chat folders organize existing chats and can define default accessible paths for
new chats created inside that folder.

## Folder menu

Each folder exposes its actions from the three-dots menu.

Without default accessible paths, the menu contains:

```text
New chat
Rename folder
---
No default accessible paths
Add folder
Add file
---
Delete folder
```

With default accessible paths, the menu contains:

```text
New chat
Rename folder
---
Default accessible paths: <count>
<path 1>
<path 2>
Add folder
Add file
Remove all default paths
---
Delete folder
```

Selecting an existing default path removes that path from the folder defaults.
The separate plus button on the folder row is intentionally not shown. Creating
a chat from a folder is handled through `New chat` in the folder menu.

## Default Accessible Path Behavior

A folder can have multiple default accessible paths. These use the existing
`ChatFolder.workspaceRoots` field for compatibility, but the user-facing model is
files and folders the chat can access.

When a user creates a new chat from a folder:

- the new chat draft is assigned to that folder,
- the draft inherits all folder default accessible paths,
- inherited paths are visible in the composer footer,
- the paths are saved on the chat when the first message is sent.

Changing or removing folder default accessible paths affects only future chats
created from that folder.

Existing chats are not automatically changed when:

- a folder default path is added,
- a folder default path is removed,
- a chat is moved into a folder.

## Chat menu

The chat three-dots menu keeps chat actions separate from accessible-path
editing:

```text
Rename
Pin
Generate title
Clone
New with same settings
---
Move to folder
---
Clear chat
Delete
```

Accessible paths are not shown in this menu. Changing or removing a chat's paths
is handled by the Accessible paths control in the composer footer.

## New With Same Settings Behavior

`New with same settings` does not create or persist a chat immediately. It opens
the same unsaved draft state as the main `New chat` action, then preloads the
selected chat's defaults.

The draft copies:

- provider/model settings,
- mode,
- tool, skill, and agent permissions,
- active skills,
- accessible paths,
- file-tool auto-approval settings,
- thinking mode,
- folder assignment, if the source folder still exists.

Messages are not copied. The real chat is created only when the user sends the
first message. If the source chat is inside a folder, the future chat is saved
into that same folder on first send.

## Clone Behavior

`Clone` creates a new chat from the selected chat and opens it immediately.

The cloned chat copies:

- messages,
- provider/model settings,
- mode,
- tool, skill, and agent permissions,
- active skills,
- accessible paths,
- file-tool auto-approval settings,
- thinking mode,
- folder assignment.

The cloned chat receives a new chat id and fresh `createdAt` / `updatedAt`
timestamps, so it appears as a recent chat.

Attachment files are not physically duplicated. The clone copies attachment
metadata and references, including existing storage paths.

## Rename Behavior

Renaming a chat updates only the chat title and title mode. It does not update
`updatedAt`, so a renamed chat does not jump to the top of the sidebar.
