---
name: schedule-tasks
description: >
  定时任务注册、管理、能力指南。
  Use when: 用户想设定时任务、定期提醒、周期巡检、定时发送内容。
  Not for: 一次性即时操作、已有 builtin 任务的手动触发。
  Output: 注册/管理定时任务，任务到点唤醒猫执行。
triggers:
  - "定时任务"
  - "定时提醒"
  - "定期"
  - "每天"
  - "每小时"
  - "cron"
  - "schedule"
  - "scheduled task"
  - "定时发送"
  - "周期巡检"
  - "网页摘要"
  - "仓库监控"
  - "repo watch"
argument-hint: "[操作: list|create|remove] [模板或任务ID]"
---

# 定时任务管理

猫猫可以注册定时任务，到点自动执行并将结果投递到指定 thread。

## 核心概念

### 模板 (Template)
代码定义的任务蓝图，声明参数 schema + 默认触发频率。当前内置模板：

| 模板 ID | 名称 | 说明 |
|---------|------|------|
| `reminder` | 定时提醒 | 按 cron 唤醒猫处理提醒，猫会根据内容自主行动 |
| `web-digest` | 网页摘要 | 定期抓取网页并生成摘要，JS 重站点自动走浏览器 |
| `repo-activity` | 仓库动态 | 监控 GitHub 仓库的新 Issue/PR |

### 触发器 (Trigger)
- **cron**: 标准 5 段 cron 表达式，如 `0 9 * * *`（每天 9 点）
- **interval**: 固定间隔毫秒数，如 `3600000`（每小时）

### 投递 (Delivery)
任务执行结果会投递到 `deliveryThreadId` 指定的 thread。若模板需要唤醒猫（如 reminder），会通过 invokeTrigger 触发猫的回应。

## 操作流程

### 1. 查看可用模板
```
使用 cat_cafe_list_schedule_templates 查看所有可用模板及其参数
```

### 2. 预览任务配置（推荐）
```
使用 cat_cafe_preview_scheduled_task 验证参数和触发配置
参数：templateId, params, deliveryThreadId, trigger(可选)
```

### 3. 注册定时任务
```
使用 cat_cafe_register_scheduled_task 创建任务
参数：templateId, params, deliveryThreadId, trigger(可选), createdBy(可选)
```

### 4. 删除定时任务
```
使用 cat_cafe_remove_scheduled_task 删除动态任务
参数：taskId
```

## 常见用法示例

### 每天早 9 点提醒站会
```json
{
  "templateId": "reminder",
  "params": { "message": "该站会了！请汇报昨天进展和今天计划" },
  "deliveryThreadId": "<thread-id>",
  "trigger": { "type": "cron", "expression": "0 9 * * 1-5" }
}
```

### 每天摘要 Hacker News
```json
{
  "templateId": "web-digest",
  "params": { "url": "https://news.ycombinator.com", "topic": "AI" },
  "deliveryThreadId": "<thread-id>",
  "trigger": { "type": "cron", "expression": "0 10 * * *" }
}
```

### 每小时监控仓库动态
```json
{
  "templateId": "repo-activity",
  "params": { "repo": "clowder-labs/clowder-ai" },
  "deliveryThreadId": "<thread-id>",
  "trigger": { "type": "interval", "ms": 3600000 }
}
```

## 注意事项

- 只有动态任务（用户创建的）可以删除，builtin 任务不能删除
- 创建前建议先用 preview 验证配置
- cron 表达式错误会在创建时报错
- `deliveryThreadId` 必须是有效的 thread，否则任务执行时 gate 会拒绝
- 全局暂停（governance）会影响所有任务的 effectiveEnabled 状态
