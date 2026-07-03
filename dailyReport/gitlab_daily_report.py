#!/usr/bin/env python3

import argparse
import datetime
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate a GitLab daily commit report for the current account."
    )
    parser.add_argument(
        "--date",
        help="Report date in YYYY-MM-DD format. Default: today.",
        default=None,
    )
    parser.add_argument(
        "--gitlab-url",
        help="GitLab base URL or API base URL. Default: https://gitlab.com",
        default="https://gitlab.com",
    )
    parser.add_argument(
        "--format",
        help="Output format: markdown or text.",
        choices=["markdown", "text"],
        default="markdown",
    )
    parser.add_argument(
        "--output",
        help="Output file path. Default: daily_report_<date>.md or .txt.",
        default=None,
    )
    parser.add_argument(
        "--token",
        help="GitLab personal access token. If omitted, the script will look for environment variables or a config file.",
        default=None,
    )
    parser.add_argument(
        "--config",
        help="Path to a JSON config file containing {\"gitlab_token\": \"...\"}.",
        default="gitlab_daily_report_config.json",
    )
    parser.add_argument(
        "--local-root",
        help="Path to a local directory containing cloned Git repositories. If set, the script uses local repositories instead of GitLab API.",
        default="F:\\RY",
    )
    parser.add_argument(
        "--branch",
        help="Git branch to inspect. Default: dev_wkk.",
        default="dev_wkk",
    )
    parser.add_argument(
        "--author",
        help="Commit author name to filter. Default: Wkk12.",
        default="Wkk12",
    )
    parser.add_argument(
        "--from-date",
        help="Start date for the report range in YYYY-MM-DD format.",
        default=None,
    )
    parser.add_argument(
        "--to-date",
        help="End date for the report range in YYYY-MM-DD format.",
        default=None,
    )
    parser.add_argument(
        "--all-authors",
        action="store_true",
        help="Include commits from all authors instead of filtering by author.",
    )
    return parser.parse_args()


def normalize_api_url(url):
    if url.endswith("/api/v4"):
        return url.rstrip("/")
    url = url.rstrip("/")
    return url + "/api/v4"


def load_config_token(config_path):
    if not config_path:
        return None
    try:
        with open(config_path, "r", encoding="utf-8") as config_file:
            config = json.load(config_file)
            token = config.get("gitlab_token") or config.get("token")
            return token
    except FileNotFoundError:
        return None
    except json.JSONDecodeError:
        sys.exit(f"Invalid JSON in config file: {config_path}")


def get_token(args):
    if args.token:
        return args.token

    token = os.environ.get("GITLAB_TOKEN") or os.environ.get("GITLAB_PERSONAL_ACCESS_TOKEN")
    if token:
        return token

    token = load_config_token(args.config)
    if token:
        return token

    sys.exit(
        "Missing GitLab token. Provide one with --token, set the GITLAB_TOKEN environment variable, or create a config file."
    )


def find_local_repos(root_dir):
    root_dir = os.path.abspath(root_dir)
    repos = []
    for dirpath, dirnames, filenames in os.walk(root_dir):
        if ".git" in dirnames:
            repos.append(dirpath)
            dirnames.remove(".git")
    return sorted(repos)


def get_local_commits(repo_path, since, until, branch):
    git_cmd = [
        "git",
        "-C",
        repo_path,
        "log",
        branch,
        "--since",
        since,
        "--until",
        until,
        "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%s%x1e",
        "--date=iso",
    ]
    try:
        result = subprocess.check_output(git_cmd, stderr=subprocess.STDOUT)
    except subprocess.CalledProcessError as exc:
        output = exc.output.decode("utf-8", errors="ignore")
        if "does not have any commits yet" in output or "unknown revision or path" in output:
            return []
        sys.exit(
            f"Git command failed in {repo_path}: {output}"
        )

    text = result.decode("utf-8", errors="replace")
    commits = []
    for item in text.strip("\x1e\n").split("\x1e"):
        if not item.strip():
            continue
        parts = item.strip().split("\x1f")
        if len(parts) < 6:
            continue
        commits.append(
            {
                "id": parts[0],
                "short_id": parts[1],
                "author_name": parts[2],
                "author_email": parts[3],
                "created_at": parts[4],
                "title": parts[5],
            }
        )
    return commits


def build_url(base_url, path, params=None):
    if path.startswith("/"):
        path = path[1:]
    url = f"{base_url.rstrip('/')}/{path}"
    if params:
        query = urllib.parse.urlencode(params)
        url = f"{url}?{query}"
    return url


def api_get(url, token):
    request = urllib.request.Request(
        url,
        headers={
            "PRIVATE-TOKEN": token,
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read()
            text = raw.decode("utf-8")
            data = json.loads(text) if text else None
            headers = {k.lower(): v for k, v in response.getheaders()}
            return data, headers
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        sys.exit(
            f"GitLab API error {exc.code}: {exc.reason}\nURL: {url}\n{body}"
        )
    except urllib.error.URLError as exc:
        sys.exit(f"Network error: {exc.reason}\nURL: {url}")


def fetch_all_pages(base_url, path, token, params=None):
    params = dict(params or {})
    params["per_page"] = 100
    page = 1
    all_items = []

    while True:
        params["page"] = page
        url = build_url(base_url, path, params)
        data, headers = api_get(url, token)
        if not isinstance(data, list):
            sys.exit(f"Expected list response from GitLab API at {url}")

        all_items.extend(data)
        next_page = headers.get("x-next-page")
        if next_page and next_page.strip():
            page = int(next_page.strip())
            continue

        link = headers.get("link")
        if link and 'rel="next"' in link:
            page += 1
            continue
        break

    return all_items


def get_current_user(base_url, token):
    url = build_url(base_url, "/user")
    data, _ = api_get(url, token)
    if not isinstance(data, dict):
        sys.exit("Unexpected response structure for current user data.")
    return {
        "username": (data.get("username") or "").strip(),
        "name": (data.get("name") or "").strip(),
        "email": (data.get("email") or "").strip(),
    }


def get_projects(base_url, token):
    return fetch_all_pages(
        base_url,
        "/projects",
        token,
        {"membership": "true", "order_by": "last_activity_at", "sort": "desc", "simple": "true"},
    )


def parse_date(value, label):
    try:
        return datetime.datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        sys.exit(f"无效的{label}格式，请使用 YYYY-MM-DD。")


def get_date_list(args):
    if args.from_date or args.to_date:
        start_date = parse_date(args.from_date, "起始日期") if args.from_date else parse_date(args.to_date, "结束日期")
        end_date = parse_date(args.to_date, "结束日期") if args.to_date else start_date
        if start_date > end_date:
            sys.exit("起始日期不能晚于结束日期。")
        return [start_date + datetime.timedelta(days=i) for i in range((end_date - start_date).days + 1)]

    if args.date:
        return [parse_date(args.date, "日期")]

    return [datetime.date.today()]


def get_commits(base_url, token, project_id, since, until, branch):
    quoted_id = urllib.parse.quote(str(project_id), safe="")
    path = f"/projects/{quoted_id}/repository/commits"
    return fetch_all_pages(
        base_url,
        path,
        token,
        {"ref_name": branch, "since": since, "until": until},
    )


def commit_matches_author(commit, author=None, current_user=None):
    if author:
        author_value = author.strip().lower()
        author_email = (commit.get("author_email") or "").strip().lower()
        author_name = (commit.get("author_name") or "").strip().lower()
        if author_name == author_value:
            return True
        if author_value in author_email:
            return True
    if current_user:
        author_email = (commit.get("author_email") or "").strip().lower()
        author_name = (commit.get("author_name") or "").strip().lower()
        if current_user.get("email") and author_email == current_user["email"].lower():
            return True
        if current_user.get("username") and author_name == current_user["username"].lower():
            return True
        if current_user.get("name") and author_name == current_user["name"].lower():
            return True
    return False


def format_markdown(report_date, current_user, grouped_commits):
    lines = []
    if not grouped_commits:
        return "当天没有匹配的提交记录。"

    for project_name, commits in grouped_commits.items():
        lines.append(f"## {project_name}")
        for idx, commit in enumerate(commits, start=1):
            title = commit.get("title") or "(无提交信息)"
            lines.append(f"{idx}. {title}")
        lines.append("")
    return "\n".join(lines)


def format_text(report_date, current_user, grouped_commits):
    lines = []
    if not grouped_commits:
        return "当天没有匹配的提交记录。"

    for project_name, commits in grouped_commits.items():
        lines.append(f"{project_name}")
        for idx, commit in enumerate(commits, start=1):
            title = commit.get("title") or "(无提交信息)"
            lines.append(f"{idx}. {title}")
        lines.append("")
    return "\n".join(lines)


def main():
    args = parse_args()
    report_dates = get_date_list(args)
    default_suffix = "md" if args.format == "markdown" else "txt"
    current_user = None

    if args.local_root:
        local_root = os.path.abspath(args.local_root)
        if not os.path.isdir(local_root):
            sys.exit(f"本地仓库根目录不存在：{local_root}")

        repos = find_local_repos(local_root)
        if not repos:
            sys.exit(f"未在本地根目录中找到 Git 仓库：{local_root}")
    else:
        token = get_token(args)
        api_base = normalize_api_url(args.gitlab_url)
        current_user = get_current_user(api_base, token)
        projects = get_projects(api_base, token)
        if not projects:
            sys.exit("未找到任何可访问的 GitLab 项目。请检查令牌权限和 GitLab URL。")

    if len(report_dates) > 1 and args.output:
        sys.exit("--output 只能用于单个日期报告。请不要在日期区间模式下指定输出文件。")

    for report_date in report_dates:
        since = f"{report_date.isoformat()}T00:00:00Z"
        until = f"{report_date.isoformat()}T23:59:59Z"
        grouped_commits = {}

        if args.local_root:
            for repo_path in repos:
                commits = get_local_commits(repo_path, since, until, args.branch)
                if not args.all_authors:
                    commits = [c for c in commits if commit_matches_author(c, author=args.author)]
                if commits:
                    project_name = os.path.relpath(repo_path, local_root)
                    grouped_commits[project_name] = commits
        else:
            for project in projects:
                project_name = project.get("path_with_namespace") or project.get("name") or str(project.get("id"))
                project_id = project.get("id")
                if project_id is None:
                    continue

                commits = get_commits(api_base, token, project_id, since, until, args.branch)
                if not args.all_authors:
                    commits = [c for c in commits if commit_matches_author(c, author=args.author)]
                if commits:
                    grouped_commits[project_name] = commits

        output_text = format_markdown(
            report_date.isoformat(),
            current_user or {"username": "", "name": "", "email": ""},
            grouped_commits,
        ) if args.format == "markdown" else format_text(
            report_date.isoformat(),
            current_user or {"username": "", "name": "", "email": ""},
            grouped_commits,
        )

        output_path = args.output or f"daily_report_{report_date.isoformat()}.{default_suffix}"
        with open(output_path, "w", encoding="utf-8") as output_file:
            output_file.write(output_text)

        print(f"报告已生成: {output_path}")
        print(f"日期: {report_date.isoformat()}，项目数量: {len(grouped_commits)}，提交数量: {sum(len(c) for c in grouped_commits.values())}")


if __name__ == "__main__":
    main()
