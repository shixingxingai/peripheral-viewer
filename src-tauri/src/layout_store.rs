use crate::device::DeskLayout;
use anyhow::Context;
use std::{fs, path::PathBuf};

/// 布局先落单文件 JSON；接入 SQLite 后可整体替换实现，前端契约不变。
pub fn default_path() -> PathBuf {
    #[cfg(windows)]
    {
        // APPDATA 缺失或为空时回退到临时目录，避免落到进程工作目录。
        if let Some(appdata) = std::env::var("APPDATA")
            .ok()
            .filter(|value| !value.trim().is_empty())
        {
            return PathBuf::from(appdata)
                .join("peripheral-viewer")
                .join("layout.json");
        }
    }
    std::env::temp_dir()
        .join("peripheral-viewer")
        .join("layout.json")
}

pub fn save(path: &PathBuf, layout: &DeskLayout) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("创建布局目录失败: {}", parent.display()))?;
    }
    let json = serde_json::to_string_pretty(layout).context("序列化布局失败")?;
    fs::write(path, json)
        .with_context(|| format!("写入布局文件失败: {}", path.display()))?;
    Ok(())
}

/// 读取布局：文件不存在或为空属于「未保存」；读取 / 非 UTF-8 / 反序列化失败
/// 均记录明确上下文后按未保存处理，绝不把损坏文件伪装成有效数据。
pub fn load(path: &PathBuf) -> Option<DeskLayout> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
        Err(error) => {
            tracing::warn!("读取布局文件失败（{}）: {}", path.display(), error);
            return None;
        }
    };
    if bytes.is_empty() {
        tracing::warn!("布局文件为空（{}），按未保存处理", path.display());
        return None;
    }
    let text = match String::from_utf8(bytes) {
        Ok(text) => text,
        Err(error) => {
            tracing::warn!("布局文件不是有效 UTF-8（{}）: {}", path.display(), error);
            return None;
        }
    };
    match serde_json::from_str::<DeskLayout>(&text) {
        Ok(layout) => Some(layout),
        Err(error) => {
            tracing::warn!("解析布局文件失败（{}）: {}", path.display(), error);
            None
        }
    }
}
