use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Default)]
struct DesktopPreferences {
    minimize_to_tray: AtomicBool,
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

// Only one reviewed shortcut is available to the frontend. No arbitrary
// registration, shell, filesystem or process execution permission is granted.
#[tauri::command]
fn set_quick_capture_hotkey(app: AppHandle, enabled: bool) -> Result<(), String> {
    const SHORTCUT: &str = "Control+Shift+Space";
    let shortcuts = app.global_shortcut();
    if enabled && !shortcuts.is_registered(SHORTCUT) {
        shortcuts
            .on_shortcut(SHORTCUT, |app, _, event| {
                if event.state == ShortcutState::Pressed {
                    show_main(app);
                    let _ = app.emit("desktop:quick-capture", ());
                }
            })
            .map_err(|error| error.to_string())?;
    } else if !enabled && shortcuts.is_registered(SHORTCUT) {
        shortcuts
            .unregister(SHORTCUT)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_minimize_to_tray(preferences: tauri::State<DesktopPreferences>, enabled: bool) {
    preferences
        .minimize_to_tray
        .store(enabled, Ordering::Relaxed);
}

#[tauri::command]
fn quit_application(app: AppHandle) {
    // The UI calls this only after it has flushed local pending saves.
    app.exit(0);
}

pub fn run() {
    tauri::Builder::default()
        .manage(DesktopPreferences::default())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_main(app)
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            set_quick_capture_hotkey,
            set_minimize_to_tray,
            quit_application
        ])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Open VeloraDesk", true, None::<&str>)?;
            let capture = MenuItem::with_id(app, "capture", "Quick capture", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &capture, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .tooltip("VeloraDesk")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "capture" => {
                        show_main(app);
                        let _ = app.emit("desktop:quick-capture", ());
                    }
                    "quit" => {
                        show_main(app);
                        let _ = app.emit("desktop:request-quit", ());
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main"
                    && window
                        .state::<DesktopPreferences>()
                        .minimize_to_tray
                        .load(Ordering::Relaxed)
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Unable to start VeloraDesk");
}
