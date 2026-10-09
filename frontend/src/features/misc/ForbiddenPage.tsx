import { ShieldOff } from "lucide-react";
import { Link } from "react-router";

import { Card, EmptyState } from "@/components/ui/display";

export default function ForbiddenPage() {
  return (
    <Card>
      <EmptyState
        icon={ShieldOff}
        title="Ruxsat yo'q"
        description="Bu sahifa sizning rolingiz uchun mavjud emas."
        action={
          <Link to="/" className="font-medium text-brand-700 hover:underline">
            Bosh sahifaga qaytish
          </Link>
        }
      />
    </Card>
  );
}
