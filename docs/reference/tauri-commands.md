# Tauri Commands Reference

Backend commands are exposed from `src-tauri/src/lib.rs`.

## `save_logo`

- Input: `source_path: string`, `subscription_id: string`
- Behavior: opens image from local path, creates thumbnail, stores as `.webp`
- Returns: saved filename

## `get_logo_base64`

- Input: `filename: string`
- Behavior: reads saved logo and returns data URI

## `delete_logo`

- Input: `filename: string`
- Behavior: removes logo file if present

## Validation Rules

- Only safe `.webp` filenames are accepted
- Path traversal and hidden file patterns are rejected
