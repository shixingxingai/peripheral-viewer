use crate::device::{consts, now_ms, DeviceSnapshot, TopologyEdge, TopologyGraph, TopologyNode};
use std::collections::HashMap;

/// 依据 PnP 的 LocationInfo 还原 host -> hub -> device 层级。
/// 拿不到 Hub 信息时直连 host，绝不伪造中间层级；空设备列表只保留 host 根。
pub fn build(devices: &[DeviceSnapshot]) -> TopologyGraph {
    let mut nodes = vec![TopologyNode {
        id: consts::HOST_NODE_ID.to_string(),
        node_type: "host".to_string(),
        label: "本机".to_string(),
        subtitle: Some("Windows".to_string()),
        status: consts::STATUS_OK.to_string(),
        device_id: None,
        parent_id: None,
        meta: Some(serde_json::json!({ "source": "Get-PnpDevice" })),
    }];
    let mut edges: Vec<TopologyEdge> = Vec::new();
    let mut hubs: HashMap<String, String> = HashMap::new();

    // 无 id 的设备无法生成稳定节点，直接跳过。
    for device in devices.iter().filter(|device| !device.id.is_empty()) {
        let parent_id = resolve_parent(device, &mut nodes, &mut edges, &mut hubs);
        let node_id = format!("dev-{}", device.id);
        let status = if device.status.as_str() == consts::STATUS_WARNING {
            consts::STATUS_WARNING
        } else {
            consts::STATUS_OK
        };
        nodes.push(TopologyNode {
            id: node_id.clone(),
            node_type: "device".to_string(),
            label: device.name.clone(),
            subtitle: Some(device.manufacturer.clone()),
            status: status.to_string(),
            device_id: Some(device.id.clone()),
            parent_id: Some(parent_id.clone()),
            meta: Some(serde_json::json!({
                "vid": format!("{:04X}", device.vendor_id),
                "pid": format!("{:04X}", device.product_id),
                "location": device.location.clone(),
            })),
        });
        edges.push(TopologyEdge {
            id: format!("e-{parent_id}-{node_id}"),
            source: parent_id,
            target: node_id,
            status: consts::STATUS_OK.to_string(),
            label: Some(device.connection.protocol.clone()),
        });
    }

    TopologyGraph {
        nodes,
        edges,
        scanned_at: now_ms(),
    }
}

/// 解析父节点：有 Hub 标记则复用 / 新建 hub 节点，否则直连 host。
fn resolve_parent(
    device: &DeviceSnapshot,
    nodes: &mut Vec<TopologyNode>,
    edges: &mut Vec<TopologyEdge>,
    hubs: &mut HashMap<String, String>,
) -> String {
    let Some(label) = device.location.as_deref().and_then(extract_hub_label) else {
        return consts::HOST_NODE_ID.to_string();
    };
    if let Some(existing) = hubs.get(&label) {
        return existing.clone();
    }

    let id = format!("hub-{}", hubs.len() + 1);
    nodes.push(TopologyNode {
        id: id.clone(),
        node_type: "hub".to_string(),
        label: label.clone(),
        subtitle: Some("USB Hub".to_string()),
        status: consts::STATUS_OK.to_string(),
        device_id: None,
        parent_id: Some(consts::HOST_NODE_ID.to_string()),
        meta: Some(serde_json::json!({ "location": device.location.clone() })),
    });
    edges.push(TopologyEdge {
        id: format!("e-{}-{}", consts::HOST_NODE_ID, id),
        source: consts::HOST_NODE_ID.to_string(),
        target: id.clone(),
        status: consts::STATUS_OK.to_string(),
        label: None,
    });
    hubs.insert(label, id.clone());
    id
}

/// 从 LocationInfo 中截取 Hub_#<数字> 作为 hub 标识；无标记或格式不符返回 None。
fn extract_hub_label(location: &str) -> Option<String> {
    const MARKER: &str = "Hub_#";
    let start = location.find(MARKER)? + MARKER.len();
    let digits: String = location
        .get(start..)?
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect();
    if digits.is_empty() {
        None
    } else {
        Some(format!("{MARKER}{digits}"))
    }
}
