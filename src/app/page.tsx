import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  PencilRuler,
  Lightbulb,
  ArrowRight,
  Plus,
  Sparkles,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="space-y-6">
      {/* 欢迎区 */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          👋 欢迎回来，美少女珂
        </h1>
        <p className="text-muted-foreground mt-1">
          今天想做点什么呢？奶油在陪着你喵~
        </p>
      </div>

      {/* 快捷统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              今日日报
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">未生成</div>
            <p className="text-xs text-muted-foreground mt-1">
              点击生成今日工作日报
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              内容创作
            </CardTitle>
            <PencilRuler className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0 篇</div>
            <p className="text-xs text-muted-foreground mt-1">本月已发布内容</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              自研项目
            </CardTitle>
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0 个</div>
            <p className="text-xs text-muted-foreground mt-1">
              进行中的 side project
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              AI 助手
            </CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">就绪</div>
            <p className="text-xs text-muted-foreground mt-1">
              Claude 已准备就绪
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 快捷入口 + 最近动态 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">🚀 快捷入口</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/work/daily-report">
              <Button
                variant="outline"
                className="w-full justify-between h-12 text-base"
              >
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  生成今日日报
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/self-dev/content-creator">
              <Button
                variant="outline"
                className="w-full justify-between h-12 text-base"
              >
                <span className="flex items-center gap-2">
                  <PencilRuler className="h-4 w-4" />
                  创作新内容
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/self-dev/idea-lab">
              <Button
                variant="outline"
                className="w-full justify-between h-12 text-base"
              >
                <span className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4" />
                  记录灵感
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* 最近日报 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">📋 最近日报</CardTitle>
            <Link href="/work/daily-report">
              <Button variant="ghost" size="sm" className="gap-1">
                查看全部 <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">还没有日报记录</p>
              <p className="text-xs mt-1">生成你的第一篇日报吧～</p>
              <Link href="/work/daily-report">
                <Button size="sm" className="mt-3 gap-1">
                  <Plus className="h-3 w-3" />
                  生成日报
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 奶油的小贴士 */}
      <Card className="bg-gradient-to-r from-pink-50 to-orange-50 border-pink-100 dark:from-pink-950 dark:to-orange-950 dark:border-pink-900">
        <CardContent className="py-4 flex items-center gap-3">
          <span className="text-2xl">🐱</span>
          <div>
            <p className="font-medium text-sm">奶油的小贴士</p>
            <p className="text-xs text-muted-foreground">
              试试在工作台下使用「日报生成」功能，把繁琐的日报变成一键搞定！
              后续还会加入 AI 润色功能哦～
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
