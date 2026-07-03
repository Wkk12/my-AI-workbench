"use client";

import { useState, useEffect } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Save, CheckCircle2 } from "lucide-react";
import { DEFAULT_SETTINGS } from "@/lib/constants";

export default function SettingsPage() {
  const [gitlabUrl, setGitlabUrl] = useState(DEFAULT_SETTINGS.gitlab.url);
  const [gitlabToken, setGitlabToken] = useState("");
  const [localRoot, setLocalRoot] = useState(DEFAULT_SETTINGS.gitlab.localRoot);
  const [defaultBranch, setDefaultBranch] = useState(
    DEFAULT_SETTINGS.gitlab.defaultBranch
  );
  const [defaultAuthor, setDefaultAuthor] = useState(
    DEFAULT_SETTINGS.gitlab.defaultAuthor
  );
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.gitlab) {
          setGitlabUrl(data.gitlab.url || DEFAULT_SETTINGS.gitlab.url);
          setGitlabToken(data.gitlab.token || "");
          setLocalRoot(data.gitlab.localRoot || DEFAULT_SETTINGS.gitlab.localRoot);
          setDefaultBranch(
            data.gitlab.defaultBranch || DEFAULT_SETTINGS.gitlab.defaultBranch
          );
          setDefaultAuthor(
            data.gitlab.defaultAuthor || DEFAULT_SETTINGS.gitlab.defaultAuthor
          );
        }
        if (data.claude) {
          setClaudeApiKey(data.claude.apiKey || "");
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gitlab: {
          url: gitlabUrl,
          token: gitlabToken,
          localRoot,
          defaultBranch,
          defaultAuthor,
        },
        claude: {
          apiKey: claudeApiKey,
          model: DEFAULT_SETTINGS.claude.model,
        },
      }),
    });

    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="⚙️ 系统设置"
        description="配置 GitLab、Claude API 等集成"
        action={
          <Button onClick={handleSave} className="gap-1">
            {saved ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> 已保存
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> 保存设置
              </>
            )}
          </Button>
        }
      />

      {/* GitLab 设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            🔗 GitLab 配置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gitlab-url">GitLab URL</Label>
            <Input
              id="gitlab-url"
              value={gitlabUrl}
              onChange={(e) => setGitlabUrl(e.target.value)}
              placeholder="https://gitlab.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gitlab-token">Personal Access Token</Label>
            <Input
              id="gitlab-token"
              type="password"
              value={gitlabToken}
              onChange={(e) => setGitlabToken(e.target.value)}
              placeholder="glpat-xxxx..."
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="local-root">本地仓库根目录</Label>
            <Input
              id="local-root"
              value={localRoot}
              onChange={(e) => setLocalRoot(e.target.value)}
              placeholder="F:\RY"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="default-branch">默认分支</Label>
              <Input
                id="default-branch"
                value={defaultBranch}
                onChange={(e) => setDefaultBranch(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-author">默认作者</Label>
              <Input
                id="default-author"
                value={defaultAuthor}
                onChange={(e) => setDefaultAuthor(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Claude API 设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            🤖 Claude API 配置
            <Badge variant="outline" className="text-xs">
              可选
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="claude-key">API Key</Label>
            <Input
              id="claude-key"
              type="password"
              value={claudeApiKey}
              onChange={(e) => setClaudeApiKey(e.target.value)}
              placeholder="sk-ant-xxxx..."
            />
            <p className="text-xs text-muted-foreground">
              用于 AI 润色日报、生成周报、创意头脑风暴等功能。
              不填则 AI 功能不可用。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
