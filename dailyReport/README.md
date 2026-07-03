# GitLab 日报生成器

这是一个用于汇总当前 GitLab 账号当天所有可访问项目提交记录的 Python 脚本。

默认行为：
- 使用本地仓库根目录 `F:\RY`
- 检查分支 `dev_wkk`
- 过滤作者 `Wkk12`
- 输出 Markdown 文件 `daily_report_<YYYY-MM-DD>.md`

## 文件

- `gitlab_daily_report.py`：主执行脚本，调用 GitLab API 获取项目和提交记录，并生成日报。

## 使用前准备

1. 安装 Python 3。
2. 在终端中设置 GitLab 访问令牌：

```powershell
$env:GITLAB_TOKEN = "<your_gitlab_token>"
```

或在 Linux/macOS：

```bash
export GITLAB_TOKEN="<your_gitlab_token>"
```

你也可以直接通过命令行参数传递令牌：

```bash
python gitlab_daily_report.py --token <your_gitlab_token>
```

或者创建一个配置文件 `gitlab_daily_report_config.json`，内容如下：

```json
{
  "gitlab_token": "<your_gitlab_token>"
}
```

如果你希望不连接远端 GitLab，而直接读取本地 clone 的仓库，请使用 `--local-root`：

```bash
py gitlab_daily_report.py --local-root F:\path\to\your\local\repos
```

如果你使用的是私有 GitLab 实例，请将 `--gitlab-url` 指向该实例的 URL。

## 运行方式

```bash
python gitlab_daily_report.py
```

默认情况下：

- 使用当前日期
- 输出 Markdown 文件 `daily_report_<YYYY-MM-DD>.md`
- 仅包含当前账号的提交记录

### 示例：指定日期

```bash
python gitlab_daily_report.py --date 2026-07-03
```

### 示例：使用自定义 GitLab 实例

```bash
python gitlab_daily_report.py --gitlab-url https://gitlab.example.com
```

### 示例：导出纯文本格式

```bash
python gitlab_daily_report.py --format text
```

### 示例：只按特定分支和作者提取

```bash
py gitlab_daily_report.py --local-root F:\RY --branch dev_wkk --author Wkk12
```

### 示例：指定日期

```bash
py gitlab_daily_report.py --date 2026-07-03
```

### 示例：指定日期范围

```bash
py gitlab_daily_report.py --from-date 2026-06-29 --to-date 2026-07-03
```

### 示例：扫描远程 GitLab

```bash
py gitlab_daily_report.py --branch dev_wkk --author Wkk12 --token <your_gitlab_token>
```

### 示例：指定输出文件名

```bash
python gitlab_daily_report.py --output my_report.md
```

## 参数说明

- `--date`: 指定日报日期，格式为 `YYYY-MM-DD`。
- `--gitlab-url`: GitLab 基础 URL，默认 `https://gitlab.com`。
- `--format`: 输出格式，支持 `markdown` 或 `text`。
- `--output`: 输出文件路径。
- `--all-authors`: 包含所有提交作者的提交记录，而不是仅当前账号。

## 注意

- 脚本使用 `GITLAB_TOKEN` 进行认证，请确保令牌具有访问项目和读取提交记录的权限。
- 如果项目很多，脚本会自动处理 GitLab API 分页。
