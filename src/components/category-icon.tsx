import {
  BookOpen,
  Calculator,
  Camera,
  FlaskConical,
  Gamepad2,
  Guitar,
  Lamp,
  Laptop,
  Package,
  PartyPopper,
  Shirt,
  Tent,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  calculators: Calculator,
  textbooks: BookOpen,
  electronics: Laptop,
  "lab-gear": FlaskConical,
  dorm: Lamp,
  formal: Shirt,
  outdoors: Tent,
  cameras: Camera,
  instruments: Guitar,
  tools: Wrench,
  gaming: Gamepad2,
  events: PartyPopper,
  other: Package,
};

export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = ICONS[slug] ?? Package;
  return <Icon className={className} />;
}
