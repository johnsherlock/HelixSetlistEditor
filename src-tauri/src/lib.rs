use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;
use tauri::Manager;
use walkdir::WalkDir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryEntry {
    name: String,
    absolute_path: String,
    modified_at: String,
    size: u64,
}

#[tauri::command]
fn list_library_entries(directory: String, extension: String) -> Result<Vec<LibraryEntry>, String> {
    let normalized_extension = extension.trim_start_matches('.').to_lowercase();
    let mut entries = Vec::new();

    for entry in WalkDir::new(&directory)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let path_extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_lowercase())
            .unwrap_or_default();

        if path_extension != normalized_extension {
            continue;
        }

        let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_secs().to_string())
            .unwrap_or_default();

        entries.push(LibraryEntry {
            name: path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string(),
            absolute_path: path.to_string_lossy().to_string(),
            modified_at,
            size: metadata.len(),
        });
    }

    entries.sort_by(|left, right| left.absolute_path.to_lowercase().cmp(&right.absolute_path.to_lowercase()));

    Ok(entries)
}

#[tauri::command]
fn read_text_file(absolute_path: String) -> Result<String, String> {
    fs::read_to_string(absolute_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_text_file(absolute_path: String, contents: String, overwrite: bool) -> Result<(), String> {
    let path = PathBuf::from(&absolute_path);

    if path.exists() && !overwrite {
        return Err(format!("Refusing to overwrite existing file: {}", absolute_path));
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_blank_template(app_handle: tauri::AppHandle) -> Result<String, String> {
    let resource_path = app_handle
        .path()
        .resolve("resources/Blank_Setlist.hls", tauri::path::BaseDirectory::Resource)
        .map_err(|error: tauri::Error| error.to_string())?;

    fs::read_to_string(resource_path).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_library_entries,
            read_text_file,
            write_text_file,
            load_blank_template
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
