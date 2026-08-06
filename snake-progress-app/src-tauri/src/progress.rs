use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// 进度计算结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressInfo {
    /// 进度百分比 (0.0 ~ 100.0)
    pub percent: f64,
    /// 当前状态
    pub status: String,
    /// 剩余工作时间（分钟）
    pub remaining_minutes: i64,
    /// 是否处于午休
    pub is_lunch_break: bool,
    /// 今日工作时间总分钟数（扣除午休）
    pub total_work_minutes: i64,
    /// 已工作分钟数
    pub elapsed_work_minutes: i64,
    /// 当前时间字符串
    pub current_time: String,
    /// 今天是否为工作日
    pub is_workday: bool,
}

/// 获取当前本地时间的 (小时, 分钟, 星期几)
/// 星期几: 1=周一, 2=周二, ..., 7=周日
fn get_current_local_time() -> (u32, u32, u8) {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();

    let total_secs = duration.as_secs();
    // 加上 UTC+8 偏移（中国时区）
    let local_secs = total_secs + 8 * 3600;

    let hours = ((local_secs / 3600) % 24) as u32;
    let minutes = ((local_secs % 3600) / 60) as u32;

    // 计算星期几：从 1970-01-01 (周四) 开始
    // 1970-01-01 是周四，days=0 → weekday=4
    // 公式：(days + 3) % 7 + 1，直接得到 1=周一..7=周日
    let days_since_epoch = local_secs / 86400;
    let weekday = ((days_since_epoch + 3) % 7 + 1) as u8;

    (hours, minutes, weekday)
}

/// 解析 "HH:mm" 为分钟数
fn parse_time_to_minutes(time_str: &str) -> Option<i64> {
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let hours: i64 = parts[0].parse().ok()?;
    let minutes: i64 = parts[1].parse().ok()?;
    Some(hours * 60 + minutes)
}

/// 计算当前工作进度
pub fn calculate_progress(
    work_start: &str,
    work_end: &str,
    lunch_enabled: bool,
    lunch_start: &str,
    lunch_end: &str,
    workdays: &[u8],
) -> ProgressInfo {
    let (current_hours, current_minutes, today_weekday) = get_current_local_time();
    let current_time_str = format!("{:02}:{:02}:{:02}", current_hours, current_minutes, 0);
    let current_total_minutes = (current_hours as i64) * 60 + (current_minutes as i64);

    // 判断工作日
    let is_workday = workdays.contains(&today_weekday);
    if !is_workday {
        return ProgressInfo {
            percent: 0.0,
            status: "NonWorkday".to_string(),
            remaining_minutes: 0,
            is_lunch_break: false,
            total_work_minutes: 0,
            elapsed_work_minutes: 0,
            current_time: current_time_str,
            is_workday: false,
        };
    }

    let start_minutes = parse_time_to_minutes(work_start).unwrap_or(540); // 09:00
    let end_minutes = parse_time_to_minutes(work_end).unwrap_or(1080); // 18:00

    // 计算午休时长（仅计算落在工作时段内的午休时间）
    let lunch_start_minutes = parse_time_to_minutes(lunch_start).unwrap_or(720); // 12:00
    let lunch_end_minutes = parse_time_to_minutes(lunch_end).unwrap_or(780); // 13:00
    let lunch_duration = if lunch_enabled {
        // 午休与工作时段的交集：max(lunch_start, work_start) ~ min(lunch_end, work_end)
        let effective_start = lunch_start_minutes.max(start_minutes);
        let effective_end = lunch_end_minutes.min(end_minutes);
        (effective_end - effective_start).max(0)
    } else {
        0
    };

    // 总工作时间
    let total_minutes = (end_minutes - start_minutes).max(0);
    let total_work_minutes = total_minutes - lunch_duration;

    // 判断是否在午休（午休必须与工作时段有交集，且当前时间在有效午休范围内）
    let in_lunch = lunch_enabled
        && lunch_duration > 0
        && current_total_minutes >= lunch_start_minutes.max(start_minutes)
        && current_total_minutes < lunch_end_minutes.min(end_minutes);

    // 上班前
    if current_total_minutes < start_minutes {
        return ProgressInfo {
            percent: 0.0,
            status: "BeforeWork".to_string(),
            remaining_minutes: total_work_minutes,
            is_lunch_break: false,
            total_work_minutes,
            elapsed_work_minutes: 0,
            current_time: current_time_str,
            is_workday: true,
        };
    }

    // 下班后
    if current_total_minutes >= end_minutes {
        return ProgressInfo {
            percent: 100.0,
            status: "AfterWork".to_string(),
            remaining_minutes: 0,
            is_lunch_break: false,
            total_work_minutes,
            elapsed_work_minutes: total_work_minutes,
            current_time: current_time_str,
            is_workday: true,
        };
    }

    // 午休中
    if in_lunch {
        let elapsed_to_lunch = (lunch_start_minutes.max(start_minutes) - start_minutes).max(0);
        let percent = if total_work_minutes > 0 {
            (elapsed_to_lunch as f64 / total_work_minutes as f64) * 100.0
        } else {
            0.0
        };
        let remaining = total_work_minutes - elapsed_to_lunch;
        return ProgressInfo {
            percent: percent.min(100.0),
            status: "LunchBreak".to_string(),
            remaining_minutes: remaining,
            is_lunch_break: true,
            total_work_minutes,
            elapsed_work_minutes: elapsed_to_lunch,
            current_time: current_time_str,
            is_workday: true,
        };
    }

    // 工作中
    let mut elapsed = current_total_minutes - start_minutes;

    // 如果已过有效午休结束时间，扣除午休时长
    if lunch_enabled && current_total_minutes >= lunch_end_minutes.min(end_minutes) {
        elapsed -= lunch_duration;
    }

    let elapsed = elapsed.max(0);
    let remaining = (total_work_minutes - elapsed).max(0);
    let percent = if total_work_minutes > 0 {
        (elapsed as f64 / total_work_minutes as f64) * 100.0
    } else {
        0.0
    };

    ProgressInfo {
        percent: percent.min(100.0),
        status: "Working".to_string(),
        remaining_minutes: remaining,
        is_lunch_break: false,
        total_work_minutes,
        elapsed_work_minutes: elapsed,
        current_time: current_time_str,
        is_workday: true,
    }
}
