import { SearchX } from "lucide-react";
import { Link } from "react-router";

import { Card, EmptyState } from "@/components/ui/display";

export default function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={SearchX}
        title="Sahifa topilmadi"
        description="Siz qidirgan sahifa mavjud emas yoki ko'chirilgan."
        action={
          <Link to="/" className="font-medium text-brand-700 hover:underline">
            Bosh sahifaga qaytish
          </Link>
        }
      />
    </Card>
  );
}
