import { Wordmark } from "@/components/ui/bits";

const PREVIEW = [
  { title: "TI-84 Plus CE", price: "$3/day", tint: "#E9E4FF", rotate: "-6deg", top: "8%", left: "10%" },
  { title: "Lab goggles + coat", price: "$1/day", tint: "#E3F6EC", rotate: "4deg", top: "34%", left: "46%" },
  { title: "Cap & gown, M", price: "$5/day", tint: "#FFF1DC", rotate: "-3deg", top: "60%", left: "14%" },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 pt-safe pb-safe sm:px-10">
        <header className="flex h-16 items-center">
          <Wordmark />
        </header>
        <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-8">{children}</main>
      </div>
      <aside className="relative hidden overflow-hidden bg-[#0B0B0F] lg:block" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(109,74,255,0.45),transparent_55%)]" />
        {PREVIEW.map((card) => (
          <div
            key={card.title}
            className="absolute w-[260px] rounded-[28px] bg-white p-3 shadow-2xl"
            style={{ top: card.top, left: card.left, rotate: card.rotate }}
          >
            <div className="aspect-[4/3] rounded-[20px]" style={{ background: card.tint }} />
            <div className="flex items-center justify-between px-1.5 pt-3 pb-1 text-[#0B0B0F]">
              <span className="font-semibold">{card.title}</span>
              <span className="text-sm font-bold">{card.price}</span>
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
