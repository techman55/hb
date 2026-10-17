import Link from "next/link";
import { Users } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { SchoolLogo } from "@/components/school-chip";
import type { ListingCardData } from "@/lib/listings/queries";
import { formatMoney } from "@/lib/utils";

export function ListingCard({ card }: { card: ListingCardData }) {
  return (
    <Link href={`/listing/${card.id}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-[22px] bg-surface-2 ring-1 ring-line">
        {card.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.coverUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted">
            <CategoryIcon slug={card.category} className="size-8" />
          </div>
        )}
        <span className="absolute bottom-2 left-2 rounded-full bg-surface/95 px-2.5 py-1 text-[13px] font-bold shadow-sm backdrop-blur">
          {formatMoney(card.priceCents)}
          <span className="font-medium text-muted">/day</span>
        </span>
        {card.isFriend && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-ink/85 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
            <Users className="size-3" /> Friend
          </span>
        )}
      </div>
      <div className="px-1 pt-2">
        <p className="line-clamp-1 text-[15px] font-semibold leading-tight">{card.title}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
          {card.otherCampus ? (
            <>
              <SchoolLogo school={card.school} size={16} />
              <span className="truncate">
                {card.school.shortName}
                {card.distanceMi != null && ` · ${card.distanceMi} mi`}
              </span>
            </>
          ) : (
            <span className="truncate">{card.owner.name ?? "A student"} · up to {card.maxDays}d</span>
          )}
        </p>
      </div>
    </Link>
  );
}

export function ListingGrid({ cards }: { cards: ListingCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
      {cards.map((c) => (
        <ListingCard key={c.id} card={c} />
      ))}
    </div>
  );
}
