import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/layout/PageHeader";
import {
  PencilRuler,
  Kanban,
  FlaskConical,
  ArrowRight,
} from "lucide-react";

export default function SelfDevPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="💡 自研"
        description="一人公司 & Vibe Coding — 内容创作、项目管理、创意灵感"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PencilRuler className="h-4 w-4 text-primary" />
              内容创作
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              小红书/抖音内容管理，AI 辅助文案，发布状态追踪
            </p>
            <Link href="/self-dev/content-creator">
              <Button size="sm" className="gap-1">
                进入 <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Kanban className="h-4 w-4 text-primary" />
              项目看板
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              一人公司项目追踪，Kanban 视图，里程碑管理
            </p>
            <Link href="/self-dev/projects">
              <Button size="sm" className="gap-1">
                进入 <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-4 w-4 text-primary" />
              创意实验室
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              灵感速记 + AI 头脑风暴，让创意不再流失
            </p>
            <Link href="/self-dev/idea-lab">
              <Button size="sm" className="gap-1">
                进入 <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
