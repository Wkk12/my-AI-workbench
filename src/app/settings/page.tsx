"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Save, CheckCircle2, Plus, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import type { SparkContact } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

export default function SettingsPage() {
  const [gitlabUrl, setGitlabUrl] = useState(DEFAULT_SETTINGS.gitlab.url);
  const [gitlabToken, setGitlabToken] = useState("");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [qwapiKey, setQwapiKey] = useState("");
  const [saved, setSaved] = useState(false);

  // 抖音配置
  const [dyPhone, setDyPhone] = useState("");
  const [dyPassword, setDyPassword] = useState("");
  const [dySparkMessage, setDySparkMessage] = useState("美少女珂来续火花啦~");
  const [contacts, setContacts] = useState<SparkContact[]>([]);
  const [newContactName, setNewContactName] = useState("");
  const [syncingContacts, setSyncingContacts] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.gitlab) {
          setGitlabUrl(data.gitlab.url || DEFAULT_SETTINGS.gitlab.url);
          setGitlabToken(data.gitlab.token || "");
        }
        if (data.claude) {
          setClaudeApiKey(data.claude.apiKey || "");
          setQwapiKey(data.claude.qwapiKey || "");
        }
        if (data.platforms?.douyin) {
          setDyPhone(data.platforms.douyin.phone || "");
          setDyPassword(data.platforms.douyin.password || "");
          setDySparkMessage(data.platforms.douyin.sparkMessage || "美少女珂来续火花啦~");
        }
      })
      .catch(() => {});

    fetch("/api/settings/douyin/contacts")
      .then((r) => r.json())
      .then((data) => setContacts(data.contacts || []))
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
        },
        claude: {
          apiKey: claudeApiKey,
          model: DEFAULT_SETTINGS.claude.model,
          qwapiKey,
        },
        platforms: {
          douyin: {
            phone: dyPhone,
            password: dyPassword,
            sparkMessage: dySparkMessage,
          },
        },
      }),
    });

    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const saveContacts = useCallback(async (updated: SparkContact[]) => {
    await fetch("/api/settings/douyin/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts: updated }),
    });
    setContacts(updated);
  }, []);

  const handleAddContact = () => {
    if (!newContactName.trim()) return;
    const now = new Date().toISOString();
    const contact: SparkContact = {
      id: uuidv4(),
      name: newContactName.trim(),
      douyinId: "",
      avatar: "",
      selected: false,
      sortOrder: contacts.length,
      createdAt: now,
      updatedAt: now,
    };
    saveContacts([...contacts, contact]);
    setNewContactName("");
  };

  const handleToggleContact = (id: string) => {
    const updated = contacts.map((c) =>
      c.id === id ? { ...c, selected: !c.selected } : c
    );
    saveContacts(updated);
    // 同时保存单个联系人状态
    const toggled = updated.find(c => c.id === id);
    if (toggled) {
      fetch("/api/settings/douyin/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, selected: toggled.selected }),
      }).catch(() => {});
    }
  };

  const handleDeleteContact = (id: string) => {
    saveContacts(contacts.filter((c) => c.id !== id));
  };

  const handleSelectAll = () => {
    const allSelected = contacts.every((c) => c.selected);
    saveContacts(contacts.map((c) => ({ ...c, selected: !allSelected })));
  };

  const handleSyncContacts = async () => {
    setSyncingContacts(true);
    try {
      const res = await fetch("/api/settings/douyin/contacts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepSelected: true }),
      });
      const data = await res.json();
      if (data.success) {
        // 重新加载联系人列表
        const loadRes = await fetch("/api/settings/douyin/contacts");
        const loadData = await loadRes.json();
        if (loadData.contacts) setContacts(loadData.contacts);
      } else if (data.error) {
        console.error(data.error);
      }
    } catch (e) {
      console.error(e);
    }
    setSyncingContacts(false);
  };

  const selectedCount = contacts.filter((c) => c.selected).length;

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="⚙️ 系统设置"
        description="配置 GitLab、Claude API、抖音等集成"
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
          <p className="text-xs text-muted-foreground">
            💡 仓库路径、分支、作者筛选请在「工作 → 日报生成」页面中配置
          </p>
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
              不填则使用下方 QWAPI 作为备选。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* QWAPI Key 设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            🔑 QWAPI 配置
            <Badge variant="outline" className="text-xs">
              推荐
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qwapi-key">API Key</Label>
            <Input
              id="qwapi-key"
              type="password"
              value={qwapiKey}
              onChange={(e) => setQwapiKey(e.target.value)}
              placeholder="sk-xxxx..."
            />
            <p className="text-xs text-muted-foreground">
              用于 AI 文案生成、AI 对话、内容发布等功能。
              支持 DeepSeek 等 OpenAI 兼容接口。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 🎵 抖音配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            🎵 抖音模块
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 账号 */}
          <div>
            <Label className="text-sm font-medium mb-2 block">账号信息</Label>
            <p className="text-xs text-muted-foreground mb-3">
              用于记录抖音账号信息（实际发送通过已登录的浏览器 session）
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dy-phone" className="text-xs">手机号</Label>
                <Input
                  id="dy-phone"
                  value={dyPhone}
                  onChange={(e) => setDyPhone(e.target.value)}
                  placeholder="138xxxx"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dy-password" className="text-xs">密码</Label>
                <Input
                  id="dy-password"
                  type="password"
                  value={dyPassword}
                  onChange={(e) => setDyPassword(e.target.value)}
                  placeholder="******"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* 续火花文案 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">💬 续火花文案</Label>
            <Input
              value={dySparkMessage}
              onChange={(e) => setDySparkMessage(e.target.value)}
              placeholder="美少女珂来续火花啦~"
            />
            <p className="text-xs text-muted-foreground">
              定时任务发送时默认使用此文案，也可在创建任务时单独指定
            </p>
          </div>

          <Separator />

          {/* 续火花联系人 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">
                🔥 续火花联系人
                {selectedCount > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {selectedCount} 人
                  </Badge>
                )}
              </Label>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 h-7 text-xs"
                onClick={handleSyncContacts}
                disabled={syncingContacts}
              >
                {syncingContacts ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                同步联系人
              </Button>
            </div>

            {/* 添加联系人 */}
            <div className="flex gap-2 mb-3">
              <Input
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="昵称（显示用）"
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleAddContact()}
              />
              <Button size="sm" className="h-8 gap-1" onClick={handleAddContact}>
                <Plus className="h-3 w-3" /> 添加
              </Button>
            </div>

            {/* 联系人列表 */}
            {contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                还没有联系人，点击「同步联系人」从浏览器获取，或手动添加
              </p>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={handleSelectAll}
                  >
                    {contacts.every((c) => c.selected) ? "取消全选" : "全选"}
                  </Button>
                </div>
                {contacts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Switch
                        checked={c.selected}
                        onCheckedChange={() => handleToggleContact(c.id)}
                        className="scale-75 shrink-0"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm truncate">{c.name}</span>
                        <Input
                          className="h-6 text-xs mt-0.5 w-32"
                          placeholder="抖音号(选填)"
                          value={c.douyinId || ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setContacts((prev) =>
                              prev.map((x) => (x.id === c.id ? { ...x, douyinId: v } : x))
                            );
                          }}
                          onBlur={() => {
                            // 失去焦点时保存
                            fetch("/api/settings/douyin/contacts", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: c.id, douyinId: c.douyinId }),
                            }).catch(() => {});
                          }}
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => handleDeleteContact(c.id)}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              💡 勾选的联系人将在续火花定时任务中自动发送消息。
              未勾选的联系人也可在创建任务时单独指定。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
