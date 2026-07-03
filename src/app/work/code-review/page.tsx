import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Code2 } from "lucide-react";

export default function CodeReviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="代码 Review" description="AI 辅助代码审查" />
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Code2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">代码 Review 功能即将上线</p>
          <p className="text-xs mt-1">AI 分析变更代码，给出 Review 建议</p>
        </CardContent>
      </Card>
    </div>
  );
}
