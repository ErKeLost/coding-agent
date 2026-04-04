use serde::Serialize;
use rfd::{MessageDialog, MessageLevel};
use std::{
  fs,
  path::{Path, PathBuf},
  process::Command,
  sync::Mutex,
};
use std::{
  net::{TcpListener, TcpStream},
  time::{Duration, Instant},
};
use tauri::{State, WebviewUrl, WebviewWindowBuilder};
#[cfg(not(debug_assertions))]
use tauri::Manager;

struct WorkspaceState(Mutex<Option<PathBuf>>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceNode {
  name: String,
  path: String,
  is_dir: bool,
  children: Vec<WorkspaceNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceFile {
  name: String,
  path: String,
  language: String,
  content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspacePayload {
  root_path: String,
  root_name: String,
  tree: Vec<WorkspaceNode>,
  active_file: Option<WorkspaceFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceBranchPayload {
  has_git: bool,
  current_branch: Option<String>,
  branches: Vec<String>,
  has_changes: bool,
  has_remote: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceContentSearchMatch {
  line: usize,
  text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceContentSearchFile {
  path: String,
  name: String,
  total_matches: usize,
  matches: Vec<WorkspaceContentSearchMatch>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PickedWorkspaceFile {
  root_path: String,
  relative_path: String,
  name: String,
}

const MAX_TREE_DEPTH: usize = 3;
const MAX_ENTRIES_PER_DIR: usize = 24;
const MAX_FILE_PREVIEW_CHARS: usize = 24_000;
const MAX_FILE_PREVIEW_LINES: usize = 220;
const MAX_SEARCH_FILES: usize = 12;
const MAX_MATCHES_PER_FILE: usize = 6;

fn should_skip_dir(name: &str) -> bool {
  matches!(
    name,
    ".git"
      | ".next"
      | "node_modules"
      | "dist"
      | "build"
      | "coverage"
      | "target"
      | ".turbo"
      | ".idea"
      | ".vscode"
  )
}

fn is_code_file(path: &Path) -> bool {
  matches!(
    path.extension().and_then(|value| value.to_str()),
    Some(
      "ts"
        | "tsx"
        | "js"
        | "jsx"
        | "mjs"
        | "cjs"
        | "json"
        | "rs"
        | "py"
        | "md"
        | "mdx"
        | "css"
        | "html"
        | "toml"
        | "yaml"
        | "yml"
        | "sh"
        | "sql"
    )
  )
}

fn infer_language(path: &Path) -> String {
  match path.extension().and_then(|value| value.to_str()).unwrap_or_default() {
    "ts" => "typescript",
    "tsx" => "tsx",
    "js" => "javascript",
    "jsx" => "jsx",
    "json" => "json",
    "rs" => "rust",
    "py" => "python",
    "md" => "markdown",
    "mdx" => "mdx",
    "css" => "css",
    "html" => "html",
    "toml" => "toml",
    "yaml" | "yml" => "yaml",
    "sh" => "bash",
    "sql" => "sql",
    _ => "text",
  }
  .to_string()
}

fn relative_path(path: &Path, root: &Path) -> Result<String, String> {
  path
    .strip_prefix(root)
    .map_err(|_| "path escapes workspace root".to_string())
    .map(|value| value.to_string_lossy().replace('\\', "/"))
}

fn sanitize_preview(contents: String) -> String {
  let mut lines = Vec::new();

  for line in contents.lines().take(MAX_FILE_PREVIEW_LINES) {
    lines.push(line);
  }

  let joined = lines.join("\n");
  if joined.chars().count() <= MAX_FILE_PREVIEW_CHARS {
    return joined;
  }

  joined.chars().take(MAX_FILE_PREVIEW_CHARS).collect()
}

fn read_workspace_file_payload(root: &Path, file_path: &Path) -> Result<WorkspaceFile, String> {
  let content = fs::read_to_string(file_path)
    .map_err(|err| format!("failed to read file {}: {err}", file_path.display()))?;

  Ok(WorkspaceFile {
    name: file_path
      .file_name()
      .and_then(|value| value.to_str())
      .unwrap_or("unknown")
      .to_string(),
    path: relative_path(file_path, root)?,
    language: infer_language(file_path),
    content: sanitize_preview(content),
  })
}

fn collect_tree(dir: &Path, root: &Path, depth: usize) -> Result<Vec<WorkspaceNode>, String> {
  let mut entries = fs::read_dir(dir)
    .map_err(|err| format!("failed to read directory {}: {err}", dir.display()))?
    .filter_map(|entry| entry.ok())
    .collect::<Vec<_>>();

  entries.sort_by(|left, right| {
    let left_path = left.path();
    let right_path = right.path();
    let left_is_dir = left_path.is_dir();
    let right_is_dir = right_path.is_dir();

    right_is_dir
      .cmp(&left_is_dir)
      .then_with(|| left.file_name().cmp(&right.file_name()))
  });

  let mut nodes = Vec::new();

  for entry in entries.into_iter().take(MAX_ENTRIES_PER_DIR) {
    let path = entry.path();
    let name = entry.file_name().to_string_lossy().to_string();

    if path.is_dir() {
      if should_skip_dir(&name) {
        continue;
      }

      let children = if depth > 0 {
        collect_tree(&path, root, depth - 1)?
      } else {
        Vec::new()
      };

      nodes.push(WorkspaceNode {
        name,
        path: relative_path(&path, root)?,
        is_dir: true,
        children,
      });
      continue;
    }

    if is_code_file(&path) {
      nodes.push(WorkspaceNode {
        name,
        path: relative_path(&path, root)?,
        is_dir: false,
        children: Vec::new(),
      });
    }
  }

  Ok(nodes)
}

fn find_first_code_file(dir: &Path) -> Option<PathBuf> {
  let mut entries = fs::read_dir(dir).ok()?.filter_map(|entry| entry.ok()).collect::<Vec<_>>();

  entries.sort_by(|left, right| {
    let left_path = left.path();
    let right_path = right.path();
    let left_is_dir = left_path.is_dir();
    let right_is_dir = right_path.is_dir();

    right_is_dir
      .cmp(&left_is_dir)
      .then_with(|| left.file_name().cmp(&right.file_name()))
  });

  for entry in entries {
    let path = entry.path();
    let name = entry.file_name().to_string_lossy().to_string();

    if path.is_dir() {
      if should_skip_dir(&name) {
        continue;
      }

      if let Some(found) = find_first_code_file(&path) {
        return Some(found);
      }
      continue;
    }

    if is_code_file(&path) {
      return Some(path);
    }
  }

  None
}

fn build_workspace_payload(root_path: PathBuf) -> Result<WorkspacePayload, String> {
  let canonical_root = fs::canonicalize(&root_path)
    .map_err(|err| format!("failed to resolve workspace {}: {err}", root_path.display()))?;

  if !canonical_root.is_dir() {
    return Err("selected path is not a directory".to_string());
  }

  let tree = collect_tree(&canonical_root, &canonical_root, MAX_TREE_DEPTH)?;
  let active_file = find_first_code_file(&canonical_root)
    .as_deref()
    .map(|path| read_workspace_file_payload(&canonical_root, path))
    .transpose()?;

  Ok(WorkspacePayload {
    root_name: canonical_root
      .file_name()
      .and_then(|value| value.to_str())
      .unwrap_or("workspace")
      .to_string(),
    root_path: canonical_root.to_string_lossy().to_string(),
    tree,
    active_file,
  })
}

fn search_workspace_content_recursive(
  dir: &Path,
  root: &Path,
  query: &str,
  results: &mut Vec<WorkspaceContentSearchFile>,
) -> Result<(), String> {
  if results.len() >= MAX_SEARCH_FILES {
    return Ok(());
  }

  let mut entries = fs::read_dir(dir)
    .map_err(|err| format!("failed to read directory {}: {err}", dir.display()))?
    .filter_map(|entry| entry.ok())
    .collect::<Vec<_>>();

  entries.sort_by(|left, right| left.file_name().cmp(&right.file_name()));

  for entry in entries {
    if results.len() >= MAX_SEARCH_FILES {
      break;
    }

    let path = entry.path();
    let name = entry.file_name().to_string_lossy().to_string();

    if path.is_dir() {
      if should_skip_dir(&name) {
        continue;
      }
      search_workspace_content_recursive(&path, root, query, results)?;
      continue;
    }

    if !is_code_file(&path) {
      continue;
    }

    let Ok(contents) = fs::read_to_string(&path) else {
      continue;
    };

    let mut matches = Vec::new();
    let mut total_matches = 0;

    for (index, line) in contents.lines().enumerate() {
      let lower_line = line.to_lowercase();
      if !lower_line.contains(query) {
        continue;
      }

      total_matches += 1;
      if matches.len() < MAX_MATCHES_PER_FILE {
        matches.push(WorkspaceContentSearchMatch {
          line: index + 1,
          text: line.trim().to_string(),
        });
      }
    }

    if total_matches > 0 {
      results.push(WorkspaceContentSearchFile {
        path: relative_path(&path, root)?,
        name,
        total_matches,
        matches,
      });
    }
  }

  Ok(())
}

fn canonicalize_workspace_root(path: &str) -> Result<PathBuf, String> {
  let canonical = fs::canonicalize(PathBuf::from(path))
    .map_err(|err| format!("failed to resolve workspace {}: {err}", path))?;

  if !canonical.is_dir() {
    return Err("selected path is not a directory".to_string());
  }

  Ok(canonical)
}

fn run_git_command(root: &Path, args: &[&str]) -> Result<String, String> {
  let output = Command::new("git")
    .arg("-C")
    .arg(root)
    .args(args)
    .output()
    .map_err(|err| format!("failed to run git: {err}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    return Err(if stderr.is_empty() {
      "git command failed".to_string()
    } else {
      stderr
    });
  }

  Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn read_workspace_branches(root: &Path) -> Result<WorkspaceBranchPayload, String> {
  let git_dir = root.join(".git");
  if !git_dir.exists() {
    return Ok(WorkspaceBranchPayload {
      has_git: false,
      current_branch: None,
      branches: Vec::new(),
      has_changes: false,
      has_remote: false,
    });
  }

  let current_branch = run_git_command(root, &["branch", "--show-current"]).ok();
  let branches_output = run_git_command(root, &["branch", "--format=%(refname:short)"])?;
  let status_output = run_git_command(root, &["status", "--porcelain"]).unwrap_or_default();
  let remotes_output = run_git_command(root, &["remote"]).unwrap_or_default();
  let mut branches = branches_output
    .lines()
    .map(|line| line.trim())
    .filter(|line| !line.is_empty())
    .map(|line| line.to_string())
    .collect::<Vec<_>>();
  branches.sort();
  branches.dedup();

  Ok(WorkspaceBranchPayload {
    has_git: true,
    current_branch: current_branch.filter(|value| !value.trim().is_empty()),
    branches,
    has_changes: !status_output.trim().is_empty(),
    has_remote: remotes_output.lines().any(|line| !line.trim().is_empty()),
  })
}

fn ensure_file_in_workspace(root: &Path, relative_file_path: &str) -> Result<PathBuf, String> {
  let joined = root.join(relative_file_path);
  let canonical = fs::canonicalize(&joined)
    .map_err(|err| format!("failed to resolve file {}: {err}", joined.display()))?;

  if !canonical.starts_with(root) {
    return Err("requested file is outside the active workspace".to_string());
  }

  if !canonical.is_file() {
    return Err("requested path is not a file".to_string());
  }

  Ok(canonical)
}

#[tauri::command]
async fn load_workspace(
  path: String,
  state: State<'_, WorkspaceState>,
) -> Result<WorkspacePayload, String> {
  let payload = tauri::async_runtime::spawn_blocking(move || build_workspace_payload(PathBuf::from(path)))
    .await
    .map_err(|err| format!("failed to load workspace: {err}"))??;

  let mut current = state
    .0
    .lock()
    .map_err(|_| "failed to store workspace state".to_string())?;
  *current = Some(PathBuf::from(&payload.root_path));

  Ok(payload)
}

#[tauri::command]
async fn read_workspace_file(
  relative_path: String,
  state: State<'_, WorkspaceState>,
) -> Result<WorkspaceFile, String> {
  let root = state
    .0
    .lock()
    .map_err(|_| "failed to access workspace state".to_string())?
    .clone()
    .ok_or_else(|| "no workspace selected".to_string())?;

  tauri::async_runtime::spawn_blocking(move || {
    let file_path = ensure_file_in_workspace(&root, &relative_path)?;
    read_workspace_file_payload(&root, &file_path)
  })
  .await
  .map_err(|err| format!("failed to read workspace file: {err}"))?
}

#[tauri::command]
async fn pick_workspace_directory() -> Result<Option<String>, String> {
  tauri::async_runtime::spawn_blocking(|| {
    Ok(
      rfd::FileDialog::new()
        .set_title("Select a workspace")
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string()),
    )
  })
  .await
  .map_err(|err| format!("failed to open workspace picker: {err}"))?
}

#[tauri::command]
async fn pick_workspace_file() -> Result<Option<PickedWorkspaceFile>, String> {
  tauri::async_runtime::spawn_blocking(|| {
    let selected = rfd::FileDialog::new()
      .set_title("Select a file")
      .pick_file();

    let Some(file_path) = selected else {
      return Ok(None);
    };

    let canonical_file = fs::canonicalize(&file_path)
      .map_err(|err| format!("failed to resolve selected file: {err}"))?;
    let parent = canonical_file
      .parent()
      .ok_or_else(|| "selected file has no parent directory".to_string())?
      .to_path_buf();
    let name = canonical_file
      .file_name()
      .and_then(|value| value.to_str())
      .unwrap_or("file")
      .to_string();

    Ok(Some(PickedWorkspaceFile {
      root_path: parent.to_string_lossy().to_string(),
      relative_path: name.clone(),
      name,
    }))
  })
  .await
  .map_err(|err| format!("failed to open file picker: {err}"))?
}

#[tauri::command]
async fn get_workspace_branches(path: String) -> Result<WorkspaceBranchPayload, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let root = canonicalize_workspace_root(&path)?;
    read_workspace_branches(&root)
  })
  .await
  .map_err(|err| format!("failed to read workspace branches: {err}"))?
}

#[tauri::command]
async fn switch_workspace_branch(
  path: String,
  branch: String,
) -> Result<WorkspaceBranchPayload, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let root = canonicalize_workspace_root(&path)?;
    let trimmed_branch = branch.trim();
    if trimmed_branch.is_empty() {
      return Err("branch name is required".to_string());
    }

    if !root.join(".git").exists() {
      run_git_command(&root, &["init", "-b", trimmed_branch])?;
      return read_workspace_branches(&root);
    }

    let branch_state = read_workspace_branches(&root)?;
    let exists = branch_state.branches.iter().any(|item| item == trimmed_branch);

    if exists {
      run_git_command(&root, &["checkout", trimmed_branch])?;
    } else {
      run_git_command(&root, &["checkout", "-b", trimmed_branch])?;
    }

    read_workspace_branches(&root)
  })
  .await
  .map_err(|err| format!("failed to switch workspace branch: {err}"))?
}

#[tauri::command]
async fn commit_workspace_changes(
  path: String,
  message: String,
) -> Result<WorkspaceBranchPayload, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let root = canonicalize_workspace_root(&path)?;
    let trimmed_message = message.trim();
    if trimmed_message.is_empty() {
      return Err("commit message is required".to_string());
    }

    if !root.join(".git").exists() {
      return Err("git repository is not initialized".to_string());
    }

    run_git_command(&root, &["add", "-A"])?;
    run_git_command(&root, &["commit", "-m", trimmed_message])?;
    read_workspace_branches(&root)
  })
  .await
  .map_err(|err| format!("failed to commit workspace changes: {err}"))?
}

#[tauri::command]
async fn push_workspace_branch(path: String) -> Result<WorkspaceBranchPayload, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let root = canonicalize_workspace_root(&path)?;
    if !root.join(".git").exists() {
      return Err("git repository is not initialized".to_string());
    }

    let state = read_workspace_branches(&root)?;
    let branch = state
      .current_branch
      .clone()
      .ok_or_else(|| "no active branch".to_string())?;

    if !state.has_remote {
      return Err("no remote configured for this repository".to_string());
    }

    run_git_command(&root, &["push", "-u", "origin", &branch])?;
    read_workspace_branches(&root)
  })
  .await
  .map_err(|err| format!("failed to push workspace branch: {err}"))?
}

#[tauri::command]
async fn search_workspace_content(
  path: String,
  query: String,
) -> Result<Vec<WorkspaceContentSearchFile>, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let root = canonicalize_workspace_root(&path)?;
    let normalized_query = query.trim().to_lowercase();
    if normalized_query.is_empty() {
      return Ok(Vec::new());
    }

    let mut results = Vec::new();
    search_workspace_content_recursive(&root, &root, &normalized_query, &mut results)?;
    Ok(results)
  })
  .await
  .map_err(|err| format!("failed to search workspace content: {err}"))?
}

/// Read runtime config from ~/.coding-agent/config.json and ~/.coding-agent/.env
/// and return relevant env vars. The key is NEVER bundled in the app.
#[cfg(not(debug_assertions))]
fn read_runtime_config() -> std::collections::HashMap<String, String> {
  let mut map = std::collections::HashMap::new();
  let home = match std::env::var("HOME") {
    Ok(h) => PathBuf::from(h),
    Err(_) => return map,
  };
  let config_dir = home.join(".coding-agent");

  // 1. Read ~/.coding-agent/config.json  {"openrouterApiKey": "sk-or-..."}
  let config_path = config_dir.join("config.json");
  if let Ok(content) = std::fs::read_to_string(&config_path) {
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
      if let Some(key) = json.get("openrouterApiKey").and_then(|v| v.as_str()) {
        if !key.is_empty() {
          map.insert("OPENROUTER_API_KEY".to_string(), key.to_string());
        }
      }
    }
  }

  // 2. Read ~/.coding-agent/.env  (KEY=value lines, overrides config.json)
  let dot_env_path = config_dir.join(".env");
  if let Ok(content) = std::fs::read_to_string(&dot_env_path) {
    for line in content.lines() {
      let line = line.trim();
      if line.is_empty() || line.starts_with('#') { continue; }
      if let Some((k, v)) = line.split_once('=') {
        let k = k.trim().to_string();
        let v = v.trim().trim_matches('"').trim_matches('\'').to_string();
        if !k.is_empty() && !v.is_empty() {
          map.insert(k, v);
        }
      }
    }
  }

  map
}

/// Find the Node.js (or Bun) runtime binary, checking common macOS/Linux paths.
#[cfg(not(debug_assertions))]
fn find_runtime_binary(resource_dir: &Path) -> Option<PathBuf> {
  let bundled_bun = resource_dir.join("bin").join("bun");
  if bundled_bun.exists() {
    return Some(bundled_bun);
  }

  let candidates = [
    // Homebrew (Apple Silicon)
    "/opt/homebrew/bin/bun",
    "/opt/homebrew/bin/node",
    // Homebrew (Intel)
    "/usr/local/bin/bun",
    "/usr/local/bin/node",
    // System
    "/usr/bin/node",
  ];
  for path in &candidates {
    let p = PathBuf::from(path);
    if p.exists() {
      return Some(p);
    }
  }
  None
}

fn report_startup_failure(message: &str) {
  eprintln!("{message}");
  let _ = MessageDialog::new()
    .set_title("Rovix 无法启动")
    .set_description(message)
    .set_level(MessageLevel::Error)
    .show();
}

/// Claim a free TCP port from the OS (port 0 trick).
#[cfg(not(debug_assertions))]
fn find_free_port() -> u16 {
  TcpListener::bind("127.0.0.1:0")
    .expect("failed to bind port 0 to find free port")
    .local_addr()
    .expect("failed to get local addr")
    .port()
}

/// Busy-poll `addr` until a TCP connection succeeds or `timeout_secs` elapses.
fn wait_for_server(addr: &str, timeout_secs: u64) -> bool {
  let deadline = Instant::now() + Duration::from_secs(timeout_secs);
  while Instant::now() < deadline {
    if TcpStream::connect(addr).is_ok() {
      return true;
    }
    std::thread::sleep(Duration::from_millis(250));
  }
  false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_process::init())
    .manage(WorkspaceState(Mutex::new(None)))
    .invoke_handler(tauri::generate_handler![
      load_workspace,
      read_workspace_file,
      pick_workspace_directory,
      pick_workspace_file,
      get_workspace_branches,
      switch_workspace_branch,
      commit_workspace_changes,
      push_workspace_branch,
      search_workspace_content
    ])
    .setup(|app| {
      #[cfg(desktop)]
      app.handle()
        .plugin(tauri_plugin_updater::Builder::new().build())?;

      // ── Dev build: point directly at the Next.js dev server ──────────────
      #[cfg(debug_assertions)]
      {
        let splash_window = WebviewWindowBuilder::new(
          app,
          "splashscreen",
          WebviewUrl::App("splashscreen.html".into()),
        )
        .title("Rovix")
        .inner_size(400.0, 280.0)
        .center()
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .build()
        .ok();

        if !wait_for_server("127.0.0.1:3000", 30) {
          return Err("Next.js dev server did not become ready within 30 seconds.".into());
        }

        let window = WebviewWindowBuilder::new(
          app,
          "main",
          WebviewUrl::External("http://127.0.0.1:3000".parse().unwrap()),
        )
        .title("Rovix")
        .inner_size(1440.0, 960.0)
        .min_inner_size(1080.0, 720.0)
        .resizable(true)
        .build()?;

        if let Some(sw) = splash_window {
          let _ = sw.close();
        }

        window.open_devtools();
      }

      // ── Production build: spawn Next.js standalone server then open window ─
      #[cfg(not(debug_assertions))]
      {
        let resource_dir = app.path().resource_dir()?;
        let runtime_bin = find_runtime_binary(&resource_dir).ok_or(
          "Could not find a bundled or system Bun/Node runtime. Reinstall the app or install Bun/Node.js, then retry.",
        )?;

        let port = find_free_port();
        let addr = format!("127.0.0.1:{port}");
        let server_url = format!("http://127.0.0.1:{port}");

        let server_dir = resource_dir.join("next-server");
        let server_js = server_dir.join("server.js");
        if !server_js.exists() {
          return Err(format!(
            "Bundled Next.js server is missing: {}",
            server_js.display()
          )
          .into());
        }

        // Show a splash screen immediately while the server starts up so the
        // user always sees something rather than a blank OS window.
        let splash_window = WebviewWindowBuilder::new(
          app,
          "splashscreen",
          WebviewUrl::App("splashscreen.html".into()),
        )
        .title("Rovix")
        .inner_size(400.0, 280.0)
        .center()
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .build()
        .ok();

        // Spawn Next.js standalone server as a detached background process.
        // We intentionally do not keep the Child handle so it stays alive for
        // the duration of the app process (the OS will reap it on exit).
        // Write server logs to ~/Library/Logs/Rovix/server.log
        let log_dir = app.path().home_dir()?
          .join("Library/Logs/Rovix");
        std::fs::create_dir_all(&log_dir)
          .map_err(|e| format!("Failed to create log dir: {e}"))?;
        let log_file = std::fs::OpenOptions::new()
          .create(true)
          .append(true)
          .open(log_dir.join("server.log"))
          .map_err(|e| format!("Failed to open log file: {e}"))?;
        let log_file2 = log_file.try_clone()
          .map_err(|e| format!("Failed to clone log file handle: {e}"))?;

        // Read runtime config (API keys etc.) from ~/.coding-agent/config.json
        let runtime_config = read_runtime_config();

        let mut server_cmd = std::process::Command::new(&runtime_bin);
        server_cmd
          .arg(&server_js)
          .env("PORT", port.to_string())
          .env("HOSTNAME", "127.0.0.1")
          .env("NODE_ENV", "production")
          .current_dir(&server_dir)
          .stdout(log_file)
          .stderr(log_file2);

        for (k, v) in &runtime_config {
          server_cmd.env(k, v);
        }

        // Build a CA bundle that includes corporate proxy certificates from the
        // system keychain so Node.js can verify HTTPS on managed machines
        // (fixes "unable to get local issuer certificate" on corporate networks).
        #[cfg(target_os = "macos")]
        {
          let ca_file = std::env::temp_dir().join("coding-agent-ca.pem");
          let mut pem = String::new();
          // Start with Apple's built-in root bundle
          if let Ok(s) = std::fs::read_to_string("/etc/ssl/cert.pem") {
            pem.push_str(&s);
          }
          // Append any extra certs installed in the System keychain (e.g. corporate CAs)
          if let Ok(out) = Command::new("security")
            .args(["find-certificate", "-a", "-p", "/Library/Keychains/System.keychain"])
            .output()
          {
            if out.status.success() {
              pem.push_str(&String::from_utf8_lossy(&out.stdout));
            }
          }
          if !pem.is_empty() {
            if std::fs::write(&ca_file, &pem).is_ok() {
              server_cmd.env("NODE_EXTRA_CA_CERTS", &ca_file);
            }
          }
        }

        #[cfg(target_os = "linux")]
        {
          let linux_ca_paths = [
            "/etc/ssl/certs/ca-certificates.crt",
            "/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem",
            "/etc/ssl/cert.pem",
          ];
          for ca_path in &linux_ca_paths {
            if Path::new(ca_path).exists() {
              server_cmd.env("NODE_EXTRA_CA_CERTS", ca_path);
              break;
            }
          }
        }

        server_cmd
          .spawn()
          .map_err(|e| format!("Failed to spawn Next.js server: {e}"))?;

        if !wait_for_server(&addr, 30) {
          return Err("Next.js server did not become ready within 30 seconds.".into());
        }

        WebviewWindowBuilder::new(
          app,
          "main",
          WebviewUrl::External(server_url.parse().unwrap()),
        )
        .title("Rovix")
        .inner_size(1440.0, 960.0)
        .min_inner_size(1080.0, 720.0)
        .resizable(true)
        .build()?;

        // Dismiss the splash screen now that the main window is visible.
        if let Some(sw) = splash_window {
          let _ = sw.close();
        }
      }

      Ok(())
    })
    .run(tauri::generate_context!());

  if let Err(error) = app {
    report_startup_failure(&format!("{error}"));
  }
}
