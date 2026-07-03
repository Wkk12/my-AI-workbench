import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Bot } from "lucide-react";

export default function InsightsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="🤖 AI 洞察"
        description="AI 驱动的数据分析和工作复盘"
      />
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">AI 洞察功能即将上线</p>
          <p className="text-xs mt-1">
            工作复盘分析、效率建议、AI 对话助手
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
