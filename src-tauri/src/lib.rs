mod battery;
mod device;
mod diagnosis;
mod layout_store;
mod topology;

use crate::device::*;
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{Emitter, Manager, State};

pub struct AppState {
    provider: Box<dyn DeviceProvider>,
    devices: Mutex<Vec<DeviceSnapshot>>,
    events: Mutex<Vec<DeviceEventLog>>,
    diagnostics: Mutex<Vec<Diagnosis>>,
    topology: Mutex<TopologyGraph>,
    first_seen: Mutex<HashMap<String, i64>>,
    layout_path: PathBuf,
}

impl AppState {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            provider: create_provider(),
            devices: Mutex::new(Vec::new()),
            events: Mutex::new(Vec::new()),
            diagnostics: Mutex::new(Vec::new()),
            topology: Mutex::new(topology::build(&[])),
            first_seen: Mutex::new(HashMap::new()),
            layout_path: layout_store::default_path(),
        })
    }
}

/// 用 first_seen 表补齐首次 / 末次见到的时间；只锁这一把表，函数返回即释放。
fn stamp_first_seen(state: &AppState, devices: &mut [DeviceSnapshot], now: i64) {
    let mut seen = state.first_seen.lock().unwrap();
    for device in devices.iter_mut() {
        let first = *seen.entry(device.id.clone()).or_insert(now);
        device.first_seen = first;
        device.last_seen = now;
    }
}

/// 取设备列表快照；锁的生命周期仅限本函数，返回时已释放。
fn snapshot_devices(state: &AppState) -> Vec<DeviceSnapshot> {
    state.devices.lock().unwrap().clone()
}

fn replace_devices(state: &AppState, devices: Vec<DeviceSnapshot>) {
    *state.devices.lock().unwrap() = devices;
}

/// 纯计算：比较新旧列表，判断集合、状态或电量是否变化，不持有任何锁。
///
/// 电量必须参与比较：否则校准保存后即使读出新的百分比，前端也收不到推送，
/// 用户会以为「保存了但没生效」。
fn has_changes(current: &[DeviceSnapshot], next: &[DeviceSnapshot]) -> bool {
    fn signature(device: &DeviceSnapshot) -> (String, Option<u8>, String, bool) {
        let probe = device.battery_probe.as_ref();
        (
            device.status.clone(),
            device.battery,
            probe.map(|item| item.status.clone()).unwrap_or_default(),
            probe.map(|item| item.channel_available).unwrap_or(true),
        )
    }

    let previous: HashMap<String, (String, Option<u8>, String, bool)> = current
        .iter()
        .map(|device| (device.id.clone(), signature(device)))
        .collect();
    current.len() != next.len()
        || next
            .iter()
            .any(|device| previous.get(&device.id).map_or(true, |old| *old != signature(device)))
}

/// 纯计算：依据 diff 结果生成待入队事件；不持有任何锁。
fn build_change_events(
    current: &[DeviceSnapshot],
    next: &[DeviceSnapshot],
    is_first_scan: bool,
    now: i64,
) -> Vec<DeviceEventLog> {
    // 当前列表为空视为首次扫描：只记一条汇总，避免逐设备刷屏。
    if is_first_scan {
        return vec![DeviceEventLog {
            id: format!("evt-scan-{now}"),
            ts: now,
            kind: consts::EVENT_INFO.to_string(),
            device_id: None,
            message: format!("设备扫描完成，发现 {} 个外设", next.len()),
        }];
    }

    let next_ids: HashSet<&str> = next.iter().map(|device| device.id.as_str()).collect();
    let previous_ids: HashSet<&str> = current.iter().map(|device| device.id.as_str()).collect();
    let mut events = Vec::new();
    for device in current {
        if !next_ids.contains(device.id.as_str()) {
            events.push(DeviceEventLog {
                id: format!("evt-off-{}-{}", device.id, now),
                ts: now,
                kind: consts::EVENT_DISCONNECTED.to_string(),
                device_id: Some(device.id.clone()),
                message: format!("{} 已断开", device.name),
            });
        }
    }
    for device in next {
        if !previous_ids.contains(device.id.as_str()) {
            events.push(DeviceEventLog {
                id: format!("evt-on-{}-{}", device.id, now),
                ts: now,
                kind: consts::EVENT_CONNECTED.to_string(),
                device_id: Some(device.id.clone()),
                message: format!("{} 已连接 · {}", device.name, device.connection.protocol),
            });
        }
    }
    events
}

/// 追加事件并裁剪到上限；临界区内不触碰其它锁。
fn append_events(state: &AppState, mut new_events: Vec<DeviceEventLog>) {
    let mut events = state.events.lock().unwrap();
    events.append(&mut new_events);
    if events.len() > consts::MAX_EVENTS {
        let excess = events.len() - consts::MAX_EVENTS;
        events.drain(..excess);
    }
}

/// 推送增量到前端；emit 失败只记日志，不影响已提交的设备状态。
fn emit_devices_changed(app: &tauri::AppHandle, devices: Vec<DeviceSnapshot>) {
    if let Err(error) = app.emit(consts::DEVICES_CHANGED_EVENT, devices) {
        tracing::warn!("推送设备变更事件失败: {}", error);
    }
}

/// 全量枚举 + diff，只在设备集合或状态变化时向前端推送增量。
/// 每把 MutexGuard 都收敛在各自的小函数里，任一作用域内不会同时持有两把锁。
fn apply_devices(
    state: &Arc<AppState>,
    app: &tauri::AppHandle,
    mut next: Vec<DeviceSnapshot>,
) -> bool {
    let now = now_ms();
    stamp_first_seen(state, &mut next, now);

    let current = snapshot_devices(state);
    let is_first_scan = current.is_empty();

    if !has_changes(&current, &next) {
        // 集合与状态都未变化：只刷新列表（含 last_seen），不重建拓扑、不推送。
        replace_devices(state, next);
        return false;
    }

    append_events(state, build_change_events(&current, &next, is_first_scan, now));

    // 派生数据先在无锁状态算好，再分别短暂加锁写入。
    let diagnostics = diagnosis::build(&next);
    let topology = topology::build(&next);
    *state.diagnostics.lock().unwrap() = diagnostics;
    *state.topology.lock().unwrap() = topology;

    replace_devices(state, next.clone());
    emit_devices_changed(app, next);
    true
}

/// 用户态轮询 + 秒级事件收敛。后续可替换为 CM_Register_Notification。
fn start_watcher(app: tauri::AppHandle, state: Arc<AppState>) {
    thread::spawn(move || loop {
        match state.provider.enumerate() {
            Ok(devices) => {
                if apply_devices(&state, &app, devices) {
                    tracing::info!("设备列表已更新（来源：{}）", state.provider.source_name());
                }
            }
            Err(error) => tracing::warn!("设备扫描失败: {:#}", error),
        }
        thread::sleep(Duration::from_secs(3));
    });
}

#[tauri::command]
fn list_devices(state: State<'_, Arc<AppState>>) -> Vec<DeviceSnapshot> {
    snapshot_devices(state.inner())
}

#[tauri::command]
async fn refresh_devices(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<DeviceSnapshot>, String> {
    let devices = state
        .provider
        .enumerate()
        .map_err(|error| format!("设备扫描失败: {}", error))?;
    apply_devices(state.inner(), &app, devices);
    Ok(snapshot_devices(state.inner()))
}

#[tauri::command]
fn get_topology(state: State<'_, Arc<AppState>>) -> TopologyGraph {
    state.topology.lock().unwrap().clone()
}

#[tauri::command]
fn get_diagnostics(state: State<'_, Arc<AppState>>) -> Vec<Diagnosis> {
    state.diagnostics.lock().unwrap().clone()
}

#[tauri::command]
fn get_events(state: State<'_, Arc<AppState>>) -> Vec<DeviceEventLog> {
    let mut events = state.events.lock().unwrap().clone();
    events.sort_by(|a, b| b.ts.cmp(&a.ts));
    events
}

#[tauri::command]
#[allow(unused_variables)]
fn get_telemetry_history(
    device_id: String,
    metric: String,
    hours: i32,
) -> Vec<TelemetryPoint> {
    // 真实遥测需要厂商协议适配器（hidapi / HID++ / OpenRGB）。
    // 未接入时返回空数组，由前端显示「不可用」，绝不用模拟值填充。
    Vec::new()
}

#[tauri::command]
fn save_layout(layout: DeskLayout, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    layout_store::save(&state.layout_path, &layout)
        .map_err(|error| format!("保存布局失败: {}", error))
}

#[tauri::command]
fn load_layout(state: State<'_, Arc<AppState>>) -> Option<DeskLayout> {
    layout_store::load(&state.layout_path)
}

// ---------------------------------------------------------------------------
// 电量校准：运行时覆盖层（L1）+ 只读采样
//
// 全部只读：这里没有向设备写入的入口。校准只改解码配置，不改 transport。
// ---------------------------------------------------------------------------

/// 校准保存后立刻重新枚举并推送：用户点了保存就应该马上看到新值。
///
/// 枚举会拉起 PowerShell（可能数百毫秒到数秒），所以放进 blocking 线程池，
/// 不占用 IPC 的主线程。
async fn refresh_after_calibration(app: &tauri::AppHandle, state: Arc<AppState>) {
    let handle = app.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || match state.provider.enumerate() {
        Ok(devices) => {
            if !apply_devices(&state, &handle, devices) {
                // 电量和状态都没变化时 apply_devices 不会推送，但校准来源可能变了，
                // 这里补一次全量推送，保证界面上的「待校准 / 已校准」同步。
                emit_devices_changed(&handle, snapshot_devices(&state));
            }
        }
        Err(error) => tracing::warn!("校准后刷新设备失败: {:#}", error),
    })
    .await;
}

/// 通道清单：设置页总览与向导第 1 步共用。
#[tauri::command]
async fn battery_channels() -> Result<Vec<battery::BatteryChannel>, String> {
    tauri::async_runtime::spawn_blocking(battery::channels)
        .await
        .map_err(|error| format!("枚举电量通道失败: {error}"))
}

/// 只读采样：连续读取 n 次（默认 3 次），用于判断通道是静态还是动态。
#[tauri::command]
async fn battery_sample(
    probe_id: String,
    times: Option<u8>,
) -> Result<battery::BatterySampleResult, String> {
    let times = times.unwrap_or(3);
    tauri::async_runtime::spawn_blocking(move || battery::sample(&probe_id, times))
        .await
        .map_err(|error| format!("采样任务失败: {error}"))?
}

#[tauri::command]
async fn battery_calibration_state() -> Result<battery::CalibrationState, String> {
    tauri::async_runtime::spawn_blocking(battery::calibration_state)
        .await
        .map_err(|error| format!("读取校准状态失败: {error}"))
}

#[tauri::command]
async fn battery_calibration_save(
    entry: battery::OverlayEntry,
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<battery::CalibrationState, String> {
    let shared: Arc<AppState> = state.inner().clone();
    let next = tauri::async_runtime::spawn_blocking(move || battery::save_calibration(entry))
        .await
        .map_err(|error| format!("保存任务失败: {error}"))??;
    refresh_after_calibration(&app, shared).await;
    Ok(next)
}

#[tauri::command]
async fn battery_calibration_reset(
    probe_id: String,
    serial: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<battery::CalibrationState, String> {
    let shared: Arc<AppState> = state.inner().clone();
    let next = tauri::async_runtime::spawn_blocking(move || {
        battery::reset_calibration(&probe_id, serial.as_deref())
    })
    .await
    .map_err(|error| format!("重置任务失败: {error}"))??;
    refresh_after_calibration(&app, shared).await;
    Ok(next)
}

#[tauri::command]
fn battery_calibration_export() -> Result<String, String> {
    battery::export_calibration()
}

/// 只读扫描：找出没有被任何探针匹配的厂商接口，供「适配新厂商」使用。
#[tauri::command]
async fn battery_scan_unmatched(
    max_report_id: Option<u8>,
) -> Result<Vec<battery::UnmatchedInterface>, String> {
    let upper = max_report_id.unwrap_or(8);
    tauri::async_runtime::spawn_blocking(move || battery::scan_unmatched(upper))
        .await
        .map_err(|error| format!("扫描未适配接口失败: {error}"))?
}

#[tauri::command]
async fn battery_calibration_import(
    json: String,
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<battery::CalibrationState, String> {
    let shared: Arc<AppState> = state.inner().clone();
    let next = tauri::async_runtime::spawn_blocking(move || battery::import_calibration(&json))
        .await
        .map_err(|error| format!("导入任务失败: {error}"))??;
    refresh_after_calibration(&app, shared).await;
    Ok(next)
}

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let state = AppState::new();

    tauri::Builder::default()
        .manage(state.clone())
        .setup(|app| {
            // 预热用户校准覆盖层：启动即确定「用的是内置基线还是用户校准」，
            // 避免首帧拿着默认值再纠正。
            battery::init();
            let shared = app.state::<Arc<AppState>>().inner().clone();
            start_watcher(app.handle().clone(), shared);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_devices,
            refresh_devices,
            get_topology,
            get_diagnostics,
            get_events,
            get_telemetry_history,
            save_layout,
            load_layout,
            battery_channels,
            battery_sample,
            battery_calibration_state,
            battery_calibration_save,
            battery_calibration_reset,
            battery_calibration_export,
            battery_calibration_import,
            battery_scan_unmatched
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用失败");
}
