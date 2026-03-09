use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::UNIX_EPOCH;
use tauri::{
    menu::{AboutMetadata, Menu, PredefinedMenuItem, Submenu},
    LogicalSize, Manager, Size,
};
use walkdir::WalkDir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryEntry {
    name: String,
    absolute_path: String,
    relative_directory: String,
    modified_at: String,
    size: u64,
}

#[tauri::command]
fn list_library_entries(
    directory: String,
    extension: String,
    include_subdirectories: bool,
) -> Result<Vec<LibraryEntry>, String> {
    let normalized_extension = extension.trim_start_matches('.').to_lowercase();
    let mut entries = Vec::new();
    let root_path = PathBuf::from(&directory);

    if include_subdirectories {
        for entry in WalkDir::new(&root_path)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
        {
            if !entry.file_type().is_file() {
                continue;
            }

            push_library_entry(&mut entries, &root_path, entry.path(), &normalized_extension)?;
        }
    } else {
        for entry in fs::read_dir(&root_path).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();

            if !path.is_file() {
                continue;
            }

            push_library_entry(&mut entries, &root_path, &path, &normalized_extension)?;
        }
    }

    entries.sort_by(|left, right| left.absolute_path.to_lowercase().cmp(&right.absolute_path.to_lowercase()));

    Ok(entries)
}

fn push_library_entry(
    entries: &mut Vec<LibraryEntry>,
    root_path: &PathBuf,
    path: &std::path::Path,
    normalized_extension: &str,
) -> Result<(), String> {
    let path_extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
        .unwrap_or_default();

    if path_extension != normalized_extension {
        return Ok(());
    }

    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs().to_string())
        .unwrap_or_default();
    let relative_directory = path
        .parent()
        .and_then(|parent| parent.strip_prefix(root_path).ok())
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .map(|value| value.trim_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .map(|value| format!("/{}", value))
        .unwrap_or_default();

    entries.push(LibraryEntry {
        name: path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string(),
        absolute_path: path.to_string_lossy().to_string(),
        relative_directory,
        modified_at,
        size: metadata.len(),
    });

    Ok(())
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
fn move_file_to_trash(absolute_path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let escaped_path = absolute_path.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!("tell application \"Finder\" to delete POSIX file \"{}\"", escaped_path);
        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|error| error.to_string())?;

        if output.status.success() {
            return Ok(());
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Failed to move file to Trash: {}", absolute_path)
        } else {
            stderr
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = absolute_path;
        Err("Move to Trash is not implemented on this platform yet.".to_string())
    }
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
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            #[cfg(target_os = "macos")]
            {
                let pkg_info = app.package_info();
                let config = app.config();
                let about_metadata = AboutMetadata {
                    name: Some(pkg_info.name.clone()),
                    version: Some(pkg_info.version.to_string()),
                    credits: Some("By John Sherlock".to_string()),
                    copyright: config.bundle.copyright.clone(),
                    authors: config.bundle.publisher.clone().map(|publisher| vec![publisher]),
                    ..Default::default()
                };

                let menu = Menu::with_items(
                    app,
                    &[
                        &Submenu::with_items(
                            app,
                            pkg_info.name.clone(),
                            true,
                            &[
                                &PredefinedMenuItem::about(app, None, Some(about_metadata))?,
                                &PredefinedMenuItem::separator(app)?,
                                &PredefinedMenuItem::services(app, None)?,
                                &PredefinedMenuItem::separator(app)?,
                                &PredefinedMenuItem::hide(app, None)?,
                                &PredefinedMenuItem::hide_others(app, None)?,
                                &PredefinedMenuItem::show_all(app, None)?,
                                &PredefinedMenuItem::separator(app)?,
                                &PredefinedMenuItem::quit(app, None)?,
                            ],
                        )?,
                        &Submenu::with_items(
                            app,
                            "File",
                            true,
                            &[&PredefinedMenuItem::close_window(app, None)?],
                        )?,
                        &Submenu::with_items(
                            app,
                            "View",
                            true,
                            &[&PredefinedMenuItem::fullscreen(app, None)?],
                        )?,
                        &Submenu::with_items(
                            app,
                            "Window",
                            true,
                            &[
                                &PredefinedMenuItem::minimize(app, None)?,
                                &PredefinedMenuItem::maximize(app, None)?,
                                &PredefinedMenuItem::separator(app)?,
                                &PredefinedMenuItem::close_window(app, None)?,
                            ],
                        )?,
                        &Submenu::with_items(
                            app,
                            "Help",
                            true,
                            &[&PredefinedMenuItem::about(app, None, None)?],
                        )?,
                    ],
                )?;

                app.set_menu(menu)?;
            }

            if let Some(window) = app.get_webview_window("main") {
                let target_width = 1440.0;
                let target_height = window
                    .current_monitor()
                    .ok()
                    .flatten()
                    .map(|monitor| {
                        let scale_factor = monitor.scale_factor();
                        let logical_height = monitor.size().height as f64 / scale_factor;
                        logical_height.min(1380.0)
                    })
                    .unwrap_or(1380.0);

                let _ = window.set_size(Size::Logical(LogicalSize::new(target_width, target_height)));
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_library_entries,
            read_text_file,
            write_text_file,
            move_file_to_trash,
            load_blank_template
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::list_library_entries;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_temp_root() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time should be monotonic")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("helix-setlist-editor-{suffix}"));
        fs::create_dir_all(&root).expect("should create temp root");
        root
    }

    #[test]
    fn lists_only_root_level_matches_when_recursion_is_disabled() {
        let root = create_temp_root();
        let nested = root.join("Nested");
        fs::create_dir_all(&nested).expect("should create nested dir");
        fs::write(root.join("Root.hls"), "{}").expect("should write root file");
        fs::write(nested.join("Nested.hls"), "{}").expect("should write nested file");

        let entries = list_library_entries(root.to_string_lossy().to_string(), ".hls".into(), false)
            .expect("listing should succeed");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Root");
        assert_eq!(entries[0].relative_directory, "");

        fs::remove_dir_all(root).expect("should clean temp root");
    }

    #[test]
    fn lists_nested_matches_and_relative_directories_when_recursion_is_enabled() {
        let root = create_temp_root();
        let nested = root.join("Pearl Jam");
        fs::create_dir_all(&nested).expect("should create nested dir");
        fs::write(root.join("Alive.hlx"), "{}").expect("should write root file");
        fs::write(nested.join("Alive.hlx"), "{}").expect("should write nested file");

        let entries = list_library_entries(root.to_string_lossy().to_string(), ".hlx".into(), true)
            .expect("listing should succeed");

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].relative_directory, "");
        assert_eq!(entries[1].relative_directory, "/Pearl Jam");

        fs::remove_dir_all(root).expect("should clean temp root");
    }
}
