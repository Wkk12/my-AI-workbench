import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/layout/PageHeader";
import { FileText, GitGraph, ArrowRight, Plus } from "lucide-react";

export default function WorkPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="📋 工作"
        description="工作提效工具集 — 日报、Git看板、会议纪要..."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              日报生成
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              一键生成 Git 提交日报，支持本地仓库和 GitLab API
            </p>
            <Link href="/work/daily-report">
              <Button size="sm" className="gap-1">
                进入 <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow opacity-60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitGraph className="h-4 w-4" />
              Git 看板
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              可视化提交趋势，按项目/分支/日期聚合查看
            </p>
            <Button size="sm" variant="outline" disabled className="gap-1">
              即将推出
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow opacity-60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              📝 会议纪要
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              记录会议要点，AI 辅助整理和行动项提取
            </p>
            <Button size="sm" variant="outline" disabled className="gap-1">
              即将推出
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
