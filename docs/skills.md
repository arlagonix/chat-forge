# Skills settings

Skills are filesystem folders that contain a `SKILL.md` file. Molten Forge discovers skills from:

- the global skills folder: `~/.agents/skills`

Project-local skills inside accessible folders are not discovered automatically.
If a user wants to use one, they can ask the model to read its exact
`SKILL.md` path through the normal `read` tool and follow it as ordinary
project-provided instructions.

## Searching skills

Use the search field in **Settings → Skills** to filter the list by skill name or frontmatter description. The search does not scan the full `SKILL.md` body or files inside the skill folder. The clear button inside the search field clears the query.

## Creating skills

Use **Settings → Skills → Create skill**.

Global skills are created at `~/.agents/skills/<skill-name>/SKILL.md`.

The skill name comes from the `name` field inside `SKILL.md` frontmatter. The name and description fields shown in the UI are readonly previews derived from `SKILL.md`, so the manifest remains the single source of truth.

Skill names must be unique across global skills and must use 1–64 letters, numbers, underscores, or hyphens. `skill` is reserved for the built-in loader tool. Name validation appears directly under the readonly name preview because `SKILL.md` is the source of truth.

Newly created skills are visible to models by default.

## Editing skills

Existing skills are edited as raw `SKILL.md` content so custom frontmatter fields are preserved. The readonly name and description previews update immediately as the raw manifest changes.

The readonly location field shows the skill manifest location. Use the folder button beside it to open the selected skill folder.

Use:

- **Open editor** to edit `SKILL.md` in a larger focused modal.
- **Save** to write changes to disk.
- **Reset** to restore the last saved version.

If the `name` in `SKILL.md` changes, Molten Forge attempts to rename the skill folder on save. If the folder rename fails, the save is aborted and the current on-disk skill is left unchanged when possible.

## Cloning skills

Use the selected skill's options menu and choose **Clone**. This opens the create form with the selected skill's `SKILL.md` content prefilled. Extra files from the source skill folder are not copied.

The cloned draft must be saved as a unique skill name before it can be created.

## Deleting skills

Use the selected skill's options menu and choose **Delete**. Deleting a skill removes the entire skill folder from disk after a warning confirmation.

## Reloading and file structure

Skills reload silently when the Skills settings dialog opens. Manual reload is available from the bottom options menu. Reload success does not show a toast to avoid repeated notifications.

The selected skill shows a level-one file structure preview so users can see which files are present beside `SKILL.md`.

## Availability and manual loading

The global Skills switch and each skill's On/Off switch control whether models can discover that skill by default. Modes and custom agents may override global availability with their own Global, Custom, On, or Off settings.

Skill availability is separate from approval. Model-initiated loading uses the built-in `skill` tool, whose normal Allow/Ask/Deny permission controls whether the model may load any visible skill.

Users can always load any discovered skill directly, regardless of model visibility or the `skill` tool permission, with either command:

- `/s/skill-name`
- `/skill/skill-name`

Manual commands use the slash form; the old colon form is not supported.
