import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function MeetingNotesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="会议纪要" description="记录和整理会议要点" />
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">会议纪要功能即将上线</p>
          <p className="text-xs mt-1">AI 辅助整理会议重点和行动项</p>
        </CardContent>
      </Card>
    </div>
  );
}
