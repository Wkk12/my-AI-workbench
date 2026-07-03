import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { GitGraph } from "lucide-react";

export default function GitDashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Git 看板" description="可视化提交趋势" />
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <GitGraph className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Git 提交看板即将上线</p>
          <p className="text-xs mt-1">按项目/分支/日期聚合查看提交趋势</p>
        </CardContent>
      </Card>
    </div>
  );
}
